#!/usr/bin/env python3
"""
Read-only site audit for bigbeardapps.com.

Catches the class of bug that keeps recurring: a new app is added and some
shared list, count, or meta tag silently keeps describing the old world.

Usage:
    python3 tools/audit.py            # human-readable report, exit 1 on failure
    python3 tools/audit.py --quiet    # only failures

Pure stdlib, Python 3.9 compatible. Run from the repo root.
"""

import os
import re
import sys
import json
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Directories that are not app directories
NON_APP_DIRS = {"assets", "press", "tools", "templates", "data", "_snap", ".git", "docs"}

# Prose number words we check against the real app count
NUMBER_WORDS = {
    "both": 2, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
}


# ── helpers ──────────────────────────────────────────────────────────────

class TextExtractor(HTMLParser):
    """Collect visible text, skipping script/style."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self._skip += 1

    def handle_endtag(self, tag):
        if tag in ("script", "style") and self._skip:
            self._skip -= 1

    def handle_data(self, data):
        if not self._skip:
            self.parts.append(data)

    def text(self):
        return re.sub(r"\s+", " ", " ".join(self.parts))


def html_pages():
    """Every deployable .html page, repo-relative, sorted."""
    out = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in NON_APP_DIRS and not d.startswith(".")]
        for fn in filenames:
            if fn.endswith(".html"):
                rel = os.path.relpath(os.path.join(dirpath, fn), ROOT)
                out.append(rel)
    # press/index.html lives under a NON_APP_DIR but is a real page
    press = os.path.join(ROOT, "press", "index.html")
    if os.path.exists(press):
        out.append("press/index.html")
    return sorted(set(out))


def discover_apps():
    """
    App slugs. Prefers data/apps.json (Phase 3+); falls back to directory
    layout so this tool is useful before the data file exists.
    """
    data = os.path.join(ROOT, "data", "apps.json")
    if os.path.exists(data):
        with open(data, encoding="utf-8") as fh:
            return [a["slug"] for a in json.load(fh)["apps"]]
    apps = []
    for name in sorted(os.listdir(ROOT)):
        full = os.path.join(ROOT, name)
        if (os.path.isdir(full) and name not in NON_APP_DIRS
                and not name.startswith(".")
                and os.path.exists(os.path.join(full, "index.html"))):
            apps.append(name)
    return apps


def read(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as fh:
        return fh.read()


def meta(html, prop=None, name=None):
    """Value of a <meta property=…> or <meta name=…>, or None."""
    if prop:
        pat = r'<meta\s+property="%s"\s+content="([^"]*)"' % re.escape(prop)
    else:
        pat = r'<meta\s+name="%s"\s+content="([^"]*)"' % re.escape(name)
    m = re.search(pat, html)
    return m.group(1) if m else None


def block(html, cls):
    """Inner HTML of the first <div|nav class="cls"> … up to its closing tag."""
    i = html.find('class="%s"' % cls)
    if i < 0:
        return None
    end = html.find("</div>", i)
    return html[i:end] if end > 0 else html[i:]


# ── checks ───────────────────────────────────────────────────────────────

def check_app_coverage(pages, apps, fail):
    """Every app must appear in every page's nav and footer link rows."""
    for rel in pages:
        html = read(rel)
        nav = block(html, "site-nav__links")
        foot = block(html, "footer-links")
        for slug in apps:
            href = "/%s/" % slug
            if nav is not None and href not in nav:
                fail("app-coverage", "%s: nav missing %s" % (rel, slug))
            if foot is not None and href not in foot:
                fail("app-coverage", "%s: footer missing %s" % (rel, slug))


def check_links(pages, fail):
    """Every root-relative href/src/source must resolve on disk."""
    # The capture stops at ? or #, but the pattern still consumes them, so a
    # cache-busted asset (site.css?v=…) is checked by path instead of silently
    # falling out of the match and losing its coverage.
    pat = re.compile(r'(?:href|src)="(/[^"#?]*)[^"]*"')
    for rel in pages:
        for url in set(pat.findall(read(rel))):
            target = os.path.join(ROOT, url.lstrip("/"))
            if url.endswith("/"):
                target = os.path.join(target, "index.html")
            if not os.path.exists(target):
                fail("links", "%s -> %s" % (rel, url))


def check_head(pages, fail):
    """Required head tags on every page."""
    required_props = ["og:title", "og:description", "og:url", "og:image", "og:image:alt"]
    for rel in pages:
        html = read(rel)
        if not re.search(r"<title>[^<]+</title>", html):
            fail("head", "%s: missing <title>" % rel)
        if not meta(html, name="description"):
            fail("head", "%s: missing meta description" % rel)
        if not re.search(r'<link\s+rel="canonical"', html):
            fail("head", "%s: missing canonical" % rel)
        for prop in required_props:
            if not meta(html, prop=prop):
                fail("head", "%s: missing %s" % (rel, prop))
        if not meta(html, name="twitter:card"):
            fail("head", "%s: missing twitter:card" % rel)


def check_canonical_matches(pages, fail):
    """canonical == og:url == sitemap entry, byte-exact."""
    sitemap = os.path.join(ROOT, "sitemap.xml")
    urls = set()
    if os.path.exists(sitemap):
        with open(sitemap, encoding="utf-8") as fh:
            urls = set(re.findall(r"<loc>([^<]+)</loc>", fh.read()))
    for rel in pages:
        html = read(rel)
        m = re.search(r'<link\s+rel="canonical"\s+href="([^"]*)"', html)
        canon = m.group(1) if m else None
        ogurl = meta(html, prop="og:url")
        if canon and ogurl and canon != ogurl:
            fail("canonical", "%s: canonical %s != og:url %s" % (rel, canon, ogurl))
        if canon and urls and canon not in urls:
            fail("canonical", "%s: canonical %s not in sitemap.xml" % (rel, canon))


def check_media(apps, fail):
    """Declared per-app media must exist (uses apps.json when present)."""
    data = os.path.join(ROOT, "data", "apps.json")
    if not os.path.exists(data):
        return "skipped (no data/apps.json yet)"
    with open(data, encoding="utf-8") as fh:
        for app in json.load(fh)["apps"]:
            base = app.get("paths", {}).get("images", "/%s/images/" % app["slug"])
            for key, val in (app.get("media") or {}).items():
                if isinstance(val, str):
                    p = os.path.join(ROOT, (base + val).lstrip("/"))
                    if not os.path.exists(p):
                        fail("media", "%s: %s missing (%s)" % (app["slug"], key, val))
    return None


# Phrases that legitimately name a number that is not the app count.
# Each entry must say WHY, so a future reader can tell a real exemption
# from a bug someone silenced.
COUNT_ALLOWLIST = [
    # ReelTalk's press bio: it was built while the OTHER two apps sat in review.
    "two larger apps",
]


def check_press(apps, fail):
    """Every app needs a press-kit section and an asset zip. ReelTalk shipped
    without either and nobody noticed until it was pointed out."""
    press = os.path.join(ROOT, "press", "index.html")
    if not os.path.exists(press):
        return "skipped (no press page)"
    html = read("press/index.html")
    for slug in apps:
        if ('id="%s"' % slug) not in html:
            fail("press", "no press section for '%s' (add <section id=\"%s\">)" % (slug, slug))
        zip_ = os.path.join(ROOT, "press", "%s-press-kit.zip" % slug)
        if not os.path.exists(zip_):
            fail("press", "missing press/%s-press-kit.zip" % slug)
    return None


def check_counts(pages, apps, fail):
    """
    Prose that counts apps must agree with reality.
    This is the check that would have caught "Both coming soon to the App Store."

    A number word only counts as an app-count claim when "app(s)" or
    "App Store" appears within a short window after it — otherwise phrases
    like "Both strategies, honestly compared" trip it.
    """
    n = len(apps)
    claim = re.compile(
        r"\b(both|two|three|four|five|six)\b"      # the number word
        r"((?:\s+[\w'’-]+){0,6}?\s+"               # a few words of slack
        r"(?:apps?\b|App Store))",                 # …then app context
        re.I)
    allof = re.compile(r"\ball\s+(both|two|three|four|five|six)\b", re.I)

    for rel in pages:
        html = read(rel)
        # The build log is a dated journal: "three apps in App Review, July 2026"
        # stays true after a fourth ships. Counting it would flag history as a bug
        # and push someone to falsify a past entry to silence the check.
        html = re.sub(r"<!-- bba:log start.*?<!-- bba:log end -->", " ", html, flags=re.S)
        ex = TextExtractor()
        ex.feed(html)
        text = ex.text()
        for pat in (claim, allof):
            for m in pat.finditer(text):
                whole = m.group(0)
                if any(a.lower() in whole.lower() for a in COUNT_ALLOWLIST):
                    continue
                if NUMBER_WORDS.get(m.group(1).lower()) != n:
                    ctx = text[max(0, m.start() - 40):m.end() + 40].strip()
                    fail("counts", '%s: "%s" but there are %d apps — …%s…'
                         % (rel, whole.strip(), n, ctx))


def check_sync(fail):
    """If sync.py exists, generated regions must be up to date."""
    sync = os.path.join(ROOT, "tools", "sync.py")
    if not os.path.exists(sync):
        return "skipped (no tools/sync.py yet)"
    import subprocess
    r = subprocess.run([sys.executable, sync, "--check"],
                       cwd=ROOT, capture_output=True, text=True)
    if r.returncode != 0:
        for line in (r.stdout + r.stderr).strip().splitlines():
            fail("sync", line)
    return None


# ── main ─────────────────────────────────────────────────────────────────

def main():
    quiet = "--quiet" in sys.argv
    failures = {}

    def fail(check, msg):
        failures.setdefault(check, []).append(msg)

    pages = html_pages()
    apps = discover_apps()

    checks = [
        ("app-coverage", "every app appears in every nav + footer",
         lambda: check_app_coverage(pages, apps, fail)),
        ("links", "every root-relative href/src resolves",
         lambda: check_links(pages, fail)),
        ("head", "required title/description/canonical/og/twitter tags",
         lambda: check_head(pages, fail)),
        ("canonical", "canonical == og:url == sitemap entry",
         lambda: check_canonical_matches(pages, fail)),
        ("media", "declared app media exists",
         lambda: check_media(apps, fail)),
        ("press", "every app has a press section + asset zip",
         lambda: check_press(apps, fail)),
        ("counts", "prose app-counts match reality",
         lambda: check_counts(pages, apps, fail)),
        ("sync", "generated regions are up to date",
         lambda: check_sync(fail)),
    ]

    if not quiet:
        print("audit: %d pages, %d apps (%s)\n" % (len(pages), len(apps), ", ".join(apps)))

    skipped = {}
    for key, desc, fn in checks:
        note = fn()
        if note:
            skipped[key] = note

    for key, desc, _ in checks:
        errs = failures.get(key, [])
        if key in skipped:
            if not quiet:
                print("  ~  %-14s %s — %s" % (key, desc, skipped[key]))
        elif errs:
            print("  ✗  %-14s %s — %d problem(s)" % (key, desc, len(errs)))
            for e in errs:
                print("       %s" % e)
        elif not quiet:
            print("  ✓  %-14s %s" % (key, desc))

    total = sum(len(v) for v in failures.values())
    if total:
        print("\naudit FAILED: %d problem(s)" % total)
        return 1
    if not quiet:
        print("\naudit passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
