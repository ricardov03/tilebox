# Code review tools on tilebox: OCR vs Grok (2026-09-17)

Setup: both ran headless from the shell, per commit on small diffs. Same background file with the review rules.
OCR = open-code-review v1.12.5 with DeepSeek `deepseek-v4-pro`. Grok = Grok Build CLI 1.0.30, model `grok-4.6-build`, `--permission-mode dontAsk`.

| | OCR (DeepSeek) | Grok |
|---|---|---|
| Runs | 7 (6 commits + 1 range) | 12 (10 commits + 2 range attempts) |
| Time per run | 4 to 6 min | 1 to 5 min per commit, 11 min for the range |
| Cost per run | 260k to 560k tokens (DeepSeek pricing, cheap) | 4 to 10 cents per commit, 37 cents for the range |
| Findings per run | 2 to 11 | 5 to 17 |
| Useful rate (applied or valid-but-deferred) | about 55 percent | about 75 percent |
| False positives | Many from single-commit blindness: "scripts missing", "provider not set", "~~ alias wrong" (wrong about Nuxt 4), "vue-router pin" | Some single-commit blindness too: "useTheme never called", "helpers do not exist", "vue-draggable-plus not a dependency" (all in a neighbor commit) |
| Best catches | href scheme allow-list (javascript: URLs), YouTube id regex, favicon size cap, CI permissions and edit.html guard, zod `.strict()` | Theme hydration order, mobile order breakpoint mismatch (max-md vs lg), atomic save, upload MIME edge cases, stale icon search responses, tab keyboard model, weak test assertions |
| Output format | Its own block format with diff suggestions. Ready to paste. | Followed my one-line format exactly. Easy to triage. |
| Reliability | 7 of 7 completed. 1 partial (token budget hit). | Plan mode: 0 of 3 completed (silent "cancelled"). dontAsk mode: 10 of 13 completed. 3 cancelled with no reason given. Large tool output seems to trigger the cancel. |
| Needs | An API key. Works out of the box. | Grok Build login. Flags must be tuned (dontAsk, tool budget, JSON output). |

## Verdict
- Grok gave the better review on this project. Fewer, sharper findings, strong on a11y, hydration and test quality. It also followed the output format, which made triage fast.
- OCR is the safer tool to automate. It never silently died, it gives diff suggestions, and it is cheap. Its noise is manageable if you review a branch range instead of single commits.
- Both share one weakness: reviewing one commit at a time hides context from the neighbor commits. Small commits are good for humans. For AI review, a branch range with excluded generated files works better. Use per-commit only for large commits.

## Large or security-critical files (2026-09-18)
WP10 added `content/unfurl.ts` (about 850 lines, the only code here that fetches URLs chosen by user input). Both tools were asked for range reviews of it.
- OCR (DeepSeek) timed out on 3 of 5 large range reviews.
- Grok cancelled on 5 of 5.
- A dedicated review agent that runs real exploit attempts (it wrote payloads and ran them against the engine) found a stored XSS through a favicon SVG: six ways past a regex check. That is the kind of finding both tools would have been asked to make.

Recommendation:
- OCR or Grok for small diffs.
- An adversarial, test-writing review for anything that touches the network, the file system or auth. Every finding comes with a test that fails before the fix.

## Recommendation for next time
1. Default: OCR on the branch range at the end of each work package (one run, about 6 min).
2. Add Grok on the risky files only (server routes, hydration, a11y) with the chunked-diff prompt, dontAsk mode, JSON output, and a retry on "cancelled".
3. Never both on the same diff.
