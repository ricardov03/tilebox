#!/usr/bin/env bash
#
# scripts/review/grok-review.test.sh: regression suite for the local Grok reviewer and its impact map.
#
# A reviewer wrapper that reports green without a verdict is the exact failure this pipeline exists to
# remove, so every case here asserts on the machine-greppable trailer or on the exit code, never on
# "it ran". The Grok CLI is replaced by a fake `grok` on PATH that records the prompt it received and
# answers with a canned envelope, so the suite is offline, costs nothing and runs in CI.
#
# Cases:
#   PROMPT        the rendered prompt carries the diff, the title, the intent, the impact map and the scope
#   FAIL          a warning in the verdict ⇒ exit 1, counts in the trailer
#   PASS          an empty verdict ⇒ exit 0
#   CACHE         same blobs ⇒ no second call (fake counts invocations); --force calls again
#   BLIND-RUN     garbage output, a progress stub (passed=false, no findings), a run cut by max_turns,
#                 passed=true over a blocking finding, text after the verdict ⇒ exit 3, never green
#   UNTRACKED     a new file in scope is reviewed before it is ever `git add`ed
#   FILES         --files scopes the diff and the file count
#   OVERSIZED     a diff over 150,000 chars ⇒ exit 2 with the --files advice, no call
#   EMPTY-DIFF    nothing to review ⇒ exit 2
#   DRY-RUN       prints the prompt, calls nothing, exit 0
#   RANGE         `--range` labels pr; the commit messages of the range are the intent
#   LEDGER        --ledger appends one line per finding with category and branch; a cache hit and a forced
#                 re-review of the same branch add nothing
#   BUDGET        the prompt states the turn budget; the grok call carries the read-only flags
#   STUB          a 1-turn progress stub (JSON stub or plain text, no tool call) ⇒ ONE automatic retry on the
#                 same session with the tools and the rest of the budget; a second stub ⇒ exit 3 with the
#                 session id on stderr and in a verdict=BLIND trailer; retries= and evidence= in the trailer
#   CONCLUDE      --conclude on a session that made no tool call is refused; --conclude-tools resumes with tools
#   TURN CAP      grok exits "max turns reached" with no verdict ⇒ ONE conclude call resumes the same
#                 session; it answers ⇒ a verdict; it fails too ⇒ exit 3; --conclude <id> skips the review call
#   GRAPH         with a graph present, the graph callers are listed and their source is pasted
#   WATCHDOG      a grok that never answers is killed at --timeout and the run exits 3
#   IMPACT        impact-map.py on a tiny Nuxt tree: importer by alias, auto-imported component tag,
#                 auto-imported util, changed exported symbol, npm script name, /api route, tests last,
#                 the 40-reference cap and the 25-line de-duplication of <caller> blocks
#
# Usage: bash scripts/review/grok-review.test.sh   (exit 1 if any case fails)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REVIEW="$SCRIPT_DIR/grok-review.sh"
LEDGER_SH="$SCRIPT_DIR/findings-ledger.sh"
IMPACT="$SCRIPT_DIR/impact-map.py"
[[ -f "$REVIEW" && -f "$LEDGER_SH" && -f "$IMPACT" ]] || { echo "grok-review.test: scripts missing" >&2; exit 2; }
for tool in git python3; do command -v "$tool" >/dev/null 2>&1 || { echo "grok-review.test: $tool missing" >&2; exit 2; }; done

PASSED=0; FAILED=0; EXPECTED_ASSERTIONS=130
assert_eq() { # name expected actual
    if [[ "$2" == "$3" ]]; then PASSED=$((PASSED+1)); echo "  ok   $1"; else FAILED=$((FAILED+1)); echo "  FAIL $1: expected [$2] got [$3]"; fi
}
assert_grep() { # name pattern file
    if grep -qE -- "$2" "$3"; then PASSED=$((PASSED+1)); echo "  ok   $1"; else FAILED=$((FAILED+1)); echo "  FAIL $1: pattern [$2] not in $3"; fi
}
assert_not_grep() { # name pattern file: the pattern must be ABSENT
    if grep -qE -- "$2" "$3"; then FAILED=$((FAILED+1)); echo "  FAIL $1: pattern [$2] found in $3"; else PASSED=$((PASSED+1)); echo "  ok   $1"; fi
}
trailer() { grep -E '^grok-review: ' "$1" | tail -1; }
field() { sed -nE "s/.*[[:space:]]$2=([^[:space:]]+).*/\1/p" <<< "$(trailer "$1")"; }

# ── Sandbox repo + fake grok ─────────────────────────────────────────────────────────────────────
SANDBOX="$(mktemp -d "${TMPDIR:-/tmp}/grok-review-test.XXXXXX")"
trap 'rm -rf "$SANDBOX"' EXIT
REPO="$SANDBOX/repo"; BIN="$SANDBOX/bin"
mkdir -p "$REPO/app/utils" "$REPO/app/composables" "$REPO/app/components/editor" "$REPO/app/pages" \
    "$REPO/content" "$REPO/server/api" "$REPO/scripts" "$REPO/tests/e2e" "$BIN"
export FAKE_DIR="$SANDBOX/fake"; mkdir -p "$FAKE_DIR"
export PATH="$BIN:$PATH"          # the fake grok and the fake graphify come first
export FINDINGS_LEDGER="$SANDBOX/ledger.jsonl"

cat > "$BIN/grok" <<'FAKE'
#!/usr/bin/env bash
# Fake Grok CLI: records the prompt file and argv it was given, counts calls, replies with $FAKE_DIR/reply.json.
# If $FAKE_DIR/hang exists it never answers (watchdog case).
set -euo pipefail
[[ "${1:-}" == usage ]] && exit 1          # `grok usage <session>`: the fake keeps no books
if [[ "${1:-}" == export ]]; then          # `grok export <session>`: Markdown, one "## Tools" section per tool turn
    [[ -f "$FAKE_DIR/no-export" ]] && exit 1
    # The prompt can hold any heading: a "## Tools" before the first "## Assistant" is not a tool turn.
    printf '## User\n\nthe prompt\n\n## Tools\n\n- Read: a/heading/inside/the/prompt.md\n\n## Assistant\n\n{ "passed": false }\n\n'
    # `no-tools`: the session never called a tool. `tools-on-resume`: none before the first resume call.
    if [[ -f "$FAKE_DIR/no-tools" || ( -f "$FAKE_DIR/tools-on-resume" && ! -f "$FAKE_DIR/did-resume" ) ]]; then exit 0; fi
    printf '## Tools\n\n- Read: docs/invariants.md\n- Search: greetUser\n- List: app\n\n## Assistant\n\n{ "passed": true }\n'
    exit 0
fi
prompt=""; resumed=0
printf '%s\n' "$@" > "$FAKE_DIR/last-argv"
[[ " $* " == *" --resume "* ]] && { resumed=1; touch "$FAKE_DIR/did-resume"; printf '%s\n' "$@" > "$FAKE_DIR/resume-argv"; } || printf '%s\n' "$@" > "$FAKE_DIR/review-argv"
while [[ $# -gt 0 ]]; do
    case "$1" in --prompt-file) prompt="$2"; shift 2 ;; --json-schema|--tools|--disallowed-tools|--effort|--max-turns|--output-format|--cwd|--deny|--session-id|--resume|--rules) shift 2 ;; *) shift ;; esac
done
cp "$prompt" "$FAKE_DIR/last-prompt.md"
echo x >> "$FAKE_DIR/calls"
[[ -f "$FAKE_DIR/hang" ]] && sleep 600
# grok 1.0.30 at the turn cap: exit 1, "Error: max turns reached", no envelope. `max-turns` = the review call only.
[[ -f "$FAKE_DIR/max-turns-always" || ( -f "$FAKE_DIR/max-turns" && "$resumed" -eq 0 ) ]] && { echo "Error: max turns reached" >&2; exit 1; }
[[ "$resumed" -eq 1 && -f "$FAKE_DIR/reply-resume.json" ]] && { cat "$FAKE_DIR/reply-resume.json"; exit 0; }
cat "$FAKE_DIR/reply.json"
FAKE
chmod +x "$BIN/grok"
cat > "$BIN/graphify" <<'FAKE'
#!/usr/bin/env bash
# Fake graphify: `affected <file>` names one caller inside the sandbox repo.
case "${1:-}" in
    affected) echo "Affected nodes for $2"; echo "- .setup() [calls] app/pages/index.vue:L3" ;;
    *) exit 0 ;;
esac
FAKE
chmod +x "$BIN/graphify"
calls() { [[ -f "$FAKE_DIR/calls" ]] && wc -l < "$FAKE_DIR/calls" | tr -d ' ' || echo 0; }

reply() { # writes an envelope whose .text is the given string; $2 overrides stopReason, $3 num_turns, $4 the file
    python3 - "$FAKE_DIR/${4:-reply.json}" "$1" "${2:-end_turn}" "${3:-4}" <<'PY'
import json, sys
json.dump({"text": sys.argv[2], "stopReason": sys.argv[3], "sessionId": "s1", "requestId": "r1", "num_turns": int(sys.argv[4]),
           "usage": {"input_tokens": 1200, "output_tokens": 300}, "modelUsage": {"grok-test-build": {}}},
          open(sys.argv[1], "w"))
PY
}
reply_resume() { reply "$1" end_turn "${2:-3}" reply-resume.json; }   # what a --resume call answers
FINDING='{"id":"save-without-guard","severity":"warning","category":"dev-route-guard","file":"server/api/save.post.ts","line":2,"claim":"the route skips assertEditorRequest","evidence":"x","failure_path":"a cross-site POST saves the profile","fix":"call the guard first"}'
SUGG='{"id":"third-copy","severity":"suggestion","category":"schema-drift","file":"app/utils/greet.ts","line":3,"claim":"rule exists twice","evidence":"y","failure_path":"drift","fix":"share it"}'
PROGRESS='{"passed": false, "summary": "reading…", "findings": []}'
FAIL_VERDICT="$PROGRESS {\"passed\": false, \"summary\": \"one real bug\", \"findings\": [$FINDING, $SUGG]}"
PASS_VERDICT='{"passed": true, "summary": "clean", "findings": []}'

git -C "$REPO" init -q -b main
git -C "$REPO" config user.email t@t; git -C "$REPO" config user.name t
git -C "$REPO" config commit.gpgsign false
cd "$REPO"
cat > nuxt.config.ts <<'TS'
import { resolve } from 'node:path'
const ROOT = '.'
const FILE_ALIASES = {
  '#thing': resolve(ROOT, 'content/thing.ts'),
}
export default { alias: FILE_ALIASES }
TS
printf "export const THING = 1\n" > content/thing.ts
cat > app/utils/greet.ts <<'TS'
export const GREETING = 'hi'
export function greetUser(name: string): string {
  return `${GREETING} ${name}`
}
TS
cat > app/composables/useGreeting.ts <<'TS'
import { GREETING } from '~/utils/greet'
import { THING } from '#thing'

export function useGreeting() {
  return `${GREETING} ${THING}`
}
TS
cat > app/components/editor/TextField.vue <<'VUE'
<script setup lang="ts">
defineProps<{ label: string }>()
</script>
<template>
  <label>{{ label }}<input></label>
</template>
VUE
cat > app/components/editor/Form.vue <<'VUE'
<template>
  <form>
    <EditorTextField label="Name" />
    <editor-text-field label="Handle" />
  </form>
</template>
VUE
cat > app/pages/index.vue <<'VUE'
<script setup lang="ts">
// No import line: Nuxt auto-imports app/utils.
const hello = greetUser('you')
</script>
<template>
  <p>{{ hello }}</p>
</template>
VUE
{ echo '<script setup lang="ts">'; for i in $(seq 1 60); do echo "const v$i = manyThing($i)"; done; echo '</script>'; } > app/pages/many.vue
printf "export function manyThing(n: number): number {\n  return n\n}\n" > app/utils/many.ts
cat > server/api/save.post.ts <<'TS'
export default defineEventHandler(async (event) => {
  return { ok: true, body: await readBody(event) }
})
TS
cat > tests/e2e/save.spec.ts <<'TS'
import { greetUser } from '../../app/utils/greet'

test('save', async ({ page }) => {
  await page.route('/api/save', route => route.fulfill({ json: { ok: true } }))
  expect(greetUser('x')).toBe('hi x')
})
TS
printf "console.log('thing')\n" > scripts/build-thing.ts
cat > package.json <<'JSON'
{
  "name": "fixture",
  "scripts": {
    "build:thing": "tsx scripts/build-thing.ts",
    "pregenerate": "npm run build:thing"
  }
}
JSON
printf '# Fixture\n\nRun `npm run build:thing` before a build.\n' > README.md
git add -A && git commit -qm "base"

echo "PROMPT / FAIL"
reply "$FAIL_VERDICT"
printf '\n// touched\n' >> server/api/save.post.ts
set +e; bash "$REVIEW" --title "Guard the save route" > "$SANDBOX/out1" 2>"$SANDBOX/err1"; rc=$?; set -e
assert_eq "warning ⇒ exit 1" 1 "$rc"
assert_eq "trailer verdict=FAIL" FAIL "$(field "$SANDBOX/out1" verdict)"
assert_eq "trailer warning=1" 1 "$(field "$SANDBOX/out1" warning)"
assert_eq "trailer suggestion=1" 1 "$(field "$SANDBOX/out1" suggestion)"
assert_eq "trailer cached=0" 0 "$(field "$SANDBOX/out1" cached)"
assert_eq "trailer tokens_in from envelope" 1200 "$(field "$SANDBOX/out1" tokens_in)"
assert_eq "trailer turns from envelope" 4 "$(field "$SANDBOX/out1" turns)"
assert_grep "trailer format is stable" '^grok-review: scope=block files=1 diff_chars=[0-9]+ cached=0 turns=4 elapsed_s=[0-9]+ tokens_in=1200 tokens_out=300 retries=0 evidence=full session=[0-9a-f-]{36} critical=0 warning=1 suggestion=1 verdict=FAIL$' "$SANDBOX/out1"
assert_grep "prompt carries the diff hunk" '^\+// touched' "$FAKE_DIR/last-prompt.md"
assert_grep "prompt carries the title" 'Title:\*\* Guard the save route' "$FAKE_DIR/last-prompt.md"
assert_grep "prompt carries the scope label" '^block: one task block' "$FAKE_DIR/last-prompt.md"
assert_grep "prompt carries the impact map header" '^## Impact map' "$FAKE_DIR/last-prompt.md"
assert_grep "impact map lists the route user in the tests" '^- \[route /api/save\] tests/e2e/save.spec.ts:L4 \(test\)' "$FAKE_DIR/last-prompt.md"
assert_grep "without a graph the map says so" '^Code graph: unavailable' "$FAKE_DIR/last-prompt.md"
assert_grep "report lists the finding with file:line" 'server/api/save.post.ts:2' "$SANDBOX/out1"

echo "CACHE"
set +e; bash "$REVIEW" --title "Guard the save route" > "$SANDBOX/out2" 2>/dev/null; rc=$?; set -e
assert_eq "same blobs ⇒ still exit 1" 1 "$rc"
assert_eq "same blobs ⇒ cached=1" 1 "$(field "$SANDBOX/out2" cached)"
assert_eq "same blobs ⇒ grok called once" 1 "$(calls)"
set +e; bash "$REVIEW" --title "Guard the save route" --force > "$SANDBOX/out3" 2>/dev/null; set -e
assert_eq "--force ⇒ grok called again" 2 "$(calls)"

echo "PASS"
git commit -qam "touch" ; printf '\n// again\n' >> server/api/save.post.ts
reply "$PASS_VERDICT"
set +e; bash "$REVIEW" > "$SANDBOX/out4" 2>/dev/null; rc=$?; set -e
assert_eq "clean verdict ⇒ exit 0" 0 "$rc"
assert_eq "trailer verdict=PASS" PASS "$(field "$SANDBOX/out4" verdict)"

echo "BLIND-RUN"
git commit -qam "touch2"; printf '\n// third\n' >> server/api/save.post.ts
reply "Sorry, I could not review this."
set +e; bash "$REVIEW" > "$SANDBOX/out5" 2>"$SANDBOX/err5"; rc=$?; set -e
assert_eq "garbage ⇒ exit 3 (never green)" 3 "$rc"
assert_not_grep "garbage ⇒ no PASS trailer" 'verdict=PASS' "$SANDBOX/out5"
reply "$PROGRESS"        # passed=false with zero findings is a progress stub, not a verdict
set +e; bash "$REVIEW" > "$SANDBOX/out5b" 2>"$SANDBOX/err5b"; rc=$?; set -e
assert_eq "progress stub ⇒ exit 3, not 1" 3 "$rc"
assert_grep "progress stub is named in stderr" 'progress stub' "$SANDBOX/err5b"
assert_eq "a stub after 4 turns of tool calls is not the 1-turn stub: no retry" BLIND/0 "$(field "$SANDBOX/out5b" verdict)/$(field "$SANDBOX/out5b" retries)"
reply "$PASS_VERDICT" max_turns
set +e; bash "$REVIEW" > "$SANDBOX/out5c" 2>"$SANDBOX/err5c"; rc=$?; set -e
assert_eq "run cut by max_turns ⇒ exit 3 even with a clean-looking verdict" 3 "$rc"
reply "{\"passed\": true, \"summary\": \"all good\", \"findings\": [$FINDING]}"
set +e; bash "$REVIEW" > "$SANDBOX/out5e" 2>"$SANDBOX/err5e"; rc=$?; set -e
assert_eq "passed=true over a blocking finding ⇒ exit 3" 3 "$rc"
assert_grep "the contradiction is named in stderr" 'passed=true but blocking findings exist' "$SANDBOX/err5e"
reply "$PASS_VERDICT and then I kept talking"
set +e; bash "$REVIEW" > "$SANDBOX/out5f" 2>"$SANDBOX/err5f"; rc=$?; set -e
assert_eq "text after the verdict ⇒ exit 3" 3 "$rc"
reply "{\"passed\": false, \"summary\": \"bad enum\", \"findings\": [${FINDING/dev-route-guard/tenancy}]}"
set +e; bash "$REVIEW" > "$SANDBOX/out5g" 2>"$SANDBOX/err5g"; rc=$?; set -e
assert_eq "a category outside the enum ⇒ exit 3" 3 "$rc"
assert_eq "blind run keeps the raw grok output next to the cache" 1 "$(ls .git/grok-review/*.raw.json 2>/dev/null | wc -l | tr -d ' ')"
assert_eq "a blind run is never cached as a verdict" 0 "$(grep -l '"bad enum"\|"all good"' .git/grok-review/*.json 2>/dev/null | grep -v raw | wc -l | tr -d ' ')"
reply "{\"passed\": false, \"summary\": \"strict but nothing blocks\", \"findings\": [$SUGG]}"
set +e; bash "$REVIEW" --force > "$SANDBOX/out5d" 2>"$SANDBOX/err5d"; rc=$?; set -e
assert_eq "passed=false with suggestions only ⇒ PASS (exit 0), not a stub" 0 "$rc"

echo "EMPTY-DIFF / DRY-RUN / OVERSIZED"
git commit -qam "touch3"
set +e; bash "$REVIEW" > "$SANDBOX/out6" 2>/dev/null; rc=$?; set -e
assert_eq "empty diff ⇒ exit 2" 2 "$rc"
assert_eq "empty diff ⇒ verdict=EMPTY" EMPTY "$(field "$SANDBOX/out6" verdict)"
before=$(calls)
printf '\n// dry\n' >> server/api/save.post.ts
set +e; bash "$REVIEW" --dry-run > "$SANDBOX/out7" 2>/dev/null; rc=$?; set -e
assert_eq "dry-run ⇒ exit 0 and no call" "0/$before" "$rc/$(calls)"
assert_grep "dry-run prints the prompt with the diff" '^\+// dry' "$SANDBOX/out7"
assert_eq "dry-run ⇒ verdict=DRY-RUN" DRY-RUN "$(field "$SANDBOX/out7" verdict)"
git checkout -q -- server/api/save.post.ts
python3 -c 'print("\n".join("export const big%d = %d" % (i, i) for i in range(9000)))' > app/utils/big.ts
set +e; bash "$REVIEW" > "$SANDBOX/out7b" 2>"$SANDBOX/err7b"; rc=$?; set -e
assert_eq "oversized diff ⇒ exit 2 and no call" "2/$before" "$rc/$(calls)"
assert_grep "oversized diff ⇒ advice to use --files" 'Review it per block with --files' "$SANDBOX/err7b"
rm app/utils/big.ts

echo "RANGE (scope pr, commit messages as the intent, importers in the map)"
printf "export const GREETING = 'hello'\nexport function greetUser(name: string): string {\n  return GREETING + name\n}\n" > app/utils/greet.ts
git commit -qam "fix(greet): say hello" -m "The greeting is longer now."
reply "$PASS_VERDICT"
set +e; bash "$REVIEW" --range HEAD~1..HEAD > "$SANDBOX/out8" 2>/dev/null; rc=$?; set -e
assert_eq "--range ⇒ scope=pr" pr "$(field "$SANDBOX/out8" scope)"
assert_grep "--range ⇒ the title is the last commit subject" 'Title:\*\* fix\(greet\): say hello' "$FAKE_DIR/last-prompt.md"
assert_grep "--range without a PR ⇒ the commit messages are the intent" 'The greeting is longer now' "$FAKE_DIR/last-prompt.md"
assert_grep "impact map lists the importer by ~/ alias" '^- \[import\] app/composables/useGreeting.ts:L1' "$FAKE_DIR/last-prompt.md"
assert_grep "caller source is pasted with line numbers" '^<caller file="app/composables/useGreeting.ts" lines="1-' "$FAKE_DIR/last-prompt.md"

echo "UNTRACKED / FILES"
reply "$PASS_VERDICT"
printf 'export default defineEventHandler(() => ({ created: true }))\n' > server/api/create.post.ts
printf '\n// other block\n' >> app/utils/many.ts
set +e; bash "$REVIEW" --files server/api > "$SANDBOX/out9" 2>/dev/null; rc=$?; set -e
assert_eq "untracked file alone is not an empty diff" 0 "$rc"
assert_grep "prompt carries the new file as a creation diff" '^\+export default defineEventHandler\(\(\) => \(\{ created' "$FAKE_DIR/last-prompt.md"
assert_eq "--files ⇒ one file in the trailer" 1 "$(field "$SANDBOX/out9" files)"
assert_not_grep "--files ⇒ the other block is not in the prompt" '^\+// other block' "$FAKE_DIR/last-prompt.md"
rm server/api/create.post.ts; git checkout -q -- app/utils/many.ts

echo "LEDGER"
reply "$FAIL_VERDICT"
printf '\n// ledger\n' >> server/api/save.post.ts
set +e; bash "$REVIEW" --ledger --branch fix/save-guard > /dev/null 2>&1; set -e
assert_eq "--ledger appends one line per finding" 2 "$(wc -l < "$FINDINGS_LEDGER" | tr -d ' ')"
assert_grep "ledger row carries the category" '"category": "dev-route-guard"' "$FINDINGS_LEDGER"
assert_grep "ledger row carries the branch" '"branch": "fix/save-guard"' "$FINDINGS_LEDGER"
set +e; bash "$REVIEW" --ledger --branch fix/save-guard > /dev/null 2>&1; set -e
assert_eq "cache hit ⇒ ledger unchanged" 2 "$(wc -l < "$FINDINGS_LEDGER" | tr -d ' ')"
set +e; bash "$REVIEW" --ledger --branch fix/save-guard --force > /dev/null 2>&1; set -e
assert_eq "--force re-review ⇒ same ids on the same branch not duplicated" 2 "$(wc -l < "$FINDINGS_LEDGER" | tr -d ' ')"
bash "$LEDGER_SH" add --source human --branch fix/other --id save-without-guard --category dev-route-guard --severity warning --file server/api/save.post.ts --claim "reported by the owner" > /dev/null
assert_eq "another source and branch ⇒ a new row" 3 "$(wc -l < "$FINDINGS_LEDGER" | tr -d ' ')"
set +e; bash "$LEDGER_SH" add --source artemis --branch x --category other --severity warning --file a --claim b > /dev/null 2>&1; rc=$?; set -e
assert_eq "an unknown source is refused" 2 "$rc"
bash "$LEDGER_SH" report > "$SANDBOX/report"
assert_grep "report names the top category" '^findings-ledger: rows=3 top_category=dev-route-guard top_count=2 grok=2 ocr=0 agent=0 human=1$' "$SANDBOX/report"

echo "BUDGET"
assert_grep "prompt states the turn budget" 'at most 14 tool turns' "$FAKE_DIR/last-prompt.md"
# The map is a text search capped at 40 per file, so the prompt must say so and must send Grok to grep
# for the changed symbols: an overclaim here is what would make it skip the grep.
assert_grep "prompt admits the impact map is not exhaustive" 'It is not exhaustive' "$FAKE_DIR/last-prompt.md"
assert_grep "prompt tells Grok to grep the changed symbols" 'grep for the changed symbols' "$FAKE_DIR/last-prompt.md"
assert_not_grep "prompt never claims the map lists every caller" 'lists every caller' "$FAKE_DIR/last-prompt.md"
assert_grep "grok is called with --effort medium" '^medium$' "$FAKE_DIR/last-argv"
assert_grep "grok is called with --max-turns 14 (the default)" '^14$' "$FAKE_DIR/last-argv"
assert_grep "grok is called with plan mode off" '^--no-plan$' "$FAKE_DIR/last-argv"
bash "$REVIEW" --help > "$SANDBOX/help" 2>&1
assert_grep "--help names the new defaults" 'default: 14;' "$SANDBOX/help"
assert_grep "--help names the watchdog default" 'default: 12;' "$SANDBOX/help"
assert_grep "--help ends with the last header line" 'Suite: grok-review.test.sh' "$SANDBOX/help"
assert_grep "the prompt opens with the no-plan rule" '^\*\*Do not announce a plan\. Your FIRST action must be a tool call' <(head -1 "$FAKE_DIR/last-prompt.md")
assert_grep "grok gets read-only tools" '^read_file,grep,list_dir$' "$FAKE_DIR/last-argv"
assert_eq "grok is denied MCP, shell, edit, write and web" "Bash Edit MCPTool WebFetch Write" "$(grep -A1 -E '^--deny$' "$FAKE_DIR/last-argv" | grep -vE '^--' | sort | tr '\n' ' ' | sed 's/ $//')"
set +e; bash "$REVIEW" --force --max-turns 5 --effort low > /dev/null 2>&1; set -e
assert_grep "--max-turns flows into the prompt budget" 'at most 5 tool turns' "$FAKE_DIR/last-prompt.md"

echo "STUB (a 1-turn progress stub ⇒ one automatic retry with the tools)"
reply "$PROGRESS" end_turn 1; reply_resume "$PASS_VERDICT" 5
touch "$FAKE_DIR/tools-on-resume"; rm -f "$FAKE_DIR/did-resume"; before=$(calls)
set +e; bash "$REVIEW" --force > "$SANDBOX/out20" 2>"$SANDBOX/err20"; rc=$?; set -e
sid=$(grep -A1 -E '^--session-id$' "$FAKE_DIR/review-argv" | tail -1)
assert_eq "stub, then the retry answers ⇒ exit 0 after two calls" "0/$((before+2))" "$rc/$(calls)"
assert_eq "the retry resumes the session of the review call" "$sid" "$(grep -A1 -E '^--resume$' "$FAKE_DIR/resume-argv" | tail -1)"
assert_grep "the retry prompt says continue" '^You stopped after announcing your plan\. Continue now: use your tools, then return ONLY the JSON verdict\.$' "$FAKE_DIR/last-prompt.md"
assert_not_grep "the retry prompt does not forbid tools" 'Do NOT call any tool' "$FAKE_DIR/last-prompt.md"
assert_grep "the retry keeps the read-only tool allowlist" '^read_file,grep,list_dir$' "$FAKE_DIR/resume-argv"
assert_eq "the retry gets the rest of the turn budget (14 - 1)" 13 "$(grep -A1 -E '^--max-turns$' "$FAKE_DIR/resume-argv" | tail -1)"
assert_eq "trailer retries=1" 1 "$(field "$SANDBOX/out20" retries)"
assert_eq "trailer evidence=full (the retry read files)" full "$(field "$SANDBOX/out20" evidence)"
assert_eq "trailer session= is the session id" "$sid" "$(field "$SANDBOX/out20" session)"
assert_eq "trailer turns = both calls" 6 "$(field "$SANDBOX/out20" turns)"
assert_grep "the session id is on stderr for a good run too" "^grok-review: session $sid" "$SANDBOX/err20"
assert_grep "the report names the retry" 'automatic retry after a 1-turn stub' "$SANDBOX/out20"
set +e; bash "$REVIEW" > "$SANDBOX/out20b" 2>/dev/null; set -e
assert_eq "a cache hit keeps retries, evidence and session" "1/1/full/$sid" "$(field "$SANDBOX/out20b" cached)/$(field "$SANDBOX/out20b" retries)/$(field "$SANDBOX/out20b" evidence)/$(field "$SANDBOX/out20b" session)"
rm -f "$FAKE_DIR/tools-on-resume" "$FAKE_DIR/did-resume" "$FAKE_DIR/reply-resume.json"

reply "Starting independent review. I will read docs/invariants.md first." end_turn 1    # the text form of the stub
touch "$FAKE_DIR/no-tools"; before=$(calls)
set +e; bash "$REVIEW" --force > "$SANDBOX/out21" 2>"$SANDBOX/err21"; rc=$?; set -e
sid=$(grep -A1 -E '^--session-id$' "$FAKE_DIR/review-argv" | tail -1)
assert_eq "stub twice ⇒ exit 3 after ONE retry (two calls, not three)" "3/$((before+2))" "$rc/$(calls)"
assert_grep "stub twice ⇒ the session id is printed with the resume advice" "^grok-review: session $sid .*--conclude $sid --conclude-tools" "$SANDBOX/err21"
assert_grep "stub twice ⇒ stderr says the retry was spent" 'again after the 1 automatic retry' "$SANDBOX/err21"
assert_eq "stub twice ⇒ BLIND trailer with the session, retries=1, evidence=diff-only" "BLIND/$sid/1/diff-only" "$(field "$SANDBOX/out21" verdict)/$(field "$SANDBOX/out21" session)/$(field "$SANDBOX/out21" retries)/$(field "$SANDBOX/out21" evidence)"
assert_eq "stub twice ⇒ the trailer is the last line on stdout" 1 "$(tail -1 "$SANDBOX/out21" | grep -c '^grok-review: .* verdict=BLIND$')"
assert_grep "stub twice ⇒ the raw output is kept and named" 'raw grok output kept at .*\.raw\.json' "$SANDBOX/err21"
reply "$PROGRESS" end_turn 1; reply_resume "$PASS_VERDICT" 1
set +e; bash "$REVIEW" --force > "$SANDBOX/out22" 2>/dev/null; rc=$?; set -e
assert_eq "a verdict from a session that opened no file ⇒ evidence=diff-only" "0/diff-only" "$rc/$(field "$SANDBOX/out22" evidence)"
assert_grep "the report labels a diff-only verdict" 'DIFF-ONLY: the reviewer opened no file' "$SANDBOX/out22"
rm -f "$FAKE_DIR/reply-resume.json"

echo "CONCLUDE (a session that read nothing is not concluded without tools)"
reply "$PASS_VERDICT"; before=$(calls)
set +e; bash "$REVIEW" --conclude 22222222-2222-4333-8444-555555555555 > "$SANDBOX/out23" 2>"$SANDBOX/err23"; rc=$?; set -e
assert_eq "tool-less conclude of a session with no tool call ⇒ refused, exit 3, no call" "3/$before" "$rc/$(calls)"
assert_grep "the refusal says why" 'made no tool call, so it read nothing' "$SANDBOX/err23"
assert_grep "the refusal names --conclude-tools" 'add --conclude-tools' "$SANDBOX/err23"
assert_eq "the refusal prints a BLIND trailer with the session" "BLIND/22222222-2222-4333-8444-555555555555" "$(field "$SANDBOX/out23" verdict)/$(field "$SANDBOX/out23" session)"
rm -f "$FAKE_DIR/no-tools"; touch "$FAKE_DIR/tools-on-resume"; rm -f "$FAKE_DIR/did-resume"
set +e; bash "$REVIEW" --conclude 22222222-2222-4333-8444-555555555555 --conclude-tools > "$SANDBOX/out24" 2>/dev/null; rc=$?; set -e
assert_eq "--conclude-tools ⇒ one resume call, exit 0, evidence=full" "0/$((before+1))/full" "$rc/$(calls)/$(field "$SANDBOX/out24" evidence)"
assert_grep "--conclude-tools resumes with the continue prompt" 'Continue now: use your tools' "$FAKE_DIR/last-prompt.md"
assert_eq "--conclude-tools gets the full turn budget" 14 "$(grep -A1 -E '^--max-turns$' "$FAKE_DIR/resume-argv" | tail -1)"
rm -f "$FAKE_DIR/tools-on-resume" "$FAKE_DIR/did-resume"
touch "$FAKE_DIR/no-export"
set +e; bash "$REVIEW" --force > "$SANDBOX/out25" 2>/dev/null; rc=$?; set -e
assert_eq "no \`grok export\`: a 4-turn call counts as evidence=full" "0/full" "$rc/$(field "$SANDBOX/out25" evidence)"
set +e; bash "$REVIEW" --conclude 22222222-2222-4333-8444-555555555555 > "$SANDBOX/out26" 2>"$SANDBOX/err26"; rc=$?; set -e
assert_eq "no \`grok export\`: --conclude runs, labelled evidence=diff-only" "0/diff-only" "$rc/$(field "$SANDBOX/out26" evidence)"
rm -f "$FAKE_DIR/no-export"

echo "TURN CAP (no verdict at the cap ⇒ one conclude call on the same session)"
reply "$PASS_VERDICT"
touch "$FAKE_DIR/max-turns"; before=$(calls)
set +e; bash "$REVIEW" --force > "$SANDBOX/out12" 2>"$SANDBOX/err12"; rc=$?; set -e
rm -f "$FAKE_DIR/max-turns"
assert_eq "cap hit, conclude answers ⇒ exit 0" 0 "$rc"
assert_eq "cap hit ⇒ two calls: the review and the conclude" $((before+2)) "$(calls)"
assert_eq "the conclude call resumes the session of the review call" "$(grep -A1 -E '^--session-id$' "$FAKE_DIR/review-argv" | tail -1)" "$(grep -A1 -E '^--resume$' "$FAKE_DIR/resume-argv" | tail -1)"
assert_grep "the conclude prompt forbids tools" 'Do NOT call any tool' "$FAKE_DIR/last-prompt.md"
assert_grep "the report says the verdict was forced" 'verdict forced at the turn cap' "$SANDBOX/out12"
touch "$FAKE_DIR/max-turns-always"
set +e; bash "$REVIEW" --force > "$SANDBOX/out13" 2>"$SANDBOX/err13"; rc=$?; set -e
rm -f "$FAKE_DIR/max-turns-always"
assert_eq "cap hit and the conclude call fails too ⇒ exit 3" 3 "$rc"
assert_grep "the failed conclude is named in stderr" 'conclude call for session .* failed' "$SANDBOX/err13"
before=$(calls)
set +e; bash "$REVIEW" --conclude 11111111-2222-4333-8444-555555555555 > "$SANDBOX/out14" 2>/dev/null; rc=$?; set -e
assert_eq "--conclude <id> ⇒ one call, the resume, exit 0" "0/$((before+1))" "$rc/$(calls)"
assert_grep "--conclude resumes the given session" '^11111111-2222-4333-8444-555555555555$' "$FAKE_DIR/resume-argv"
git checkout -q -- server/api/save.post.ts

echo "GRAPH (graph present ⇒ graph callers listed and pasted)"
mkdir -p graphify-out && echo '{}' > graphify-out/graph.json
reply "$PASS_VERDICT"
printf '\n// graph\n' >> app/utils/greet.ts
set +e; bash "$REVIEW" --files app/utils > "$SANDBOX/out10" 2>/dev/null; rc=$?; set -e
assert_eq "review with graph ⇒ exit 0" 0 "$rc"
assert_grep "impact map lists the caller from the graph" '^- \.setup\(\) \[calls\] app/pages/index.vue:L3' "$FAKE_DIR/last-prompt.md"
assert_grep "graph caller source is pasted with line numbers" '^<caller file="app/pages/index.vue" lines="1-' "$FAKE_DIR/last-prompt.md"
rm -rf graphify-out; git checkout -q -- app/utils/greet.ts

echo "WATCHDOG"
touch "$FAKE_DIR/hang"
printf '\n// hang\n' >> server/api/save.post.ts
set +e; bash "$REVIEW" --timeout 0.05 > "$SANDBOX/out11" 2>"$SANDBOX/err11"; rc=$?; set -e
rm -f "$FAKE_DIR/hang"
assert_eq "hung grok ⇒ exit 3" 3 "$rc"
assert_grep "watchdog names itself in stderr" 'watchdog killed grok' "$SANDBOX/err11"
assert_eq "no grok process left behind" 0 "$(pgrep -f "$BIN/grok" | wc -l | tr -d ' ')"
git checkout -q -- server/api/save.post.ts

echo "IMPACT (impact-map.py on the fixture tree)"
impact() { # changed files... ⇒ $SANDBOX/impact  (a diff of the working tree must exist for symbols)
    git diff HEAD -- "$@" > "$SANDBOX/impact.diff"; printf '%s\n' "$@" > "$SANDBOX/impact.files"
    python3 "$IMPACT" --repo "$REPO" --diff "$SANDBOX/impact.diff" --files "$SANDBOX/impact.files" > "$SANDBOX/impact"
}
printf "export const THING = 2\n" > content/thing.ts
impact content/thing.ts
assert_grep "importer through a #alias of nuxt.config.ts" '^- \[import\] app/composables/useGreeting.ts:L2$' "$SANDBOX/impact"
assert_grep "changed exported symbol is named" '^Changed exported symbols: `THING`' "$SANDBOX/impact"
git checkout -q -- content/thing.ts
impact app/components/editor/TextField.vue
assert_grep "auto-imported component: folder-prefixed tag" '^- \[tag <EditorTextField>\] app/components/editor/Form.vue:L3$' "$SANDBOX/impact"
assert_grep "auto-imported component: kebab tag" '^- \[tag <editor-text-field>\] app/components/editor/Form.vue:L4$' "$SANDBOX/impact"
sed -i.bak 's/return GREETING + name/return GREETING + " " + name/' app/utils/greet.ts && rm app/utils/greet.ts.bak
impact app/utils/greet.ts
assert_grep "changed symbol from the hunk header, used with no import line" '^- \[symbol greetUser\] app/pages/index.vue:L3$' "$SANDBOX/impact"
assert_grep "tests are listed and marked" '^- \[import\] tests/e2e/save.spec.ts:L1 \(test\)$' "$SANDBOX/impact"
assert_eq "tests come after the code" "test-last" "$(grep -E '^- \[' "$SANDBOX/impact" | awk '/\(test\)$/{t=1; next} t{bad=1} END{print bad ? "test-first" : "test-last"}')"
git checkout -q -- app/utils/greet.ts
impact scripts/build-thing.ts
assert_grep "npm script name: the hook that runs it" '^- \[script build:thing\] package.json:L5$' "$SANDBOX/impact"
assert_grep "npm script name: the README that documents it" '^- \[script build:thing\] README.md:L3$' "$SANDBOX/impact"
printf '\n// more\n' >> app/utils/many.ts
impact app/utils/many.ts
assert_eq "at most 40 references per changed file" 40 "$(grep -cE '^- \[(auto-import|symbol) manyThing\]' "$SANDBOX/impact")"
assert_grep "the cap is stated with the rest count" '^- \.\.\. 20 more references not listed \(cap 40\)$' "$SANDBOX/impact"
assert_eq "<caller> blocks are de-duplicated per 25-line window" 2 "$(grep -c '^<caller file="app/pages/many.vue"' "$SANDBOX/impact")"
assert_grep "the map states that it is not exhaustive" 'It is not exhaustive' "$SANDBOX/impact"
git checkout -q -- app/utils/many.ts

echo
TOTAL=$((PASSED+FAILED))
echo "grok-review.test: passed=$PASSED failed=$FAILED total=$TOTAL expected=$EXPECTED_ASSERTIONS"
[[ "$FAILED" -eq 0 && "$TOTAL" -eq "$EXPECTED_ASSERTIONS" ]] || exit 1
