#!/usr/bin/env python3
"""scripts/review/grok-verdict.py: reads the JSON envelope of one Grok call for grok-review.sh.

  grok-verdict.py is-stub <envelope> <tool calls | unknown>
      exit 0 = a first-turn stub (the script retries once, as a FRESH call), 1 = anything else.
  grok-verdict.py merge-usage <usage a> <usage b> <out>
      adds the `session` counters of two `grok usage` files (the retry session + the discarded stub session).
  grok-verdict.py final <envelope> <out> <hash> <scope> <schema> <elapsed> <usage> <concluded 0|1>
                        <session id> <prior turns> <retries> <evidence> <tool calls | unknown> <stub session | ->
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
    """Two signals, either one is a stub.
    A, the measured shape (8 of 8 stubs in the owner's other project): `num_turns` absent or <= 1, and the last
       schema-shaped object of `.text` says passed=false with findings == [].
    B, kept from WP15: the run ended on its own (`end_turn`), `grok export` counted ZERO tool calls (or
       `num_turns` <= 1), and there is no valid verdict at all: nothing schema-shaped ("Starting the review…"
       as plain text), or passed=false with zero findings."""
    try:
        envelope = json.load(open(raw_f, encoding="utf-8"))
    except Exception:
        return False
    if not isinstance(envelope, dict):
        return False
    turns = envelope.get("num_turns")
    counted = isinstance(turns, int) and not isinstance(turns, bool)
    verdict, _ = last_verdict(envelope.get("text") or "")
    empty_verdict = verdict is not None and verdict["passed"] is False and verdict["findings"] == []
    if (turns is None or (counted and turns <= 1)) and empty_verdict:
        return True                                                     # signal A
    read_nothing = tools == "0" or (counted and turns <= 1)
    return stop_of(envelope) == "endturn" and read_nothing and (verdict is None or empty_verdict)   # signal B


def merge_usage(a_f, b_f, out_f):
    def session(path):
        try:
            return (json.load(open(path, encoding="utf-8")) or {}).get("session") or {}
        except Exception:
            return {}
    a, b = session(a_f), session(b_f)
    merged = dict(a)
    for key in ("modelCalls", "inputTokens", "outputTokens", "cachedReadTokens", "costUsdTicks"):
        if isinstance(a.get(key), (int, float)) or isinstance(b.get(key), (int, float)):
            merged[key] = (a.get(key) or 0) + (b.get(key) or 0)
    json.dump({"session": merged}, open(out_f, "w", encoding="utf-8"))


def blind(msg):
    sys.stderr.write(f"{msg}\n")
    sys.exit(1)


def final(argv):
    raw_f, out_f, digest, scope, schema_f, elapsed, usage_f = argv[:7]
    concluded, session_id, prior_turns = argv[7] == "1", argv[8], int(argv[9])
    retries, evidence, tool_calls = int(argv[10]), argv[11], argv[12]
    stub_session = argv[13] if argv[13] != "-" else None
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
        "retries": retries, "stub_session_id": stub_session, "evidence": evidence, "tool_calls": int(tool_calls) if tool_calls.isdigit() else None,
        "model": books.get("primaryModelId") or next(iter((envelope.get("modelUsage") or {}).keys()), None),
        "tokens_in": books.get("inputTokens") or usage.get("input_tokens", 0),
        "tokens_out": books.get("outputTokens") or usage.get("output_tokens", 0),
        "tokens_cached": books.get("cachedReadTokens"), "cost_usd_ticks": books.get("costUsdTicks"),
    }
    json.dump(verdict, open(out_f, "w", encoding="utf-8"), indent=2, ensure_ascii=False)


if __name__ == "__main__":
    if len(sys.argv) >= 4 and sys.argv[1] == "is-stub":
        sys.exit(0 if is_stub(sys.argv[2], sys.argv[3]) else 1)
    if len(sys.argv) == 5 and sys.argv[1] == "merge-usage":
        merge_usage(sys.argv[2], sys.argv[3], sys.argv[4])
        sys.exit(0)
    if len(sys.argv) == 16 and sys.argv[1] == "final":
        final(sys.argv[2:])
        sys.exit(0)
    sys.stderr.write("usage: grok-verdict.py is-stub <envelope> <tools> | merge-usage <a> <b> <out> | final <14 arguments>\n")
    sys.exit(2)
