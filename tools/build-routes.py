#!/usr/bin/env python3
"""Generate the public service route tree and the sitemap.

The site is a static, build-step-free set of ES modules, and the service
catalogue lives in the database. Those two facts pull in opposite directions:
real crawlable URLs need a file on disk per service, but a service should not
require hand-writing HTML.

This script is the join. For every entry in site/js/lib/routes.js it writes a
small shell carrying only what a crawler needs in the markup -- title,
description, canonical, Open Graph -- and leaves the page content to the same
shared renderer the whole site already uses. Adding a service stays a database
action plus a run of this script.

    python3 tools/build-routes.py

Reads the service catalogue from the public REST endpoint with the publishable
key, i.e. exactly the data the website already serves to anonymous visitors.
No secret is involved and none belongs here.
"""

import json
import os
import re
import sys
import urllib.request
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(ROOT, "site")
ORIGIN = "https://novashieldmaintenance.com"

SUPABASE_URL = "https://xrgutmdgjzclaeyugsqg.supabase.co"
ANON_KEY = "sb_publishable_sh-M40urSjGvRODkAP7mFg_itg8ZUfY"

OG_IMAGE = f"{ORIGIN}/assets/brand/logo-hi.jpeg"
OG_W, OG_H = "2172", "724"

CATEGORY_PAGES = {
    "lighting": {
        "slug": "lighting",
        "title": "Outdoor Lighting | Nova Shield",
        "desc": "Permanent architectural lighting and seasonal Christmas displays "
                "from Nova Shield in Sault Ste. Marie.",
    },
    "cleaning": {
        "slug": "exterior-cleaning",
        "title": "Exterior Cleaning | Nova Shield",
        "desc": "Exterior cleaning from Nova Shield in Sault Ste. Marie — the right "
                "method for each surface, explained properly.",
    },
    "winter": {
        "slug": "winter-care",
        "title": "Winter Care | Nova Shield",
        "desc": "Hand-clearing for walkways, steps and decks, and heating wire "
                "installation, from Nova Shield in Sault Ste. Marie.",
    },
}


# ── routes.js is the single source of truth, so parse it rather than restate it ──

def read_pages():
    src = open(os.path.join(SITE, "js", "lib", "routes.js"), encoding="utf-8").read()
    block = re.search(r"export const PAGES = \[(.*?)\n\];", src, re.S)
    if not block:
        sys.exit("Could not find PAGES in routes.js")

    pages = []
    for raw in re.findall(r"\{(.*?)\}", block.group(1), re.S):
        entry = {}
        for key, val in re.findall(r"(\w+):\s*'([^']*)'", raw):
            entry[key] = val
        for key, val in re.findall(r"(\w+):\s*(true|false)", raw):
            entry[key] = val == "true"
        if entry.get("slug"):
            pages.append(entry)
    if not pages:
        sys.exit("Parsed no pages from routes.js")
    return pages


def fetch_services():
    url = (f"{SUPABASE_URL}/rest/v1/services"
           "?select=key,name,blurb,detail,category,quotable")
    req = urllib.request.Request(url, headers={
        "apikey": ANON_KEY, "Authorization": f"Bearer {ANON_KEY}"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return {s["key"]: s for s in json.load(resp)}


def esc(text):
    return (text.replace("&", "&amp;").replace("<", "&lt;")
                .replace(">", "&gt;").replace('"', "&quot;"))


def clip(text, limit=158):
    text = " ".join((text or "").split())
    if len(text) <= limit:
        return text
    return text[:limit].rsplit(" ", 1)[0].rstrip(",.;:—-") + "…"


def shell(title, desc, canonical, body_attr, module):
    """The shared document shell. Asset paths are root-relative so a page works
    at any depth; module imports resolve against the module URL, not the
    document, so the renderer is shared unchanged."""
    t, d = esc(title), esc(desc)
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{t}</title>
<meta name="description" content="{d}">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 128'%3E%3Cpath d='M50 4L94 22V64Q94 96 50 124Q6 96 6 64V22Z' fill='%23071a2b' stroke='%23c9d3d8' stroke-width='7'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,340;9..144,480;9..144,560&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/site.css">
<script>
  // resolve the presentation before first paint (avoids a flash of the default skin)
  (function () {{
    var THEMES = {{ refined: '/css/theme-refined.css', editorial: '/css/theme-editorial.css', signal: '/css/theme-signal.css' }};
    var t = new URLSearchParams(location.search).get('theme');
    try {{ if (!THEMES[t]) t = localStorage.getItem('novaShieldTheme'); }} catch (e) {{}}
    if (!THEMES[t]) t = 'refined';
    document.documentElement.dataset.theme = t;
    document.write('<link id="themeCss" rel="stylesheet" href="' + THEMES[t] + '">');
  }})();
</script>
<link rel="canonical" href="{canonical}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Nova Shield Maintenance Services">
<meta property="og:locale" content="en_CA">
<meta property="og:url" content="{canonical}">
<meta property="og:title" content="{t}">
<meta property="og:description" content="{d}">
<meta property="og:image" content="{OG_IMAGE}">
<meta property="og:image:width" content="{OG_W}">
<meta property="og:image:height" content="{OG_H}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{t}">
<meta name="twitter:description" content="{d}">
<meta name="twitter:image" content="{OG_IMAGE}">
</head>
<body {body_attr}>
<a class="sr-only" href="#main">Skip to content</a>
<main id="main"><div class="container" style="padding:160px 0 80px"><p class="form-note">Loading…</p></div></main>
<script type="module" src="{module}"></script>
</body>
</html>
"""


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    existing = open(path, encoding="utf-8").read() if os.path.exists(path) else None
    if existing == text:
        return False
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)
    return True


def main():
    pages = read_pages()
    services = fetch_services()

    missing = sorted({p["key"] for p in pages} - set(services))
    if missing:
        sys.exit(f"routes.js points at services that do not exist: {missing}")

    urls = [(f"{ORIGIN}/", "weekly", "1.0")]
    written = skipped = 0

    for cat, meta in CATEGORY_PAGES.items():
        url = f"{ORIGIN}/services/{meta['slug']}/"
        written += write(
            os.path.join(SITE, "services", meta["slug"], "index.html"),
            shell(meta["title"], meta["desc"], url,
                  f'data-category="{cat}"', "/js/pages/category.js"))
        urls.append((url, "monthly", "0.9"))

    for page in pages:
        cat_slug = CATEGORY_PAGES[page["cat"]]["slug"]
        url = f"{ORIGIN}/services/{cat_slug}/{page['slug']}/"
        urls.append((url, "monthly", "0.8"))

        if page.get("bespoke"):
            # hand-built page; it owns its own markup and is never overwritten
            skipped += 1
            continue

        service = services[page["key"]]
        detail = service.get("detail") or {}
        variant = (detail.get("variants") or {}).get(page.get("variant"), {})

        name = variant.get("name") or page.get("name") or service["name"]
        desc = clip(variant.get("blurb") or service.get("blurb")
                    or variant.get("intro") or detail.get("intro") or "")

        attrs = f'data-service="{esc(page["key"])}"'
        if page.get("variant"):
            attrs += f' data-variant="{esc(page["variant"])}"'

        written += write(
            os.path.join(SITE, "services", cat_slug, page["slug"], "index.html"),
            shell(f"{name} | Nova Shield", desc, url, attrs, "/js/pages/service.js"))

    # Old URLs are already in a submitted sitemap, so they get real 301s rather
    # than being allowed to 404. Generated here so they cannot drift from the
    # route map that replaced them.
    legacy_pages = {
        "/lighting.html": "/services/lighting/",
        "/care.html": "/services/exterior-cleaning/",
        "/winter.html": "/services/winter-care/",
        "/lighting-permanent.html": "/services/lighting/permanent-outdoor-lighting/",
        "/lighting-christmas.html": "/services/lighting/christmas-lighting/",
    }
    # Named matchers must sit at site-block level, and `handle` blocks are
    # mutually exclusive and evaluated in written order -- so this stays correct
    # regardless of Caddy's directive ordering.
    matchers, handles = [], []
    seen = set()
    for page in pages:
        if page["key"] in seen:
            continue           # one service, one canonical destination
        seen.add(page["key"])
        cat_slug = CATEGORY_PAGES[page["cat"]]["slug"]
        name = f"svc_{page['key']}"
        matchers += [f"@{name} {{", "\tpath /service.html",
                     f"\tquery s={page['key']}", "}"]
        handles.append(f"handle @{name} {{\n"
                       f"\tredir /services/{cat_slug}/{page['slug']}/ permanent\n}}")

    for old, new in legacy_pages.items():
        handles.append(f"handle {old} {{\n\tredir {new} permanent\n}}")
    handles.append("handle /service.html {\n\tredir /services/exterior-cleaning/ permanent\n}")

    write(os.path.join(ROOT, "deploy", "redirects.caddy"),
          "# Generated by tools/build-routes.py -- do not edit by hand.\n"
          "# 301s from the pre-/services/ URL scheme, imported by the Caddyfile.\n\n"
          + "\n".join(matchers) + "\n\n" + "\n".join(handles) + "\n")

    today = date.today().isoformat()
    body = "\n".join(
        f"  <url>\n    <loc>{loc}</loc>\n    <lastmod>{today}</lastmod>\n"
        f"    <changefreq>{freq}</changefreq>\n    <priority>{pri}</priority>\n  </url>"
        for loc, freq, pri in urls)
    write(os.path.join(SITE, "sitemap.xml"),
          '<?xml version="1.0" encoding="UTF-8"?>\n'
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
          f"{body}\n</urlset>\n")

    print(f"{len(urls)} URLs → sitemap.xml")
    print(f"{written} file(s) written, {skipped} bespoke page(s) left alone")


if __name__ == "__main__":
    main()
