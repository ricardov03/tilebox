#!/usr/bin/env python3
"""scripts/review/grok-verdict.py: reads the JSON envelope of one Grok call for grok-review.sh.

  grok-verdict.py is-stub <envelope> <tool calls | unknown>
      exit 0 = a 1-turn progress stub (the script resumes that session once, with the tools), 1 = anything else.
  grok-verdict.py final <envelope> <out> <hash> <scope> <schema> <elapsed> <usage> <concluded 0|1>
                        <session id> <prior turns> <retries> <evidence> <tool calls | unknown>
      writes the checked verdict with its `_meta` to <out>. Exit 1 with ONE reason line on stderr when the
      envelope holds no valid verdict: that is a blind run, and the caller exits 3.

The verdict is the LAST JSON object of `.text` (progress emissions come first), it must be the last thing in
the text, it must satisfy the schema (every finding field, the category enum, integer lines, a non-empty
summary), the run must have ended on its own (`stopReason` end_turn, not max_turns), and `passed` must agree
with the findings: a progress stub says passed=false with zero findings; passed=true over a blocking finding
is a contradiction. passed=false with suggestions only is Grok being strict, not a stub: it is kept and
normalised to passed=true (only critical and warning block).
"""
import json
import sys


def last_verdict(text):
    dec, verdict, verdict_end, i = json.JSONDecoder(), None, 0, 0
    while i < len(text):
        j = text.find("{", i)
        if j < 0:
            break
        try:
            obj, end = dec.raw_decode(text, j)
        except json.JSONDecodeError:
            i = j + 1
            continue
        if isinstance(obj, dict) and isinstance(obj.get("passed"), bool) and isinstance(obj.get("findings"), list):
            verdict, verdict_end = obj, end
        i = end
    return verdict, verdict_end


def stop_of(envelope):
    return str(envelope.get("stopReason") or "").lower().replace("_", "")


def is_stub(raw_f, tools):
    """The run ended on its own after ONE turn (or with no tool call at all), and what it wrote is no verdict:
    nothing schema-shaped ("Starting the review…"), or passed=false with zero findings."""
    try:
        envelope = json.load(open(raw_f, encoding="utf-8"))
    except Exception:
        return False
    if not isinstance(envelope, dict) or stop_of(envelope) != "endturn":
        return False
    turns = envelope.get("num_turns")
    one_turn = (isinstance(turns, int) and not isinstance(turns, bool) and turns <= 1) or tools == "0"
    verdict, _ = last_verdict(envelope.get("text") or "")
    empty = verdict is None or (not verdict["passed"] and not verdict["findings"])
    return one_turn and empty


def blind(msg):
    sys.stderr.write(f"{msg}\n")
    sys.exit(1)


def final(argv):
    raw_f, out_f, digest, scope, schema_f, elapsed, usage_f = argv[:7]
    concluded, session_id, prior_turns = argv[7] == "1", argv[8], int(argv[9])
    retries, evidence, tool_calls = int(argv[10]), argv[11], argv[12]
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
    if stop_of(envelope) != "endturn":
        blind(f"grok did not finish on its own (stopReason={envelope.get('stopReason')!r}): raise --max-turns or retry")
    text = envelope.get("text") or ""
    verdict, verdict_end = last_verdict(text)
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
    try:
        books = (json.load(open(usage_f, encoding="utf-8")) or {}).get("session") or {}
    except Exception:
        books = {}
    # Session totals (every call of the run) come from the CLI's own books; the envelope knows its own call only.
    verdict["_meta"] = {
        "hash": digest, "scope": scope, "elapsed_s": int(elapsed),
        "session_id": session_id or envelope.get("sessionId"), "request_id": envelope.get("requestId"),
        "turns": books.get("modelCalls") or (prior_turns + (envelope.get("num_turns") or 0)),
        "concluded_after_turn_cap": concluded,
        "retries": retries, "evidence": evidence, "tool_calls": int(tool_calls) if tool_calls.isdigit() else None,
        "model": books.get("primaryModelId") or next(iter((envelope.get("modelUsage") or {}).keys()), None),
        "tokens_in": books.get("inputTokens") or usage.get("input_tokens", 0),
        "tokens_out": books.get("outputTokens") or usage.get("output_tokens", 0),
        "tokens_cached": books.get("cachedReadTokens"), "cost_usd_ticks": books.get("costUsdTicks"),
    }
    json.dump(verdict, open(out_f, "w", encoding="utf-8"), indent=2, ensure_ascii=False)


if __name__ == "__main__":
    if len(sys.argv) >= 4 and sys.argv[1] == "is-stub":
        sys.exit(0 if is_stub(sys.argv[2], sys.argv[3]) else 1)
    if len(sys.argv) == 15 and sys.argv[1] == "final":
        final(sys.argv[2:])
        sys.exit(0)
    sys.stderr.write("usage: grok-verdict.py is-stub <envelope> <tools> | final <13 arguments>\n")
    sys.exit(2)
