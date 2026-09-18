#!/usr/bin/env bash
#
# scripts/review/grok-review.sh: independent code review by the Grok CLI, run locally, before a merge or a push.
#
# Why this exists (docs/review-tools.md). On 2026-09-18 Grok "cancelled" on 8 of 13 reviews here: the reviewer
# had to fetch the diff through its shell tool, with every tool and every MCP server enabled. This script
# pastes the diff INTO the prompt, adds an impact map (importers, Nuxt auto-imports, changed exported symbols,
# npm script names, /api routes; scripts/review/impact-map.py), runs Grok read-only on the local checkout, and
# takes a strict JSON verdict. The model that writes the code is never the model that reviews it.
#
# Usage:
#   npm run review                                                   # working tree: git diff HEAD
#   npm run review -- --files content/unfurl.ts server/api           # working tree, scoped (a block)
#   npm run review -- --range main..wp/11-x --files app/components/editor --title "..."   # a block of a branch
#   npm run review -- --range origin/main..HEAD --scope pr --title "..." --intent body.md  # the whole branch
#   npm run review -- --dry-run                                      # print the prompt, call nothing
#
# Options:
#   --range <a>..<b>     Review committed changes (git diff a..b). Default: git diff HEAD (working tree).
#   --files <p> ...      Restrict the diff to these paths (repeatable; stops at the next --option).
#   --scope block|pr     Label for the reviewer and the trailer (default: block without --range, pr with).
#   --title <t>          Intent title (default: last commit subject, or "working tree").
#   --intent <file>      Intent body file (default: the PR body from `gh pr view` when the branch has a PR,
#                        else the commit messages of the range, else none).
#   --effort <e>         Grok reasoning effort (default: medium; high doubled the wall time in reasoning alone).
#   --max-turns <n>      Hard cap of Grok agentic turns (default: 10). The prompt names a BUDGET of n-4 turns
#                        (at least 2): grok 1.0.30 exits 1 with "max turns reached" and no verdict when the cap
#                        is hit, and the model spends every turn it is told it has. The 4 spare turns are the
#                        room to overshoot and still write the verdict.
#   --timeout <min>      Watchdog: kill the Grok call after N minutes and exit 3 (default: 6). macOS has no
#                        `timeout`, so the script polls the child itself.
#   --force              Ignore the cache and call Grok again.
#   --dry-run            Print the rendered prompt and exit 0. No Grok call.
#   --ledger             Append the findings to scripts/review/findings-ledger.jsonl (fresh verdicts only; a
#                        cache hit appends nothing, and the ledger itself refuses a duplicate source+branch+id).
#   --branch <name>      Branch recorded in the ledger (default: the head of --range, else the current branch).
#   --pr <n>             PR number recorded in the ledger (optional; this repo mostly merges without PRs).
#   --out <json>         Where to write the full verdict (default: the cache entry).
#
# Exit codes:  0 PASS · 1 FAIL (a critical or warning exists) · 2 usage / empty diff · 3 Grok returned no valid verdict.
#
# Machine-greppable trailer (last line on stdout):
#   grok-review: scope=… files=N diff_chars=N cached=0|1 turns=N elapsed_s=N tokens_in=N tokens_out=N critical=N warning=N suggestion=N verdict=PASS|FAIL
#
# Blind-run guard: a run that did not obtain a schema-valid verdict exits 3. It never reports green.
# Budget: effort medium, 6 turns named in the prompt (cap 10), callers pre-read into the prompt, watchdog. Aim: 2 min per block, 4 min per branch.
# Cache: <git common dir>/grok-review/<sha256(diff+prompt+schema)>.json. Same blobs, no call.
# Tools handed to Grok: read_file, grep, list_dir only; no subagents; MCP, shell, edit, write and web DENIED by
# permission rule (the allowlist alone keeps the MCP servers loaded); cwd = repo root. Suite: grok-review.test.sh.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROMPT_TEMPLATE="$SCRIPT_DIR/grok-review.prompt.md"
SCHEMA_FILE="$SCRIPT_DIR/grok-review.schema.json"
IMPACT_MAP="$SCRIPT_DIR/impact-map.py"
LEDGER="$SCRIPT_DIR/findings-ledger.sh"
MAX_DIFF_CHARS=150000

RANGE=""
FILES=()
SCOPE=""
TITLE=""
INTENT_FILE=""
EFFORT="medium"
MAX_TURNS=10
TURN_HEADROOM=4
TIMEOUT_MIN=6
FORCE=0
DRY_RUN=0
TO_LEDGER=0
PR_NUMBER=""
BRANCH=""
OUT=""

usage() { sed -n '2,46p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

while [[ $# -gt 0 ]]; do
    case "$1" in
        --range) RANGE="${2:-}"; shift 2 ;;
        --files)
            shift
            while [[ $# -gt 0 && "$1" != --* ]]; do FILES+=("$1"); shift; done
            ;;
        --scope) SCOPE="${2:-}"; shift 2 ;;
        --title) TITLE="${2:-}"; shift 2 ;;
        --intent) INTENT_FILE="${2:-}"; shift 2 ;;
        --effort) EFFORT="${2:-}"; shift 2 ;;
        --max-turns) MAX_TURNS="${2:-}"; shift 2 ;;
        --timeout) TIMEOUT_MIN="${2:-}"; shift 2 ;;
        --force) FORCE=1; shift ;;
        --dry-run) DRY_RUN=1; shift ;;
        --ledger) TO_LEDGER=1; shift ;;
        --pr) PR_NUMBER="${2:-}"; shift 2 ;;
        --branch) BRANCH="${2:-}"; shift 2 ;;
        --out) OUT="${2:-}"; shift 2 ;;
        -h|--help) usage; exit 0 ;;
        *) echo "grok-review: unknown option $1" >&2; usage >&2; exit 2 ;;
    esac
done

for tool in git python3; do
    command -v "$tool" >/dev/null 2>&1 || { echo "grok-review: $tool not found" >&2; exit 2; }
done
[[ -f "$PROMPT_TEMPLATE" && -f "$SCHEMA_FILE" && -f "$IMPACT_MAP" ]] || { echo "grok-review: prompt template, schema or impact-map.py missing next to the script" >&2; exit 2; }

REPO="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "grok-review: not inside a git checkout" >&2; exit 2; }
cd "$REPO"

[[ -n "$SCOPE" ]] || SCOPE=$([[ -n "$RANGE" ]] && echo pr || echo block)
case "$SCOPE" in block|pr) ;; *) echo "grok-review: --scope must be block or pr" >&2; exit 2 ;; esac

# ── 1. The diff ─────────────────────────────────────────────────────────────────────────────────
WORK="$(mktemp -d "${TMPDIR:-/tmp}/grok-review.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

if [[ -n "$RANGE" ]]; then
    git diff "$RANGE" -- ${FILES[@]+"${FILES[@]}"} > "$WORK/diff" 2>"$WORK/diff.err" || { cat "$WORK/diff.err" >&2; echo "grok-review: git diff $RANGE failed" >&2; exit 2; }
    git diff --name-only "$RANGE" -- ${FILES[@]+"${FILES[@]}"} > "$WORK/files"
else
    git diff HEAD -- ${FILES[@]+"${FILES[@]}"} > "$WORK/diff"
    git diff --name-only HEAD -- ${FILES[@]+"${FILES[@]}"} > "$WORK/files"
    # A block reviewed before its commit has NEW files that `git diff HEAD` cannot see. Add every
    # untracked, non-ignored file in scope as a creation diff, so a new component or route is reviewed too.
    while IFS= read -r new_file; do
        [[ -n "$new_file" && -f "$new_file" ]] || continue
        git diff --no-index -- /dev/null "$new_file" >> "$WORK/diff" || true
        echo "$new_file" >> "$WORK/files"
    done < <(git ls-files --others --exclude-standard -- ${FILES[@]+"${FILES[@]}"})
fi

DIFF_CHARS=$(wc -c < "$WORK/diff" | tr -d ' ')
FILE_COUNT=$(grep -c . "$WORK/files" || true)
if [[ "$DIFF_CHARS" -eq 0 ]]; then
    echo "grok-review: empty diff, nothing to review (range='${RANGE:-HEAD}', files=${FILES[@]+${#FILES[@]}})" >&2
    echo "grok-review: scope=$SCOPE files=0 diff_chars=0 cached=0 turns=0 elapsed_s=0 tokens_in=0 tokens_out=0 critical=0 warning=0 suggestion=0 verdict=EMPTY"
    exit 2
fi
if [[ "$DIFF_CHARS" -gt "$MAX_DIFF_CHARS" ]]; then
    echo "grok-review: diff is $DIFF_CHARS chars (> $MAX_DIFF_CHARS). Review it per block with --files, or split the branch." >&2
    exit 2
fi

# ── 2. Intent ───────────────────────────────────────────────────────────────────────────────────
if [[ -z "$TITLE" ]]; then
    if [[ -n "$RANGE" ]]; then TITLE="$(git log -1 --format=%s "${RANGE##*..}" 2>/dev/null || echo "range $RANGE")"; else TITLE="working tree on $(git rev-parse --abbrev-ref HEAD)"; fi
fi
if [[ -n "$INTENT_FILE" ]]; then
    [[ -f "$INTENT_FILE" ]] || { echo "grok-review: intent file not found: $INTENT_FILE" >&2; exit 2; }
    cp "$INTENT_FILE" "$WORK/intent"
elif [[ -n "$RANGE" ]] && command -v gh >/dev/null 2>&1 && gh pr view --json body --jq .body > "$WORK/intent" 2>/dev/null && [[ -s "$WORK/intent" ]]; then
    :
elif [[ -n "$RANGE" ]] && git log --no-merges --format='- %s%n%w(0,2,2)%b' "$RANGE" -- ${FILES[@]+"${FILES[@]}"} 2>/dev/null | grep -v '^[[:space:]]*$' | head -60 > "$WORK/intent" && [[ -s "$WORK/intent" ]]; then
    # This repo merges branches without PRs: the commit messages of the range are the author's description.
    :
else
    echo "(no description supplied)" > "$WORK/intent"
fi

# ── 3. Impact map: importers, Nuxt auto-imports, changed symbols, dynamic names (+ the code graph if any) ──
# `graphify affected` reads graphify-out/graph.json. The graph lives only in the main checkout (it is
# gitignored), so a scratch worktree borrows the main worktree's copy.
GRAPH=""
for candidate in "$REPO/graphify-out/graph.json" "$(git worktree list --porcelain | awk '/^worktree /{print $2; exit}')/graphify-out/graph.json"; do
    [[ -f "$candidate" ]] && { GRAPH="$candidate"; break; }
done
{
    # Grok and the impact map read the CHECKOUT. A range whose head is not the checkout can differ from it.
    if [[ -n "$RANGE" ]]; then
        stale=$(git diff --name-only "${RANGE##*..}" -- $(tr '\n' ' ' < "$WORK/files") 2>/dev/null | head -10 | tr '\n' ' ' || true)
        if [[ -n "$stale" ]]; then
            echo "Note: the checkout differs from \`${RANGE##*..}\` for: $stale. Files you open show the checkout, the diff shows the range."
            echo "grok-review: note: the checkout differs from ${RANGE##*..} for: $stale" >&2
        fi
    fi
    python3 "$IMPACT_MAP" --repo "$REPO" --diff "$WORK/diff" --files "$WORK/files" ${GRAPH:+--graph "$GRAPH"} \
        || echo "Impact map: impact-map.py failed. Grep for the changed symbols yourself."
} > "$WORK/impact"

# ── 4. Render the prompt ───────────────────────────────────────────────────────────────────────
SCOPE_TEXT="block: one task block of a larger change; judge it on its own files but open its callers."
[[ "$SCOPE" == pr ]] && SCOPE_TEXT="pr: the whole branch before the push or the merge; also judge how the blocks fit together (editor ↔ server route, schema ↔ public profile, script ↔ build hook)."

case "$MAX_TURNS" in ''|*[!0-9]*) echo "grok-review: --max-turns must be a number" >&2; exit 2 ;; esac
TURN_BUDGET=$(( MAX_TURNS - TURN_HEADROOM )); [[ "$TURN_BUDGET" -ge 2 ]] || TURN_BUDGET=2

python3 - "$PROMPT_TEMPLATE" "$WORK/prompt" "$SCOPE_TEXT" "$TITLE" "$WORK/intent" "$WORK/impact" "$WORK/diff" "$TURN_BUDGET" <<'PY'
import sys
tpl, out, scope, title, intent_f, impact_f, diff_f, turns = sys.argv[1:9]
text = open(tpl, encoding="utf-8").read()
subs = {
    "{{SCOPE}}": scope,
    "{{TURNS}}": turns,
    "{{TITLE}}": title,
    "{{INTENT}}": open(intent_f, encoding="utf-8", errors="replace").read().strip(),
    "{{IMPACT}}": open(impact_f, encoding="utf-8", errors="replace").read().strip(),
    "{{DIFF}}": open(diff_f, encoding="utf-8", errors="replace").read().rstrip("\n"),
}
for k in subs:
    assert k in text, f"placeholder {k} missing from template"
# One pass, so a placeholder-looking string inside the diff is never substituted.
import re
text = re.sub("|".join(re.escape(k) for k in subs), lambda m: subs[m.group(0)], text)
open(out, "w", encoding="utf-8").write(text)
PY

if [[ "$DRY_RUN" -eq 1 ]]; then
    cat "$WORK/prompt"
    echo
    echo "grok-review: scope=$SCOPE files=$FILE_COUNT diff_chars=$DIFF_CHARS cached=0 turns=0 elapsed_s=0 tokens_in=0 tokens_out=0 critical=0 warning=0 suggestion=0 verdict=DRY-RUN"
    exit 0
fi

# ── 5. Cache: same blobs, no call ──────────────────────────────────────────────────────────────
CACHE_DIR="$(git rev-parse --git-common-dir)/grok-review"
mkdir -p "$CACHE_DIR"
CACHE_DIR="$(cd "$CACHE_DIR" && pwd)"
HASH=$(cat "$WORK/diff" "$PROMPT_TEMPLATE" "$SCHEMA_FILE" | python3 -c 'import sys,hashlib; print(hashlib.sha256(sys.stdin.buffer.read()).hexdigest())')
CACHE_FILE="$CACHE_DIR/$HASH.json"
[[ -n "$OUT" ]] || OUT="$CACHE_FILE"

CACHED=0
if [[ "$FORCE" -eq 0 && -s "$CACHE_FILE" ]]; then
    CACHED=1
    cp "$CACHE_FILE" "$WORK/verdict.json"
else
    command -v grok >/dev/null 2>&1 || { [[ -x "$HOME/.grok/bin/grok" ]] && PATH="$HOME/.grok/bin:$PATH"; }
    command -v grok >/dev/null 2>&1 || { echo "grok-review: grok CLI not on PATH (expected ~/.grok/bin/grok)" >&2; exit 3; }
    # Watchdog: the CLI has no client-side deadline and a server retry storm once held a call for 2 h.
    # Run Grok in the background, poll, kill at TIMEOUT_MIN. Not `timeout(1)`: macOS ships without it.
    set +e
    grok --prompt-file "$WORK/prompt" \
        --json-schema "$(cat "$SCHEMA_FILE")" \
        --tools "read_file,grep,list_dir" \
        --disallowed-tools "Agent" \
        --deny "MCPTool" --deny "Bash" --deny "Edit" --deny "Write" --deny "WebFetch" \
        --effort "$EFFORT" \
        --max-turns "$MAX_TURNS" \
        --output-format json \
        --cwd "$REPO" \
        > "$WORK/grok.out" 2> "$WORK/grok.err" &
    GROK_PID=$!
    STARTED=$(date +%s)
    # Minutes may be fractional (the suite uses 0.05); bash arithmetic is integer-only.
    TIMEOUT_SEC=$(python3 -c 'import sys; print(max(1, int(float(sys.argv[1]) * 60)))' "$TIMEOUT_MIN")
    DEADLINE=$(( STARTED + TIMEOUT_SEC ))
    TIMED_OUT=0
    while kill -0 "$GROK_PID" 2>/dev/null; do
        if [[ "$(date +%s)" -ge "$DEADLINE" ]]; then
            TIMED_OUT=1
            pkill -P "$GROK_PID" 2>/dev/null          # its children first (a shell waits for them before dying)
            kill "$GROK_PID" 2>/dev/null; sleep 1; kill -9 "$GROK_PID" 2>/dev/null
            break
        fi
        sleep 2
    done
    wait "$GROK_PID" 2>/dev/null
    GROK_EXIT=$?
    ELAPSED=$(( $(date +%s) - STARTED ))
    set -e
    if [[ "$TIMED_OUT" -eq 1 ]]; then
        echo "grok-review: watchdog killed grok after ${TIMEOUT_MIN} min (blind-run guard). Retry, or raise --timeout for a very large diff" >&2
        exit 3
    fi
    if [[ "$GROK_EXIT" -ne 0 ]]; then
        echo "grok-review: grok exited $GROK_EXIT after ${ELAPSED}s (blind-run guard)" >&2
        cat "$WORK/grok.err" >&2
        grep -qi 'max turns' "$WORK/grok.err" && echo "grok-review: the turn cap ($MAX_TURNS) was hit before a verdict. Review a smaller block with --files, or raise --max-turns." >&2
        cp "$WORK/grok.out" "$CACHE_DIR/$HASH.raw.json" 2>/dev/null || true
        exit 3
    fi

    # `.text` may carry several JSON objects (progress emissions, then the final verdict). The verdict
    # is the LAST object, it must be the last thing in the text, it must satisfy the schema (every
    # finding field, the category enum, integer lines, a non-empty summary), the run must have ended
    # on its own (`stopReason` end_turn, not max_turns), and `passed` must agree with the findings:
    # a progress stub says passed=false with zero findings; passed=true over a blocking finding is a
    # contradiction. passed=false with suggestions only is Grok being strict, not a stub: it is kept
    # and normalised to passed=true (only critical/warning block). Anything else is a blind run:
    # exit 3, with the raw output kept next to the cache for inspection.
    python3 - "$WORK/grok.out" "$WORK/verdict.json" "$HASH" "$SCOPE" "$SCHEMA_FILE" "$ELAPSED" <<'PY' || { cp "$WORK/grok.out" "$CACHE_DIR/$HASH.raw.json" 2>/dev/null; echo "grok-review: raw grok output kept at $CACHE_DIR/$HASH.raw.json" >&2; exit 3; }
import json, sys
raw_f, out_f, digest, scope, schema_f = sys.argv[1:6]  # argv[6] = elapsed seconds
def blind(msg):
    sys.stderr.write(f"grok-review: {msg} (blind-run guard)\n"); sys.exit(1)
try:
    envelope = json.load(open(raw_f, encoding="utf-8"))
except Exception as e:
    blind(f"grok output is not JSON: {e}")
if not isinstance(envelope, dict):
    blind("grok output is not a JSON object")
schema = json.load(open(schema_f, encoding="utf-8"))
finding_schema = schema["properties"]["findings"]["items"]
required = finding_schema["required"]
severities = finding_schema["properties"]["severity"]["enum"]
categories = finding_schema["properties"]["category"]["enum"]
stop = str(envelope.get("stopReason") or "").lower().replace("_", "")
if stop != "endturn":
    blind(f"grok did not finish on its own (stopReason={envelope.get('stopReason')!r}): raise --max-turns or retry")
text = envelope.get("text") or ""
dec = json.JSONDecoder()
verdict, verdict_end, i = None, 0, 0
while i < len(text):
    j = text.find("{", i)
    if j < 0: break
    try:
        obj, end = dec.raw_decode(text, j)
    except json.JSONDecodeError:
        i = j + 1; continue
    if isinstance(obj, dict) and isinstance(obj.get("passed"), bool) and isinstance(obj.get("findings"), list):
        verdict, verdict_end = obj, end
    i = end
if verdict is None:
    blind("no schema-shaped verdict in grok output")
if text[verdict_end:].strip():
    blind("the verdict is not the last thing grok wrote")
if not str(verdict.get("summary") or "").strip():
    blind("verdict has an empty summary")
for f in verdict["findings"]:
    if not isinstance(f, dict):
        blind(f"finding is not an object: {f!r}")
    for key in required:
        if key not in f:
            blind(f"finding {f.get('id')!r} lacks '{key}'")
    if f["severity"] not in severities:
        blind(f"bad severity {f['severity']!r}")
    if f["category"] not in categories:
        blind(f"bad category {f['category']!r}")
    if not isinstance(f["line"], int) or isinstance(f["line"], bool):
        blind(f"finding {f['id']!r} has a non-integer line {f['line']!r}")
    for key in ("id", "file", "claim", "evidence", "failure_path", "fix"):
        if not str(f[key]).strip():
            blind(f"finding {f.get('id')!r} has an empty '{key}'")
blocking = sum(1 for f in verdict["findings"] if f["severity"] in ("critical", "warning"))
if verdict["passed"] and blocking:
    blind("passed=true but blocking findings exist")
if not verdict["passed"] and not verdict["findings"]:
    blind("passed=false with no findings at all: a progress stub, not a verdict")
if not verdict["passed"] and not blocking:
    verdict["passed"] = True   # suggestions only: nothing blocks
usage = envelope.get("usage") or {}
verdict["_meta"] = {
    "hash": digest, "scope": scope, "elapsed_s": int(sys.argv[6]) if len(sys.argv) > 6 else None,
    "session_id": envelope.get("sessionId"), "request_id": envelope.get("requestId"),
    "turns": envelope.get("num_turns"), "model": next(iter((envelope.get("modelUsage") or {}).keys()), None),
    "tokens_in": usage.get("input_tokens", 0), "tokens_out": usage.get("output_tokens", 0),
}
json.dump(verdict, open(out_f, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
PY
    cp "$WORK/verdict.json" "$CACHE_FILE"
fi
[[ "$OUT" == "$CACHE_FILE" ]] || cp "$WORK/verdict.json" "$OUT"

# ── 6. Report ──────────────────────────────────────────────────────────────────────────────────
set +e
python3 - "$WORK/verdict.json" "$SCOPE" "$FILE_COUNT" "$DIFF_CHARS" "$CACHED" "$OUT" <<'PY'
import json, sys
v = json.load(open(sys.argv[1], encoding="utf-8"))
scope, files, chars, cached, out = sys.argv[2:7]
m = v.get("_meta", {})
counts = {"critical": 0, "warning": 0, "suggestion": 0}
for f in v["findings"]:
    counts[f["severity"]] += 1
print(f"# Grok review · {scope} · {'cached' if cached == '1' else 'fresh'} · {m.get('model') or 'grok'}")
print(v.get("summary", "").strip())
print()
for sev in ("critical", "warning", "suggestion"):
    for f in v["findings"]:
        if f["severity"] != sev: continue
        print(f"- [{sev}] {f['file']}:{f['line']} {f['claim'].strip()}  (id: {f['id']}, category: {f.get('category','other')})")
        if f.get("failure_path"): print(f"    repro: {f['failure_path'].strip()}")
        if f.get("fix"): print(f"    fix: {f['fix'].strip()}")
print()
print(f"verdict json: {out}")
verdict = "PASS" if v["passed"] and counts["critical"] == 0 and counts["warning"] == 0 else "FAIL"
print(f"grok-review: scope={scope} files={files} diff_chars={chars} cached={cached} turns={m.get('turns') or 0} elapsed_s={m.get('elapsed_s') or 0} "
      f"tokens_in={m.get('tokens_in') or 0} tokens_out={m.get('tokens_out') or 0} "
      f"critical={counts['critical']} warning={counts['warning']} suggestion={counts['suggestion']} verdict={verdict}")
sys.exit(0 if verdict == "PASS" else 1)
PY
RESULT=$?
set -e

if [[ "$TO_LEDGER" -eq 1 && "$CACHED" -eq 0 && -f "$LEDGER" ]]; then
    if [[ -z "$BRANCH" ]]; then
        if [[ -n "$RANGE" ]]; then BRANCH="${RANGE##*..}"; BRANCH="${BRANCH#origin/}"; else BRANCH="$(git rev-parse --abbrev-ref HEAD)"; fi
    fi
    bash "$LEDGER" add --source grok --scope "$SCOPE" ${PR_NUMBER:+--pr "$PR_NUMBER"} ${BRANCH:+--branch "$BRANCH"} --json "$WORK/verdict.json" >&2 || echo "grok-review: ledger append failed (verdict unaffected)" >&2
fi

exit "$RESULT"
