# Code review on tilebox

State: 2026-09-18. Code: `scripts/review/`. Rules the reviewer checks: `docs/invariants.md`. Numbers: `NOTES.md` > "Review pipeline".

## The one rule
**The model that writes the code is never the model that reviews it.** The author's own check finds what the author already thought of. A second model, with no context and no trust in the description, finds "the other place that also needed the change". A review that gave no verdict is not a pass.

## The default: Grok, local, per block
```sh
# One block of a branch, before the merge (a block = one concern, up to about 30,000 diff characters):
npm run review -- --range main..wp/11-x --files content/unfurl.ts server/api/unfurl.post.ts --scope block --title "what the block does" --ledger

# The working tree, before the commit (new, untracked files are included):
npm run review -- --files app/components/editor

# The whole branch, before the push (how the blocks fit together):
npm run review -- --range origin/main..HEAD --scope pr --ledger

# See the prompt, call nothing:
npm run review -- --dry-run --range main..wp/11-x
```
- What Grok gets: the diff pasted INTO the prompt, the intent (title + PR body, else the commit messages of the range), and an **impact map** from `scripts/review/impact-map.py`: importers (relative, `~/`, `~~/`, `#alias`), Nuxt auto-imported component tags and util calls, exported symbols the diff touches, npm script names, `/api` routes, schema keys, with the 25 lines around each call site pasted in. The map is a text search. It says so, and the prompt sends Grok to grep the changed symbols itself.
- What Grok may do: `read_file`, `grep`, `list_dir` on the checkout. No subagents, no plan mode (`--no-plan`). MCP, shell, edit, write and web are denied by rule. Effort `medium`, 14 turns, watchdog 12 minutes (`--max-turns`, `--timeout`). With 8 turns real blocks hit the cap and paid for a conclude call; with 14 none did.
- What comes back: a JSON verdict forced by `grok-review.schema.json` and checked by `scripts/review/grok-verdict.py`. `critical` and `warning` block. The last line on stdout is the trailer, for EVERY outcome (see "How to read a trailer line").
- Exit codes: `0` PASS, `1` FAIL, `2` usage or empty diff or a diff over 150,000 characters (use `--files`), `3` no valid verdict (`verdict=BLIND`).
- The session id is printed on stderr at the start of every call (`grok-review: session <id>`) and is in the trailer (`session=<id>`). `grok export <id>` shows what the reviewer read, `grok usage <id>` what it cost.
- Grok reads the CHECKOUT. Review a branch from a checkout of that branch; when the range head differs from the checkout, the script says so in the prompt and on stderr.
- Judge every finding yourself: real, false positive, or already fixed. Fix the blocking ones, answer the rest in `NOTES.md`. Max 2 rounds (`PLAN.md` section 9).
- Cost, measured here: 14 to 50 cents and 4 to 9 minutes per block. A 1-turn stub costs about 3 cents. Grok Build CLI 1.0.30, model `grok-4.6-build`, login in `~/.grok`.

## The blind-run guard
A wrapper that prints green when the reviewer said nothing is worse than no review. Exit `3`, never `0`, when:
- the output is not JSON, or no verdict object is in it, or text follows the verdict;
- `stopReason` is not `end_turn`;
- `passed: true` with a blocking finding, or `passed: false` with no finding at all (a progress stub: with `--json-schema` Grok emits one of those before every tool turn);
- a finding lacks a field, has a category outside the enum, a non-integer line, or an empty text;
- Grok exits non-zero, or the watchdog kills it.
The raw output stays next to the cache as `<hash>.raw.json`, the session id is printed with the command that resumes it, and the trailer says `verdict=BLIND`.

**The first-turn stub.** Grok sometimes answers the schema before it opens a file: `num_turns` 1, `passed: false`, no finding, a summary that says it is starting (or a plain sentence that announces a plan). Measured here: 3 of 6 fresh calls in the WP14 round, 1 of 4 in WP15, 1 of 3 in WP16, about 3 cents each (the WP16 one: $0.028, 1 turn, 40,548 tokens in). The script makes ONE automatic retry, and since WP16 that retry is a **fresh call**: a new session (`--session-id`, never `--resume`), the same flags, the full turn budget, and the same prompt with one section appended ("## Retry": "Your previous attempt returned the verdict JSON on its FIRST turn, before reading a single file. That is not a review and it was discarded. Your first action now MUST be a tool call ..."). stderr says `grok-review: progress stub on attempt 1 (one turn, no findings) — retrying once`. The trailer counts it: `retries=1`; `session=` is the session of the retry and `_meta.stub_session_id` is the discarded one. Turns, tokens and cost of both sessions are added up. A second stub is exit 3, never green.
- **Why a fresh call and not a resume (WP15 resumed the same session).** A resumed session keeps its own empty answer in its context. The owner measured the fresh call in his other project, where the same script runs: 8 of 8 stubs had exactly this shape, and EVERY forced retry as a fresh call gave a real verdict. WP15 here had one resume that worked; 8 of 8 is the better number, so this repo now does the same. First live case here (WP16, block R2): the fresh call came back with 9 turns, 49 tool calls, `evidence=full` and a real warning.
- **What counts as a stub (two signals, either one).** A, the measured shape: `num_turns` absent or 1 or less, and the last schema-shaped object of `.text` has `passed === false` and `findings == []`. B, kept from WP15: the run ended with `end_turn`, `grok export` counted zero tool calls (or `num_turns` is 1 or less), and there is no valid verdict at all (plain text such as "Starting the review", or the empty verdict). B costs at most one more call and can never turn a run green.
- **The cache key does not see the retry.** The key is `sha256(diff + prompt template + schema)`. The "## Retry" section is appended to the rendered prompt of the second call only, so the verdict of a retry is stored under the same key as a verdict with no retry.
- Four things try to stop the stub at the source: `--no-plan`, a `--rules` line, the first line of the prompt, and (WP16) the first bullet of "How to work": "Your first action must be a tool call. ... A verdict whose summary says you are starting or still reading is not a verdict; it is discarded and the run is retried." Numbers: `NOTES.md` > "WP15 review follow-up" and "WP16".

**Evidence.** A verdict from a session that opened no file is a verdict on the pasted diff alone. The script counts the tool calls of the session (`grok export <id>`: one `- Read:` / `- Search:` / `- List:` line per call) and labels the verdict: `evidence=full` when a `read_file` or a `grep` happened, else `evidence=diff-only` (the report header then says `DIFF-ONLY: the reviewer opened no file`). Both are in `_meta` of the verdict JSON, with `retries`, `tool_calls` and `session_id`. Without `grok export` the fallback is the turn count (2 or more turns = tools were called). Treat `diff-only` as "not reviewed yet".

**The turn cap.** Grok 1.0.30 does not count its turns. At `--max-turns` it exits 1 with `max turns reached` and no verdict. The script then resumes the SAME session once (`--resume <id>`, "no more tools, write the verdict from what you have read", 2 turns, 3 minutes). The report says `verdict forced at the turn cap`. The conclude call has 5 minutes. Every blind run prints its session id; `--conclude <id>` on the same command does that step alone, so the reading is not paid for twice. **`--conclude` is refused (exit 3) when the session made no tool call**: it read nothing, so a tool-less verdict would be diff-only. Then add `--conclude-tools` (resume WITH the tools, `--max-turns` turns, the `--timeout` watchdog), or run the review again.

## How to read a trailer line
`grok-review: scope=block files=3 diff_chars=23804 cached=0 turns=6 elapsed_s=423 tokens_in=385379 tokens_out=21067 retries=0 evidence=full session=f745f3b4-… critical=0 warning=2 suggestion=0 verdict=FAIL`

| Field | Meaning | Look twice when |
|---|---|---|
| `scope` | `block` or `pr` | |
| `files`, `diff_chars` | what was pasted into the prompt | over about 30,000 characters: split the block |
| `cached` | `1` = the same diff, prompt and schema: no call, no ledger row | |
| `turns` | model calls of the whole run (review + conclude, plus the discarded stub session after a retry) | `1` or `2` with `evidence=diff-only` |
| `elapsed_s`, `tokens_in`, `tokens_out` | wall time and tokens of the session (`grok usage <id>`) | |
| `retries` | automatic fresh calls after a first-turn stub: `0` or `1` | `1` with `verdict=BLIND`: the stub came twice, run it again |
| `evidence` | `full` = the reviewer read a file or ran a grep. `diff-only` = it judged the pasted diff alone. `none` = no call (`DRY-RUN`, `EMPTY`). `unknown` = a cache entry from before WP15 | `diff-only`: not a full review |
| `session` | the Grok session id (`-` when no call was made; after a retry, the session of the retry) | use it with `grok export`, `grok usage`, `--conclude` |
| `critical`, `warning`, `suggestion` | counts of the verdict | |
| `verdict` | `PASS` (exit 0), `FAIL` (exit 1), `BLIND` (exit 3, no valid verdict), `EMPTY` (exit 2), `DRY-RUN` (exit 0) | `BLIND` is never a pass |

## The cache
`<git common dir>/grok-review/<sha256(diff + prompt template + schema)>.json` (`GROK_REVIEW_CACHE_DIR` moves the folder). The same blobs make no call: `cached=1`, under a second, no ledger row. `--force` calls again. A blind run is never cached. An edit of the prompt or of the schema empties the cache by design.

## The ledger loop
`--ledger` appends each finding of a fresh verdict to `scripts/review/findings-ledger.jsonl` with its category; OCR, agent and owner-reported findings go in by hand:
```sh
npm run review:ledger -- add --source human --branch fix/x --category editor-state --severity warning --file app/pages/edit.vue --claim "what was wrong"
npm run review:ledger -- report
```
Duplicates of (source, branch or PR, id) are refused. **The top category of the report becomes the next scripted check**: a test or a script that catches that shape for free, every time. Today the top is `untrusted-input` (22 of 108), then `editor-state` (15) and `second-code-path` (13). A finding that was OPEN and is fixed later gets a second row on the fixing branch (`FIXED in <commit>`): the ledger has no status field and old rows are never rewritten. The scripted checks that exist for them: `tests/e2e/unfurl.spec.ts`, `security.spec.ts`, `security-dev.spec.ts`, `editor-inputs.spec.ts`.

## When to use something else
- **OCR (open-code-review, DeepSeek) when Grok is not available** (no login, quota, outage). Range review of the branch, generated files excluded. It never died silently, it gives diff suggestions, it is cheap (260k to 560k tokens). About 55 percent of its findings were useful against about 75 percent for Grok, and it timed out on 3 of 5 large ranges. Never both tools on the same diff.
- **A dedicated adversarial review agent for anything that touches the network, the file system or auth.** Lesson of 2026-09-18: `content/unfurl.ts` (about 850 lines, the only code that fetches URLs chosen by user input) went to both tools as a range review. OCR timed out on 3 of 5. Grok cancelled on 5 of 5. An agent that wrote payloads and RAN them against the engine found a stored XSS through a favicon SVG (six ways past a regex), an SSRF form, a trusted cache file and cross-site dev routes (`NOTES.md` > "WP10 security round", S1 to S6). Every finding came with a test that fails before the fix. A reading reviewer does not run exploits. Use both: the agent first, then `npm run review` on the fix per block. On that same engine the new pipeline found 3 more real defects in 6 minutes.
- A model never reviews its own branch, whatever the tool.

## What went wrong on 2026-09-18
Grok "cancelled" on 8 of 13 reviews (plan mode: 0 of 3 completed). Cause: the reviewer prompt made Grok fetch the diff through its shell tool, with every tool and every MCP server enabled. Large tool output ended the run with no reason given.

| | Before | After (`scripts/review/grok-review.sh`) |
|---|---|---|
| The diff | Grok ran `git diff` in its shell tool | pasted into `--prompt-file`; over 150,000 characters is refused |
| Tools | all, plus every MCP server, `--permission-mode dontAsk` | `--tools read_file,grep,list_dir`, `--disallowed-tools Agent`, `--deny MCPTool/Bash/Edit/Write/WebFetch` |
| The answer | free text in "my one-line format" | `--json-schema` + `--output-format json`, checked field by field |
| Effort and turns | default effort, no turn limit | `--effort medium`, `--max-turns 14`, `--no-plan`, one fresh retry after a first-turn stub, one conclude call at the cap |
| A hung call | waited for ever | watchdog, 12 minutes, exit 3 |
| No verdict | looked like "no findings" | exit 3, `verdict=BLIND`, raw output kept, session id printed |
| The same diff twice | paid twice | cache, no call |
| Context | one commit, blind to its neighbors | a block of the branch range + the impact map + pre-read call sites |
| Findings | in a chat | the ledger, with a category |

Result after: 2 of 2 blocks got a verdict (5 real findings, 0 false positives). Two first tries were blind runs at the turn cap; they are why the conclude step exists.

## Older numbers (2026-09-17, per-commit reviews, before the pipeline)
| | OCR (DeepSeek `deepseek-v4-pro`, v1.12.5) | Grok (`grok-4.6-build`, dontAsk mode) |
|---|---|---|
| Runs | 7 (6 commits + 1 range), 7 completed | 12 (10 commits + 2 ranges), 10 of 13 completed |
| Time per run | 4 to 6 min | 1 to 5 min per commit, 11 min for the range |
| Cost per run | 260k to 560k tokens | 4 to 10 cents per commit, 37 cents for the range |
| Best catches | href scheme allow-list, YouTube id regex, favicon size cap, CI permissions, zod `.strict()` | theme hydration order, phone order breakpoint, atomic save, upload MIME cases, stale icon search, tab keyboard model, weak test assertions |
| False positives | single-commit blindness: "scripts missing", "`~~` alias wrong" | the same: "useTheme never called", "helpers do not exist" |

Both were blind to the neighbor commits. That is why the unit of review is now a block of the branch range, not a commit.
