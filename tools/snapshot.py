#!/usr/bin/env python3
"""
Structural snapshot of every page — the regression net for markup changes.

For markup-only work (generating nav/footer/head from data), comparing the
rendered markup IS the proof. It runs in milliseconds and needs no browser,
unlike full-page screenshots which are slow and flaky on tall pages.

    python3 tools/snapshot.py save            # record current state
    python3 tools/snapshot.py check           # compare against the record
    python3 tools/snapshot.py check --verbose # show the actual diff

What it records per page:
  - normalized nav, footer and head blocks (hashed)
  - the visible text of the page (hashed) — catches content loss
  - the ordered list of every link target — catches broken/dropped links

Whitespace-only differences are ignored on purpose: regenerated markup may
be indented differently while being semantically identical.

Pure stdlib, Python 3.9 compatible. Run from the repo root.
"""

import os
import re
import sys
import json
import hashlib
import difflib
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STORE = os.path.join(ROOT, "tools", ".snapshot.json")
SKIP_DIRS = {"assets", "tools", "templates", "data", ".git", "docs", "_snap"}


class Visible(HTMLParser):
    """Visible text plus every link/asset target, in document order."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.text = []
        self.links = []
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self._skip += 1
        d = dict(attrs)
        for key in ("href", "src"):
            if d.get(key):
                self.links.append("%s=%s" % (key, d[key]))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        if tag in ("script", "style") and self._skip:
            self._skip -= 1

    def handle_data(self, data):
        if not self._skip:
            s = data.strip()
            if s:
                self.text.append(s)


def norm(s):
    """Collapse whitespace so indentation changes don't count as diffs."""
    return re.sub(r"\s+", " ", s).strip()


def sha(s):
    return hashlib.sha256(s.encode("utf-8")).hexdigest()[:16]


def region(html, start_pat, end_tag):
    m = re.search(start_pat, html)
    if not m:
        return ""
    end = html.find(end_tag, m.start())
    return html[m.start():end + len(end_tag)] if end > 0 else html[m.start():]


def pages():
    out = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]
        for fn in filenames:
            if fn.endswith(".html"):
                out.append(os.path.relpath(os.path.join(dirpath, fn), ROOT))
    press = "press/index.html"
    if os.path.exists(os.path.join(ROOT, press)):
        out.append(press)
    return sorted(set(out))


def capture():
    snap = {}
    for rel in pages():
        with open(os.path.join(ROOT, rel), encoding="utf-8") as fh:
            html = fh.read()
        v = Visible()
        v.feed(html)
        head = region(html, r"<head\b", "</head>")
        # strip the <style> block: CSS churn is Phase 5's business, not markup's
        head_nostyle = re.sub(r"<style\b.*?</style>", "", head, flags=re.S)
        snap[rel] = {
            "head": sha(norm(head_nostyle)),
            "nav": sha(norm(region(html, r'<nav class="site-nav"', "</nav>"))),
            "footer": sha(norm(region(html, r'<footer class="site-footer"', "</footer>"))),
            "text": sha(" ".join(v.text)),
            "links": sha("|".join(v.links)),
            "n_links": len(v.links),
            "n_words": sum(len(t.split()) for t in v.text),
        }
    return snap


def detail(rel, field):
    """Human-readable current value of a field, for --verbose diffs."""
    with open(os.path.join(ROOT, rel), encoding="utf-8") as fh:
        html = fh.read()
    if field == "nav":
        return norm(region(html, r'<nav class="site-nav"', "</nav>"))
    if field == "footer":
        return norm(region(html, r'<footer class="site-footer"', "</footer>"))
    if field == "head":
        head = region(html, r"<head\b", "</head>")
        return norm(re.sub(r"<style\b.*?</style>", "", head, flags=re.S))
    if field == "links":
        v = Visible(); v.feed(html)
        return "\n".join(v.links)
    if field == "text":
        v = Visible(); v.feed(html)
        return " ".join(v.text)
    return ""


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in ("save", "check"):
        print(__doc__.strip())
        return 2
    cmd = sys.argv[1]
    verbose = "--verbose" in sys.argv
    now = capture()

    if cmd == "save":
        with open(STORE, "w", encoding="utf-8") as fh:
            json.dump(now, fh, indent=2, sort_keys=True)
        print("snapshot saved: %d pages -> tools/.snapshot.json" % len(now))
        return 0

    if not os.path.exists(STORE):
        print("no snapshot on record — run: python3 tools/snapshot.py save")
        return 2
    with open(STORE, encoding="utf-8") as fh:
        was = json.load(fh)

    problems = 0
    for rel in sorted(set(list(was) + list(now))):
        if rel not in was:
            print("  +  %s (new page)" % rel); problems += 1; continue
        if rel not in now:
            print("  -  %s (page removed)" % rel); problems += 1; continue
        for field in ("head", "nav", "footer", "text", "links"):
            if was[rel][field] != now[rel][field]:
                extra = ""
                if field == "links":
                    extra = " (%d -> %d)" % (was[rel]["n_links"], now[rel]["n_links"])
                if field == "text":
                    extra = " (%d -> %d words)" % (was[rel]["n_words"], now[rel]["n_words"])
                print("  ✗  %-28s %s changed%s" % (rel, field, extra))
                problems += 1
                if verbose:
                    old_note = "(recorded hash %s)" % was[rel][field]
                    print("       %s" % old_note)
                    cur = detail(rel, field)
                    for line in cur.splitlines()[:6]:
                        print("       now: %s" % line[:150])

    if problems:
        print("\n%d change(s) vs snapshot. If intended, re-run: "
              "python3 tools/snapshot.py save" % problems)
        return 1
    print("✓ no structural changes across %d pages" % len(now))
    return 0


if __name__ == "__main__":
    sys.exit(main())
