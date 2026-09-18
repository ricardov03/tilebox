#!/usr/bin/env bash
#
# scripts/review/findings-ledger.sh: the one place every review finding lands, so the pipeline can learn.
#
# Every confirmed finding (Grok through grok-review.sh --ledger, OCR, an adversarial review agent, or a bug
# the owner reported) becomes one JSON line in scripts/review/findings-ledger.jsonl with a category. `report`
# counts them by category, source and area: the top category is the next deterministic check to write in
# scripts/review/ or tests/e2e/ (a reviewer's judgement turned into free code we own). docs/review-tools.md.
#
# Usage:
#   npm run review:ledger -- add --source grok|ocr|agent|human --json <verdict.json> [--branch <name>] [--pr N] [--scope block|pr]
#   npm run review:ledger -- add --source human --branch fix/x --category <c> --severity <s> --file <f> [--line <n>] \
#                                --claim "<text>" [--id <kebab-id>] [--date YYYY-MM-DD]
#   npm run review:ledger -- report [--since YYYY-MM-DD]
#
# Line shape:
#   {"date":"2026-09-18","source":"grok","branch":"fix/editor-inputs","pr":null,"scope":"block","id":"…",
#    "severity":"warning","category":"editor-state","file":"app/…","line":59,"claim":"…"}
#
# De-duplication: a row with an id is refused when (source, pr-or-branch, id) is already there. This repo
# merges branches without PRs, so --branch is the usual key; --pr wins when both are given.
#
# Categories (same enum as grok-review.schema.json): second-code-path · bundled-path · privacy-leak ·
# untrusted-input · editor-state · test-green-wrong-reason · schema-drift · runtime-network · dev-route-guard ·
# a11y · docs · other.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LEDGER_FILE="${FINDINGS_LEDGER:-$SCRIPT_DIR/findings-ledger.jsonl}"
CATEGORIES="second-code-path bundled-path privacy-leak untrusted-input editor-state test-green-wrong-reason schema-drift runtime-network dev-route-guard a11y docs other"
SOURCES="grok ocr agent human"

usage() { sed -n '2,25p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

cmd="${1:-}"; shift || true
case "$cmd" in
    add)
        SOURCE=""; JSON=""; PR=""; BRANCH=""; SCOPE=""; CATEGORY=""; SEVERITY=""; FILE=""; LINE=""; CLAIM=""; ID=""; DATE=""
        while [[ $# -gt 0 ]]; do
            case "$1" in
                --source) SOURCE="$2"; shift 2 ;;
                --json) JSON="$2"; shift 2 ;;
                --pr) PR="$2"; shift 2 ;;
                --branch) BRANCH="$2"; shift 2 ;;
                --scope) SCOPE="$2"; shift 2 ;;
                --category) CATEGORY="$2"; shift 2 ;;
                --severity) SEVERITY="$2"; shift 2 ;;
                --file) FILE="$2"; shift 2 ;;
                --line) LINE="$2"; shift 2 ;;
                --claim) CLAIM="$2"; shift 2 ;;
                --id) ID="$2"; shift 2 ;;
                --date) DATE="$2"; shift 2 ;;
                *) echo "findings-ledger: unknown option $1" >&2; usage >&2; exit 2 ;;
            esac
        done
        case " $SOURCES " in *" $SOURCE "*) ;; *) echo "findings-ledger: --source must be one of: $SOURCES" >&2; exit 2 ;; esac
        python3 - "$LEDGER_FILE" "$SOURCE" "$JSON" "$PR" "$SCOPE" "$CATEGORY" "$SEVERITY" "$FILE" "$LINE" "$CLAIM" "$CATEGORIES" "$BRANCH" "$ID" "$DATE" <<'PY'
import json, sys, datetime
ledger, source, json_f, pr, scope, category, severity, file, line, claim, cats, branch, fid, date = sys.argv[1:15]
cats = cats.split()
today = date or datetime.date.today().isoformat()
rows = []
if json_f:
    v = json.load(open(json_f, encoding="utf-8"))
    for f in v.get("findings", []):
        rows.append({"id": f.get("id"), "severity": f.get("severity"), "category": f.get("category", "other"),
                     "file": f.get("file"), "line": f.get("line"), "claim": (f.get("claim") or "").strip()})
else:
    missing = [k for k, val in (("--category", category), ("--severity", severity), ("--file", file), ("--claim", claim)) if not val]
    if missing:
        sys.stderr.write("findings-ledger: manual add needs " + ", ".join(missing) + "\n"); sys.exit(2)
    rows.append({"id": fid or None, "severity": severity, "category": category, "file": file, "line": int(line) if line else None, "claim": claim.strip()})
bad = [r for r in rows if r["category"] not in cats or r["severity"] not in ("critical", "warning", "suggestion")]
if bad:
    sys.stderr.write(f"findings-ledger: invalid category/severity in {bad}\n"); sys.exit(2)
# A re-run on the same branch (retry, second before-push review) must not double-count a finding:
# the identity is (source, pr-or-branch, id) when the finding carries an id.
def where(pr_value, branch_value):
    return f"pr:{pr_value}" if pr_value is not None else (f"branch:{branch_value}" if branch_value else None)
existing = set()
try:
    for raw in open(ledger, encoding="utf-8"):
        if raw.strip():
            e = json.loads(raw)
            if e.get("id"):
                existing.add((e.get("source"), where(e.get("pr"), e.get("branch")), e.get("id")))
except FileNotFoundError:
    pass
pr_val = int(pr) if pr else None
added = skipped = 0
with open(ledger, "a", encoding="utf-8") as fh:
    for r in rows:
        key = (source, where(pr_val, branch), r.get("id"))
        if r.get("id") and key in existing:
            skipped += 1; continue
        existing.add(key)
        entry = {"date": today, "source": source, "branch": branch or None, "pr": pr_val, "scope": scope or None, **r}
        fh.write(json.dumps(entry, ensure_ascii=False) + "\n"); added += 1
print(f"findings-ledger: added={added} skipped_duplicates={skipped} source={source} branch={branch or '-'} pr={pr or '-'} file={ledger}")
PY
        ;;
    report)
        SINCE=""
        while [[ $# -gt 0 ]]; do
            case "$1" in --since) SINCE="$2"; shift 2 ;; *) echo "findings-ledger: unknown option $1" >&2; exit 2 ;; esac
        done
        [[ -f "$LEDGER_FILE" ]] || { echo "findings-ledger: no ledger at $LEDGER_FILE" >&2; exit 2; }
        python3 - "$LEDGER_FILE" "$SINCE" "$SOURCES" <<'PY'
import json, sys, collections
ledger, since, sources = sys.argv[1:4]
rows = [json.loads(l) for l in open(ledger, encoding="utf-8") if l.strip()]
if since: rows = [r for r in rows if (r.get("date") or "") >= since]
if not rows:
    print("findings-ledger: rows=0"); sys.exit(0)
by_cat = collections.Counter(r.get("category", "other") for r in rows)
by_src = collections.Counter(r.get("source") for r in rows)
by_sev = collections.Counter(r.get("severity") for r in rows)
by_file = collections.Counter("/".join((r.get("file") or "?").split("/")[:2]) for r in rows)
print(f"# Findings ledger: {len(rows)} rows" + (f" since {since}" if since else ""))
print("\n## By category (the top one is the next script to write)")
for c, n in by_cat.most_common(): print(f"- {c}: {n}")
print("\n## By source"); [print(f"- {s}: {n}") for s, n in by_src.most_common()]
print("\n## By severity"); [print(f"- {s}: {n}") for s, n in by_sev.most_common()]
print("\n## By area"); [print(f"- {a}: {n}") for a, n in by_file.most_common(8)]
top = by_cat.most_common(1)[0]
print(f"\nfindings-ledger: rows={len(rows)} top_category={top[0]} top_count={top[1]} " + " ".join(f"{s}={by_src.get(s, 0)}" for s in sources.split()))
PY
        ;;
    -h|--help|"") usage; [[ -n "$cmd" ]] && exit 0 || exit 2 ;;
    *) echo "findings-ledger: unknown command $cmd" >&2; usage >&2; exit 2 ;;
esac
