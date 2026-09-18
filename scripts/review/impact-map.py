#!/usr/bin/env python3
"""
scripts/review/impact-map.py - the impact map of a diff, for the reviewer prompt (grok-review.sh).

A diff-only reviewer cannot see "the other place that also needed the change". This repo has no code
graph for TypeScript / Vue, so the map is built from text: for each changed file it lists

  import       files that import it (relative path, `~/` `@/` `~~/` `@@/`, and the `#name` aliases of
               nuxt.config.ts; with and without the extension, and `/index`)
  alias        importers of a `#name` alias that the changed file feeds (it names the alias in its source)
  tag          Nuxt auto-imported component tags: <X>, <x-kebab>, <FolderX>, <LazyX> in templates
  auto-import  exported identifiers of app/composables, app/utils (used under app/) and server/utils
               (used under server/): Nuxt imports them without an import line
  symbol       exported symbols and zod schemas CHANGED in the diff, referenced anywhere in the repo
  script       npm script names (package.json hooks, README, docs, workflows, scripts)
  route        `/api/...` paths in $fetch( / page.route( / tests
  key          keys of a changed zod schema used as string literals

then pastes the +-12 lines around the first call sites in <caller> blocks, so the reviewer reads the
call site without spending a tool turn on it.

It is a grep, NOT a graph: it misses dynamic names, re-exports through a second hop and anything built
from a string. The output says so. Caps: 40 references and 12 <caller> blocks per changed file, one
block per 25-line window. Tests are listed last and marked (test).

If graphify-out/graph.json exists and the `graphify` CLI is on PATH, its `affected` output is added.

Usage: impact-map.py --repo <root> --diff <diff file> --files <file with one changed path per line> [--graph <graph.json>]
Python 3.8+, standard library only. Suite: grok-review.test.sh (IMPACT cases).
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys

EXCLUDED_DIRS = {
    "node_modules", ".nuxt", ".output", "dist", "public", ".git", ".claude", ".tilebox", ".wrangler",
    ".netlify", "graphify-out", "test-results", "playwright-report", "design", "releases",
}
EXCLUDED_FILES = {"package-lock.json", "findings-ledger.jsonl", "NOTES.md", "CHANGELOG.md"}
CODE_EXT = (".ts", ".mts", ".vue", ".mjs", ".js")
TEXT_EXT = CODE_EXT + (".json", ".md", ".yml", ".yaml", ".sh", ".py", ".toml")
RESOLVE_SUFFIXES = ("", ".ts", ".vue", ".mjs", ".js", ".mts", ".json", "/index.ts", "/index.js", "/index.mjs")
IN_SCOPE = ("app/", "server/", "content/", "types/", "modules/", "scripts/")
IN_SCOPE_FILES = ("tests/e2e/helpers.ts", "nuxt.config.ts", "package.json")
MAX_REFS = 40
MAX_BLOCKS = 12
WINDOW = 25
CONTEXT = 12

IMPORT_RE = re.compile(
    r"""(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)['"]([^'"\n]+)['"]"""
)
EXPORT_RE = re.compile(
    r"\bexport\s+(?:default\s+)?(?:declare\s+)?(?:async\s+)?(?:function\s*\*?|const|let|var|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)"
)
SCHEMA_RE = re.compile(r"\b(?:const|let)\s+([A-Za-z_$][\w$]*Schema)\s*=")
SCHEMA_KEY_RE = re.compile(r"^\s*([a-zA-Z_][\w]*)\s*:\s*(?:z\.|[A-Za-z_$][\w$]*Schema\b|local[A-Z]\w*)")
ROUTE_RE = re.compile(r"""/api/[A-Za-z0-9_\-/\[\].]*[A-Za-z0-9_\]]""")


def is_test(path):
    return path.startswith("tests/") or ".spec." in path or ".test." in path


def walk(repo):
    """{relative path: [lines]} for every text file that is not excluded."""
    out = {}
    for base, dirs, files in os.walk(repo):
        dirs[:] = sorted(d for d in dirs if d not in EXCLUDED_DIRS)
        for name in sorted(files):
            if name in EXCLUDED_FILES or not name.endswith(TEXT_EXT):
                continue
            full = os.path.join(base, name)
            rel = os.path.relpath(full, repo).replace(os.sep, "/")
            try:
                if os.path.getsize(full) > 600_000:
                    continue
                with open(full, encoding="utf-8", errors="replace") as fh:
                    out[rel] = fh.read().splitlines()
            except OSError:
                continue
    return out


def parse_aliases(tree):
    """`#name` aliases of nuxt.config.ts -> repo file, when the target is written as a literal path."""
    aliases = {}
    for line in tree.get("nuxt.config.ts", []):
        m = re.match(r"""\s*['"](#[\w/\-]+)['"]\s*:\s*(.+)$""", line)
        if not m:
            continue
        name, rhs = m.group(1), m.group(2)
        literals = [s for s in re.findall(r"""['"]([^'"]+)['"]""", rhs)]
        target = None
        joined = "/".join(s.strip("/") for s in literals if s)
        for cand in (joined, *literals):
            cand = cand.lstrip("./")
            if cand and any((cand + suf) in tree for suf in RESOLVE_SUFFIXES):
                target = next(cand + suf for suf in RESOLVE_SUFFIXES if (cand + suf) in tree)
                break
        aliases[name] = target
    return aliases


def resolve_spec(spec, importer, aliases):
    """The repo-relative path stem an import specifier points at, or None for a package."""
    if spec.startswith("."):
        stem = os.path.normpath(os.path.join(os.path.dirname(importer), spec)).replace(os.sep, "/")
        return None if stem.startswith("..") else stem
    for prefix, root in (("~~/", ""), ("@@/", ""), ("~/", "app/"), ("@/", "app/")):
        if spec.startswith(prefix):
            return root + spec[len(prefix):]
    if spec.startswith("#"):
        return aliases.get(spec)
    return None


def pascal(text):
    return "".join(p[:1].upper() + p[1:] for p in re.split(r"[-_\s]+", text) if p)


def words(name):
    return re.findall(r"[A-Z]+(?![a-z])|[A-Z]?[a-z0-9]+", name)


def component_names(path):
    """The names Nuxt gives app/components/<dirs>/<File>.vue: File, and the folder-prefixed name."""
    rel = path[len("app/components/"):]
    parts = rel.split("/")
    file_name = re.sub(r"\.(client|server|global)$", "", parts[-1][: -len(".vue")])
    bare = pascal(file_name)
    prefix_words = [w for d in parts[:-1] for w in words(pascal(d))]
    file_words = words(bare)
    overlap = 0
    for n in range(min(len(prefix_words), len(file_words)), 0, -1):
        if [w.lower() for w in prefix_words[-n:]] == [w.lower() for w in file_words[:n]]:
            overlap = n
            break
    full = "".join(prefix_words) + "".join(file_words[overlap:])
    names = []
    for n in (full, bare):
        if n and n not in names:
            names.append(n)
    return names


def kebab(name):
    return "-".join(w.lower() for w in words(name))


def exports_of(lines):
    found = []
    for line in lines:
        for m in EXPORT_RE.finditer(line):
            if m.group(1) not in found:
                found.append(m.group(1))
    return found


def parse_diff(diff_text):
    """{path: {"symbols": [...], "keys": [...], "routes": [...], "lines": [changed lines]}}"""
    per_file = {}
    current = None
    enclosing = None
    for raw in diff_text.splitlines():
        if raw.startswith("diff --git "):
            m = re.match(r"diff --git a/(.+?) b/(.+)$", raw)
            current = m.group(2) if m else None
            enclosing = None
            if current:
                per_file.setdefault(current, {"symbols": [], "keys": [], "routes": [], "lines": []})
            continue
        if current is None or raw.startswith(("+++", "---", "index ", "new file", "deleted file", "similarity", "rename ")):
            continue
        entry = per_file[current]
        if raw.startswith("@@"):
            # The hunk header names the enclosing declaration: a change INSIDE an exported function counts.
            m = EXPORT_RE.search(raw.split("@@", 2)[-1])
            enclosing = m.group(1) if m else None
            continue
        if not raw.startswith(("+", "-")):
            # A context line with an export is the nearer enclosing declaration for the lines below it.
            m = EXPORT_RE.search(raw[1:])
            if m:
                enclosing = m.group(1)
            continue
        if enclosing and enclosing not in entry["symbols"]:
            entry["symbols"].append(enclosing)
        body = raw[1:]
        entry["lines"].append(body)
        for rx in (EXPORT_RE, SCHEMA_RE):
            for m in rx.finditer(body):
                if m.group(1) not in entry["symbols"]:
                    entry["symbols"].append(m.group(1))
        m = SCHEMA_KEY_RE.match(body)
        if m and m.group(1) not in entry["keys"]:
            entry["keys"].append(m.group(1))
        for m in ROUTE_RE.finditer(body):
            if m.group(0) not in entry["routes"]:
                entry["routes"].append(m.group(0))
    return per_file


def route_of(path):
    """server/api/avatar/gravatar.post.ts -> /api/avatar/gravatar"""
    if not path.startswith("server/api/"):
        return None
    stem = re.sub(r"\.(get|post|put|patch|delete|head|options)$", "", re.sub(r"\.(ts|js|mjs)$", "", path[len("server"):]))
    stem = re.sub(r"/index$", "", stem)
    return re.sub(r"\[[^\]]+\]", "", stem).rstrip("/") or None


def grep(tree, pattern, paths=None, skip=None, exts=None):
    rx = re.compile(pattern)
    hits = []
    for rel, lines in tree.items():
        if rel == skip or (exts and not rel.endswith(exts)):
            continue
        if paths and not rel.startswith(paths):
            continue
        for n, line in enumerate(lines, 1):
            if rx.search(line):
                hits.append((rel, n))
    return hits


def npm_scripts(tree):
    try:
        return json.loads("\n".join(tree.get("package.json", []))).get("scripts", {}) or {}
    except ValueError:
        return {}


def script_users(tree, name):
    doc_paths = ("README.md", "CLAUDE.md", "PLAN.md", "docs/", ".github/", "scripts/", "content/README.md", "package.json", "netlify.toml")
    rx = r"(?:npm run |npm run-script |npx npm run )" + re.escape(name) + r"(?![\w:.\-])"
    hits = grep(tree, rx, paths=doc_paths)
    hits += [h for h in grep(tree, r'"(?:pre|post)' + re.escape(name) + r'"\s*:', paths=("package.json",)) if h not in hits]
    return hits


def references_for(path, tree, aliases, diff_info, scripts):
    """Ordered [(kind, file, line)] for one changed file."""
    refs = []
    own = tree.get(path, [])
    stem_variants = {path}
    for suf in RESOLVE_SUFFIXES[1:]:
        if path.endswith(suf):
            stem_variants.add(path[: -len(suf)])

    # import: every specifier that resolves to this file
    for rel, lines in tree.items():
        if rel == path or not rel.endswith(CODE_EXT):
            continue
        for n, line in enumerate(lines, 1):
            if "import" not in line and "from" not in line and "require" not in line:
                continue
            for m in IMPORT_RE.finditer(line):
                target = resolve_spec(m.group(1), rel, aliases)
                if target and (target in stem_variants or target.rstrip("/") in stem_variants):
                    refs.append(("import", rel, n))

    # alias: the file feeds a `#name` alias (it names it) -> the importers of the alias
    own_text = "\n".join(own)
    for name in aliases:
        if aliases[name] == path or re.search(r"""['"`]""" + re.escape(name) + r"""['"`]""", own_text):
            for rel, n in grep(tree, r"""['"]""" + re.escape(name) + r"""['"]""", skip=path, exts=CODE_EXT):
                if rel != "nuxt.config.ts":
                    refs.append((f"alias {name}", rel, n))

    # tag: Nuxt auto-imported components
    if path.startswith("app/components/") and path.endswith(".vue"):
        for name in component_names(path):
            for tag in (name, "Lazy" + name, kebab(name), "lazy-" + kebab(name)):
                for rel, n in grep(tree, r"<" + re.escape(tag) + r"(?=[\s/>]|$)", skip=path, exts=(".vue",)):
                    refs.append((f"tag <{tag}>", rel, n))
            for rel, n in grep(tree, r"""resolveComponent\(\s*['"]""" + re.escape(name) + r"""['"]""", skip=path, exts=CODE_EXT):
                refs.append((f"tag {name}", rel, n))

    # auto-import: exported identifiers used without an import line
    scope = None
    if re.match(r"app/(composables|utils)/[^/]+\.ts$", path):
        scope = ("app/",)
    elif re.match(r"server/utils/[^/]+\.ts$", path):
        scope = ("server/",)
    changed_symbols = list(diff_info.get("symbols", []))
    if scope:
        for ident in exports_of(own):
            if len(ident) < 3 or ident in changed_symbols:
                continue
            for rel, n in grep(tree, r"(?<![\w$.])" + re.escape(ident) + r"(?![\w$])", paths=scope, skip=path, exts=CODE_EXT):
                refs.append((f"auto-import {ident}", rel, n))

    # symbol: exported symbols and schemas the diff touches, anywhere in the repo
    for ident in changed_symbols:
        if len(ident) < 3:
            continue
        for rel, n in grep(tree, r"(?<![\w$])" + re.escape(ident) + r"(?![\w$])", skip=path, exts=CODE_EXT):
            refs.append((f"symbol {ident}", rel, n))

    # script: npm scripts that run this file, or that the diff of package.json touches
    names = [name for name, cmd in scripts.items() if path != "package.json" and re.search(r"(?<![\w/.-])" + re.escape(path) + r"(?![\w-])", cmd)]
    if path == "package.json":
        for body in diff_info.get("lines", []):
            m = re.match(r'\s*"([\w:.\-]+)"\s*:\s*"(.*)"', body)
            if m and (m.group(1) in scripts or not re.match(r"^[\^~]?\d|^(?:npm:|file:|git)", m.group(2))):
                base = re.sub(r"^(pre|post)(?=.)", "", m.group(1)) if m.group(1) not in scripts else m.group(1)
                for cand in (m.group(1), base):
                    if cand not in names and cand not in ("name", "version", "license", "type", "node"):
                        names.append(cand)
    for name in names:
        for rel, n in script_users(tree, name):
            if not (rel == "package.json" and path == "package.json" and tree[rel][n - 1].lstrip().startswith(f'"{name}"')):
                refs.append((f"script {name}", rel, n))

    # route: /api/... paths used by the client, the tests and the docs
    routes = list(diff_info.get("routes", []))
    own_route = route_of(path)
    if own_route and own_route not in routes:
        routes.insert(0, own_route)
    for route in routes:
        for rel, n in grep(tree, re.escape(route) + r"(?![\w\-])", skip=path):
            refs.append((f"route {route}", rel, n))

    # key: keys of a changed zod schema, as string literals
    if path.startswith("types/") or path.endswith("-cache.ts"):
        for key in diff_info.get("keys", []):
            if len(key) < 3:
                continue
            for rel, n in grep(tree, r"""['"]""" + re.escape(key) + r"""['"]""", skip=path, exts=CODE_EXT):
                refs.append((f"key {key}", rel, n))

    # One row per (file, line); code before tests; stable order of kinds as built above.
    seen, ordered = set(), []
    for kind, rel, n in refs:
        if (rel, n) in seen:
            continue
        seen.add((rel, n))
        ordered.append((kind, rel, n))
    ordered.sort(key=lambda r: is_test(r[1]))
    return ordered


def caller_blocks(rows, tree, repo):
    """The source around each reference: at most MAX_BLOCKS, one per WINDOW-line window of a file."""
    out, seen = [], set()
    for _kind, rel, n in rows:
        key = (rel, n // WINDOW)
        if key in seen:
            continue
        if len(seen) >= MAX_BLOCKS:
            break
        src = tree.get(rel)
        if src is None:
            try:
                with open(os.path.join(repo, rel), encoding="utf-8", errors="replace") as fh:
                    src = fh.read().splitlines()
            except OSError:
                continue
        seen.add(key)
        lo, hi = max(1, n - CONTEXT), min(len(src), n + CONTEXT)
        out.append(f'\n<caller file="{rel}" lines="{lo}-{hi}">')
        out.extend(f"{i:5d}| {src[i - 1]}" for i in range(lo, hi + 1))
        out.append("</caller>")
    return out


def graph_section(graph, files, tree, repo):
    lines = []
    if not graph or not os.path.isfile(graph) or not shutil.which("graphify"):
        return ["Code graph: unavailable (graphify CLI or graphify-out/graph.json not found). The text map below is all there is."]
    lines.append(f"Code graph: {graph} (graphify affected, depth 1, relations calls + references).")
    for path in files:
        try:
            res = subprocess.run(["graphify", "affected", path, "--graph", graph, "--relation", "calls", "--relation", "references", "--depth", "1"],
                                 capture_output=True, text=True, timeout=60, check=False)
        except (OSError, subprocess.SubprocessError):
            continue
        rows = [l for l in res.stdout.splitlines() if l.startswith("- ")][:MAX_REFS]
        if not rows:
            continue
        lines.append(f"\n### {path} (graph)")
        lines.extend(rows)
        parsed = []
        for row in rows:
            m = re.search(r"\] (\S+?):L(\d+)$", row)
            if m:
                parsed.append(("graph", m.group(1), int(m.group(2))))
        lines.extend(caller_blocks(parsed, tree, repo))
    return lines


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--repo", required=True)
    ap.add_argument("--diff", required=True)
    ap.add_argument("--files", required=True)
    ap.add_argument("--graph", default="")
    args = ap.parse_args()

    repo = os.path.abspath(args.repo)
    with open(args.files, encoding="utf-8") as fh:
        changed = [l.strip() for l in fh if l.strip()]
    with open(args.diff, encoding="utf-8", errors="replace") as fh:
        diff_info = parse_diff(fh.read())
    tree = walk(repo)
    aliases = parse_aliases(tree)
    scripts = npm_scripts(tree)
    in_scope = [f for f in changed if f.startswith(IN_SCOPE) or f in IN_SCOPE_FILES]

    print("Source: a text search of the checkout (imports, Nuxt auto-imports, changed exported symbols, npm script names, "
          "/api routes, schema keys). It is not exhaustive: it is a grep, not a graph. Names built from strings, a second "
          f"hop through a re-export, and config-driven wiring are what it misses. At most {MAX_REFS} references per file; tests last.")
    for line in graph_section(args.graph, in_scope, tree, repo):
        print(line)

    for path in in_scope:
        rows = references_for(path, tree, aliases, diff_info.get(path, {}), scripts)
        print(f"\n### {path}")
        symbols = diff_info.get(path, {}).get("symbols", [])
        if symbols:
            print("Changed exported symbols: " + ", ".join(f"`{s}`" for s in symbols))
        if not rows:
            print("- (no importer, tag, symbol, script or route reference found by the text search: grep for it yourself)")
            continue
        shown = rows[:MAX_REFS]
        for kind, rel, n in shown:
            print(f"- [{kind}] {rel}:L{n}" + (" (test)" if is_test(rel) else ""))
        if len(rows) > MAX_REFS:
            print(f"- ... {len(rows) - MAX_REFS} more references not listed (cap {MAX_REFS})")
        for line in caller_blocks(shown, tree, repo):
            print(line)
    skipped = [f for f in changed if f not in in_scope]
    if skipped:
        print("\nNot mapped (docs, config, tests, assets): " + ", ".join(skipped[:30]) + (" ..." if len(skipped) > 30 else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
