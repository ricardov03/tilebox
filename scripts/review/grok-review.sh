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
#   --max-turns <n>      Grok agentic turns (default: 14; with 8, real blocks hit the cap; with 14, none did).
#                        At the cap grok 1.0.30 exits with no verdict, so the script resumes the same session
#                        once, with a "no more tools, write the verdict" prompt (2 turns, 5 min at most).
#   --conclude <id>      Skip the review call: resume Grok session <id> (printed by every blind run) and make
#                        it write the verdict from what it has read. The exploration is not paid for twice.
#                        Refused (exit 3) when that session made no tool call: it read nothing, so the verdict
#                        would come from the pasted diff alone. Pass --conclude-tools, or run the review again.
#   --conclude-tools     With --conclude: resume WITH the read-only tools ("continue the review, then the
#                        verdict"), up to --max-turns turns under --timeout. Default: off.
#   --timeout <min>      Watchdog: kill the Grok call after N minutes and exit 3 (default: 12; a turn takes
#                        about 40 s here). macOS has no `timeout`, so the script polls the child itself.
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
# Machine-greppable trailer (last line on stdout, for EVERY outcome; a run with no verdict says verdict=BLIND):
#   grok-review: scope=… files=N diff_chars=N cached=0|1 turns=N elapsed_s=N tokens_in=N tokens_out=N retries=N evidence=full|diff-only session=<id> critical=N warning=N suggestion=N verdict=PASS|FAIL|BLIND
#   retries  = automatic fresh calls after a first-turn stub (0 or 1).
#   evidence = full when the session read a file or ran a grep (`grok export <id>`); diff-only when the
#              verdict comes from the pasted diff and the impact map alone (none: no call was made).
#   session  = the Grok session id, for `grok export <id>`, `grok usage <id>` and `--conclude <id>`. After a
#              retry it is the session of the retry; the discarded stub session is `_meta.stub_session_id`.
#
# Blind-run guard: a run that did not obtain a schema-valid verdict exits 3. It never reports green.
# The first-turn stub: Grok sometimes answers the schema before it opens a file (`num_turns` 1 or absent,
# passed=false, zero findings, a summary that says it is starting). The script then makes ONE automatic retry
# as a FRESH call (a new session, never a resume: a resumed session keeps its own empty answer in context)
# whose prompt ends with a "## Retry" section: the first action must be a tool call. A second stub exits 3.
# Budget: effort medium, 14 turns, callers pre-read into the prompt, one conclude call at the cap, watchdog.
# Cache: <git common dir>/grok-review/<sha256(diff+prompt template+schema)>.json. Same blobs, no call. The
#        "## Retry" section is not part of the key: the verdict of a retry is cached under the same key.
#        GROK_REVIEW_CACHE_DIR overrides the folder (for a sandbox that may not read the common dir).
# Tools handed to Grok: read_file, grep, list_dir only; no subagents; no plan mode; MCP, shell, edit, write and
# web DENIED by permission rule (the allowlist alone keeps the MCP servers loaded); cwd = repo root.
# Suite: grok-review.test.sh.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROMPT_TEMPLATE="$SCRIPT_DIR/grok-review.prompt.md"
SCHEMA_FILE="$SCRIPT_DIR/grok-review.schema.json"
IMPACT_MAP="$SCRIPT_DIR/impact-map.py"
VERDICT_PY="$SCRIPT_DIR/grok-verdict.py"
LEDGER="$SCRIPT_DIR/findings-ledger.sh"
MAX_DIFF_CHARS=150000

RANGE=""
FILES=()
SCOPE=""
TITLE=""
INTENT_FILE=""
EFFORT="medium"
MAX_TURNS=14
TIMEOUT_MIN=12
CONCLUDE_TIMEOUT_MIN=5
CONCLUDE_SESSION=""
CONCLUDE_TOOLS=0
FORCE=0
DRY_RUN=0
TO_LEDGER=0
PR_NUMBER=""
BRANCH=""
OUT=""

usage() { sed -n '2,66p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

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
        --conclude) CONCLUDE_SESSION="${2:-}"; FORCE=1; shift 2 ;;
        --conclude-tools) CONCLUDE_TOOLS=1; shift ;;
        --out) OUT="${2:-}"; shift 2 ;;
        -h|--help) usage; exit 0 ;;
        *) echo "grok-review: unknown option $1" >&2; usage >&2; exit 2 ;;
    esac
done

for tool in git python3; do
    command -v "$tool" >/dev/null 2>&1 || { echo "grok-review: $tool not found" >&2; exit 2; }
done
[[ -f "$PROMPT_TEMPLATE" && -f "$SCHEMA_FILE" && -f "$IMPACT_MAP" && -f "$VERDICT_PY" ]] || { echo "grok-review: prompt template, schema, impact-map.py or grok-verdict.py missing next to the script" >&2; exit 2; }

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
    echo "grok-review: scope=$SCOPE files=0 diff_chars=0 cached=0 turns=0 elapsed_s=0 tokens_in=0 tokens_out=0 retries=0 evidence=none session=- critical=0 warning=0 suggestion=0 verdict=EMPTY"
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

python3 - "$PROMPT_TEMPLATE" "$WORK/prompt" "$SCOPE_TEXT" "$TITLE" "$WORK/intent" "$WORK/impact" "$WORK/diff" "$MAX_TURNS" <<'PY'
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
    echo "grok-review: scope=$SCOPE files=$FILE_COUNT diff_chars=$DIFF_CHARS cached=0 turns=0 elapsed_s=0 tokens_in=0 tokens_out=0 retries=0 evidence=none session=- critical=0 warning=0 suggestion=0 verdict=DRY-RUN"
    exit 0
fi

# Watchdog: the CLI has no client-side deadline and a server retry storm once held a call for 2 h.
# Run Grok in the background, poll, kill at the deadline. Not `timeout(1)`: macOS ships without it.
# run_grok <minutes> <grok args...>  ⇒  $WORK/grok.out, $WORK/grok.err, GROK_EXIT, TIMED_OUT, ELAPSED (added up).
run_grok() {
    local minutes="$1"; shift
    local pid started deadline
    set +e
    grok "$@" > "$WORK/grok.out" 2> "$WORK/grok.err" &
    pid=$!
    started=$(date +%s)
    # Minutes may be fractional (the suite uses 0.05); bash arithmetic is integer-only.
    deadline=$(( started + $(python3 -c 'import sys; print(max(1, int(float(sys.argv[1]) * 60)))' "$minutes") ))
    TIMED_OUT=0
    while kill -0 "$pid" 2>/dev/null; do
        if [[ "$(date +%s)" -ge "$deadline" ]]; then
            TIMED_OUT=1
            pkill -P "$pid" 2>/dev/null          # its children first (a shell waits for them before dying)
            kill "$pid" 2>/dev/null; sleep 1; kill -9 "$pid" 2>/dev/null
            break
        fi
        sleep 2
    done
    wait "$pid" 2>/dev/null
    GROK_EXIT=$?
    ELAPSED=$(( ELAPSED + $(date +%s) - started ))
    set -e
}

# ── 5. Cache: same blobs, no call ──────────────────────────────────────────────────────────────
CACHE_DIR="${GROK_REVIEW_CACHE_DIR:-$(git rev-parse --git-common-dir)/grok-review}"
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
    # Phase 1: the review. Phase 2 (only when the turn cap was hit): resume the SAME session with no new
    # reading and make Grok write the verdict from what it has read. grok 1.0.30 exits 1 with "max turns
    # reached" and prints no envelope at the cap, and the model does not count its turns (measured here:
    # two runs, 8 and 9+ turns of tool calls, 37 and 46 calls, no verdict). The exploration is paid for;
    # phase 2 is one short call that turns it into a verdict instead of a blind run.
    # Phase 1b (only after a first-turn stub): Grok sometimes answers the schema before it opens a file
    # (measured here: 3 of 6 fresh calls, then 1 of 4). Measured in the owner's other project: 8 of 8 stubs
    # had the shape `num_turns` 1, passed=false, zero findings, and every forced retry as a FRESH call gave a
    # real verdict. So: one automatic retry, a new session, the same prompt plus a "## Retry" section that
    # says the first action must be a tool call. A second stub still exits 3 (never green).
    SESSION_ID="$CONCLUDE_SESSION"
    ELAPSED=0
    CONCLUDED=0
    RETRIES=0
    STUB_SESSION=""        # the discarded session of a first-turn stub (its turns and tokens were paid for too)
    PRIOR_TURNS=0
    TOOL_CALLS=""          # "" = unknown (no `grok export`), else the number of tool calls of the session
    READ_CALLS=""
    SCHEMA_JSON="$(cat "$SCHEMA_FILE")"
    # One flag set for every call: read-only tools, no subagents, no plan mode, the deny rules, the schema.
    GROK_FLAGS=(--json-schema "$SCHEMA_JSON" --tools "read_file,grep,list_dir" --disallowed-tools "Agent" --no-plan
        --rules "Never answer with a plan or a progress note. Your first action is a tool call. Your last message is only the JSON verdict."
        --deny "MCPTool" --deny "Bash" --deny "Edit" --deny "Write" --deny "WebFetch"
        --effort "$EFFORT" --output-format json --cwd "$REPO")

    # session_tools ⇒ TOOL_CALLS, READ_CALLS from `grok export <id>` (Markdown: a "## Tools" section per tool
    # turn, one "- Read: …" / "- Search: …" / "- List: …" line per call). Only sections after the first
    # "## Assistant" count: the prompt pastes source and docs that can hold any heading.
    session_tools() {
        TOOL_CALLS=""; READ_CALLS=""
        grok export "$SESSION_ID" > "$WORK/export.md" 2>/dev/null || return 0
        [[ -s "$WORK/export.md" ]] || return 0
        local counted
        counted=$(python3 - "$WORK/export.md" <<'PY'
import re, sys
section, seen_assistant, total, reads = "", False, 0, 0
for line in open(sys.argv[1], encoding="utf-8", errors="replace"):
    head = re.match(r"^## (User|Assistant|Tools)\s*$", line)
    if head:
        section = head.group(1)
        seen_assistant = seen_assistant or section == "Assistant"
        continue
    call = re.match(r"^- ([A-Za-z_][A-Za-z_ ]*):", line)
    if section == "Tools" and seen_assistant and call:
        total += 1
        if re.match(r"(?i)^(read|read_file|search|grep)", call.group(1).strip()):
            reads += 1
print(total, reads)
PY
        ) || return 0
        TOOL_CALLS="${counted% *}"; READ_CALLS="${counted#* }"
    }

    # evidence ⇒ full | diff-only. Full needs a read_file or a grep in the session. Without `grok export`
    # the fallback is the turn count: a call of 2+ turns, or a run that hit the turn cap, called tools.
    evidence() {
        if [[ -n "$READ_CALLS" ]]; then [[ "$READ_CALLS" -gt 0 ]] && echo full || echo diff-only; return; fi
        local n; n=$(envelope_turns)
        if [[ "$PRIOR_TURNS" -gt 1 || "${n:-0}" -gt 1 ]]; then echo full; else echo diff-only; fi
    }
    envelope_turns() { python3 -c 'import json,sys
try: n = json.load(open(sys.argv[1], encoding="utf-8")).get("num_turns")
except Exception: n = None
print(n if isinstance(n, int) and not isinstance(n, bool) else "")' "$WORK/grok.out" 2>/dev/null || true; }

    # session_usage ⇒ $WORK/usage.json: the CLI's own books of the session, plus the books of the discarded
    # stub session after a retry (a fresh call is a new session, and the stub was paid for too).
    session_usage() {
        grok usage "$SESSION_ID" > "$WORK/usage.json" 2>/dev/null || echo '{}' > "$WORK/usage.json"
        [[ -n "$STUB_SESSION" && -s "$WORK/usage-stub.json" ]] || return 0
        python3 "$VERDICT_PY" merge-usage "$WORK/usage.json" "$WORK/usage-stub.json" "$WORK/usage.json" 2>/dev/null || true
    }

    # blind_exit <message>: EVERY exit 3 goes through here. The raw output is kept, the session id is printed
    # on stderr, and the trailer (verdict=BLIND, session=<id>) is the last line on stdout.
    blind_exit() {
        echo "grok-review: $1 (blind-run guard)" >&2
        [[ -s "$WORK/grok.err" ]] && cat "$WORK/grok.err" >&2
        if [[ -s "$WORK/grok.out" ]] && cp "$WORK/grok.out" "$CACHE_DIR/$HASH.raw.json" 2>/dev/null; then
            echo "grok-review: raw grok output kept at $CACHE_DIR/$HASH.raw.json" >&2
        fi
        [[ -n "$TOOL_CALLS" ]] || session_tools
        [[ -z "$STUB_SESSION" ]] || echo "grok-review: the discarded stub session of attempt 1 was $STUB_SESSION" >&2
        echo "grok-review: session $SESSION_ID (tool calls: ${TOOL_CALLS:-unknown}). Inspect: grok export $SESSION_ID. Resume: add --conclude $SESSION_ID$([[ "${TOOL_CALLS:-1}" == 0 ]] && echo ' --conclude-tools') to the same command." >&2
        session_usage
        local books
        books=$(python3 -c 'import json,sys
try: s = (json.load(open(sys.argv[1], encoding="utf-8")) or {}).get("session") or {}
except Exception: s = {}
print(s.get("modelCalls") or sys.argv[2] or 0, s.get("inputTokens") or 0, s.get("outputTokens") or 0)' "$WORK/usage.json" "$(( PRIOR_TURNS + $(envelope_turns | grep -E '^[0-9]+$' || echo 0) ))" 2>/dev/null || echo "0 0 0")
        set -- $books
        echo "grok-review: scope=$SCOPE files=$FILE_COUNT diff_chars=$DIFF_CHARS cached=0 turns=$1 elapsed_s=$ELAPSED tokens_in=$2 tokens_out=$3 retries=$RETRIES evidence=$(evidence) session=$SESSION_ID critical=0 warning=0 suggestion=0 verdict=BLIND"
        exit 3
    }

    # check_call <what> <turn cap of that call>: after a call that had its tools. Watchdog or crash ⇒ blind; the turn cap ⇒ conclude.
    check_call() {
        if [[ "$TIMED_OUT" -eq 1 ]]; then
            blind_exit "watchdog killed grok after ${TIMEOUT_MIN} min ($1). Retry, raise --timeout for a very large diff, or try to conclude the session"
        fi
        if [[ "$GROK_EXIT" -ne 0 ]] && ! grep -qi 'max turns' "$WORK/grok.err"; then
            blind_exit "grok exited $GROK_EXIT after ${ELAPSED}s ($1)"
        fi
        if [[ "$GROK_EXIT" -ne 0 ]]; then
            CONCLUDED=1
            PRIOR_TURNS=$(( PRIOR_TURNS + $2 ))      # the cap prints no envelope: the turns of that call = its cap
            echo "grok-review: the turn cap was hit after ${ELAPSED}s with no verdict ($1). Resuming session $SESSION_ID to conclude." >&2
        fi
    }

    # continue_call <max turns>: resume the session WITH the tools. For --conclude-tools only: the stub retry
    # is a fresh call, never a resume.
    continue_call() {
        cat > "$WORK/continue" <<CONTINUE
You stopped after announcing your plan. Continue now: use your tools, then return ONLY the JSON verdict.
Your next message must call tools (read_file, grep, list_dir): \`docs/invariants.md\`, the symbol grep and every file the impact map points at, all in ONE message. You have $1 tool turns left.
Your last message must be ONLY the JSON object of the schema, with nothing before it and nothing after it. A stub with \`passed: false\` and no finding is not a verdict.
CONTINUE
        run_grok "$TIMEOUT_MIN" --resume "$SESSION_ID" --prompt-file "$WORK/continue" "${GROK_FLAGS[@]}" --max-turns "$1"
    }

    if [[ -z "$SESSION_ID" ]]; then
        SESSION_ID=$(python3 -c 'import uuid; print(uuid.uuid4())')
        echo "grok-review: session $SESSION_ID" >&2
        run_grok "$TIMEOUT_MIN" --prompt-file "$WORK/prompt" --session-id "$SESSION_ID" "${GROK_FLAGS[@]}" --max-turns "$MAX_TURNS"
        check_call "the review call" "$MAX_TURNS"
        if [[ "$CONCLUDED" -eq 0 ]]; then
            session_tools
            if python3 "$VERDICT_PY" is-stub "$WORK/grok.out" "${TOOL_CALLS:-unknown}"; then
                used=$(envelope_turns); [[ -n "$used" && "$used" -gt 0 ]] || used=1
                RETRIES=1
                PRIOR_TURNS=$used
                STUB_SESSION="$SESSION_ID"
                grok usage "$STUB_SESSION" > "$WORK/usage-stub.json" 2>/dev/null || : > "$WORK/usage-stub.json"
                echo "grok-review: progress stub on attempt 1 (one turn, no findings) — retrying once" >&2
                # A FRESH call with the same prompt plus the Retry section. The cache key never sees the
                # section: $HASH is made of the diff, the prompt template and the schema.
                cp "$WORK/prompt" "$WORK/prompt.retry"
                printf '\n\n## Retry\nYour previous attempt returned the verdict JSON on its FIRST turn, before reading a single file. That is not a review and it was discarded. Your first action now MUST be a tool call (read_file or grep on the changed files); write the verdict JSON only after you have read them.\n' >> "$WORK/prompt.retry"
                SESSION_ID=$(python3 -c 'import uuid; print(uuid.uuid4())')
                echo "grok-review: session $SESSION_ID (attempt 2: a fresh call, not a resume of $STUB_SESSION)" >&2
                run_grok "$TIMEOUT_MIN" --prompt-file "$WORK/prompt.retry" --session-id "$SESSION_ID" "${GROK_FLAGS[@]}" --max-turns "$MAX_TURNS"
                check_call "the automatic retry" "$MAX_TURNS"
                session_tools
            fi
        fi
    elif [[ "$CONCLUDE_TOOLS" -eq 1 ]]; then
        echo "grok-review: session $SESSION_ID (--conclude-tools: resuming with the tools, $MAX_TURNS turns)" >&2
        continue_call "$MAX_TURNS"
        check_call "the --conclude-tools call" "$MAX_TURNS"
        session_tools
    else
        echo "grok-review: session $SESSION_ID (--conclude)" >&2
        session_tools
        if [[ "$TOOL_CALLS" == 0 ]]; then
            echo "grok-review: refused: session $SESSION_ID made no tool call, so it read nothing. A verdict without tools would come from the pasted diff alone." >&2
            echo "grok-review: add --conclude-tools to resume it WITH the tools, or run the review again without --conclude." >&2
            blind_exit "a tool-less conclude of a session that read nothing is refused"
        fi
        [[ -n "$TOOL_CALLS" ]] || echo "grok-review: warning: \`grok export $SESSION_ID\` gave nothing, so the tool calls of this session are unknown. The verdict is labelled evidence=diff-only." >&2
        [[ -n "$TOOL_CALLS" ]] || READ_CALLS=0
        CONCLUDED=1
    fi
    if [[ "$CONCLUDED" -eq 1 ]]; then
        cat > "$WORK/conclude" <<'CONCLUDE'
Your tool budget is spent. Do NOT call any tool: a tool call now discards the whole review.
From what you have already read, write the final verdict now: ONLY the JSON object of the schema, nothing after it.
Report only findings you verified, each with `file:line`, quoted `evidence` and a concrete `failure_path`. Drop every hunch you could not verify.
If you verified no defect, return `passed: true` with an empty `findings` list. In `summary`, say what you checked and name what you could not check.
CONCLUDE
        run_grok "$CONCLUDE_TIMEOUT_MIN" --resume "$SESSION_ID" --prompt-file "$WORK/conclude" "${GROK_FLAGS[@]}" --max-turns 2
        if [[ "$TIMED_OUT" -eq 1 || "$GROK_EXIT" -ne 0 ]]; then
            echo "grok-review: review a smaller block with --files, or raise --max-turns." >&2
            blind_exit "the conclude call for session $SESSION_ID failed (exit $GROK_EXIT, timed_out=$TIMED_OUT)"
        fi
    fi
    # Session totals (every phase, plus the stub session of a retry) from the CLI's own books; the envelope
    # only knows its own call.
    session_usage

    # The envelope is checked by grok-verdict.py (the rules are in its header). No valid verdict ⇒ exit 3.
    [[ -n "$READ_CALLS" ]] || session_tools
    EVIDENCE=$(evidence)
    reason=$(python3 "$VERDICT_PY" final "$WORK/grok.out" "$WORK/verdict.json" "$HASH" "$SCOPE" "$SCHEMA_FILE" "$ELAPSED" "$WORK/usage.json" "$CONCLUDED" "$SESSION_ID" "$PRIOR_TURNS" "$RETRIES" "$EVIDENCE" "${TOOL_CALLS:-unknown}" "${STUB_SESSION:--}" 2>&1) \
        || blind_exit "${reason:-no valid verdict}$([[ "$RETRIES" -gt 0 ]] && echo ', again after the 1 automatic retry' || true)"
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
print(f"# Grok review · {scope} · {'cached' if cached == '1' else 'fresh'} · {m.get('model') or 'grok'}"
      + (" · verdict forced at the turn cap" if m.get("concluded_after_turn_cap") else "")
      + (f" · {m['retries']} automatic retry (a fresh call) after a first-turn stub" if m.get("retries") else "")
      + (" · DIFF-ONLY: the reviewer opened no file" if m.get("evidence") == "diff-only" else ""))
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
      f"retries={m.get('retries') or 0} evidence={m.get('evidence') or 'unknown'} session={m.get('session_id') or '-'} "
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
