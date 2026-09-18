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
- What Grok may do: `read_file`, `grep`, `list_dir` on the checkout. No subagents. MCP, shell, edit, write and web are denied by rule. Effort `medium`, 8 turns, watchdog 8 minutes.
- What comes back: a JSON verdict forced by `grok-review.schema.json`. `critical` and `warning` block. The last line is the trailer: `grok-review: scope=… files=N diff_chars=N cached=0|1 turns=N elapsed_s=N tokens_in=N tokens_out=N critical=N warning=N suggestion=N verdict=PASS|FAIL`.
- Exit codes: `0` PASS, `1` FAIL, `2` usage or empty diff or a diff over 150,000 characters (use `--files`), `3` no valid verdict.
- Grok reads the CHECKOUT. Review a branch from a checkout of that branch; when the range head differs from the checkout, the script says so in the prompt and on stderr.
- Judge every finding yourself: real, false positive, or already fixed. Fix the blocking ones, answer the rest in `NOTES.md`. Max 2 rounds (`PLAN.md` section 9).
- Cost, measured here: 14 to 17 cents and 4 to 6 minutes per block. Grok Build CLI 1.0.30, model `grok-4.6-build`, login in `~/.grok`.

## The blind-run guard
A wrapper that prints green when the reviewer said nothing is worse than no review. Exit `3`, never `0`, when:
- the output is not JSON, or no verdict object is in it, or text follows the verdict;
- `stopReason` is not `end_turn`;
- `passed: true` with a blocking finding, or `passed: false` with no finding at all (a progress stub: with `--json-schema` Grok emits one of those before every tool turn);
- a finding lacks a field, has a category outside the enum, a non-integer line, or an empty text;
- Grok exits non-zero, or the watchdog kills it.
The raw output stays next to the cache as `<hash>.raw.json`.

**The turn cap.** Grok 1.0.30 does not count its turns. At `--max-turns` it exits 1 with `max turns reached` and no verdict. The script then resumes the SAME session once (`--resume <id>`, "no more tools, write the verdict from what you have read", 2 turns, 3 minutes). The report says `verdict forced at the turn cap`. A blind run prints its session id; `--conclude <id>` on the same command does that step alone, so the reading is not paid for twice.

## The cache
`<git common dir>/grok-review/<sha256(diff + prompt template + schema)>.json`. The same blobs make no call: `cached=1`, under a second, no ledger row. `--force` calls again. A blind run is never cached. An edit of the prompt or of the schema empties the cache by design.

## The ledger loop
`--ledger` appends each finding of a fresh verdict to `scripts/review/findings-ledger.jsonl` with its category; OCR, agent and owner-reported findings go in by hand:
```sh
npm run review:ledger -- add --source human --branch fix/x --category editor-state --severity warning --file app/pages/edit.vue --claim "what was wrong"
npm run review:ledger -- report
```
Duplicates of (source, branch or PR, id) are refused. **The top category of the report becomes the next scripted check**: a test or a script that catches that shape for free, every time. Today the top is `untrusted-input` (21 of 99), then `second-code-path` (12) and `editor-state` (11). The scripted checks that exist for them: `tests/e2e/unfurl.spec.ts`, `security.spec.ts`, `security-dev.spec.ts`, `editor-inputs.spec.ts`.

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
| Effort and turns | default effort, no turn limit | `--effort medium`, `--max-turns 8`, one conclude call at the cap |
| A hung call | waited for ever | watchdog, 8 minutes, exit 3 |
| No verdict | looked like "no findings" | exit 3, raw output kept |
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
