#!/usr/bin/env python3
"""Regenerate site/sitemap.xml.

Service URLs come from the services table, so the sitemap cannot drift from the
price book. Run after adding, renaming or deactivating a service:

    python3 tools/build-sitemap.py
"""
import datetime, pathlib, sys

SITE = "https://novashieldmaintenance.com"

STATIC = [
    ("/",                        "1.0", "weekly"),
    ("/lighting.html",           "0.9", "monthly"),
    ("/lighting-permanent.html", "0.9", "monthly"),
    ("/lighting-christmas.html", "0.9", "monthly"),
    ("/care.html",               "0.9", "monthly"),
    ("/winter.html",             "0.9", "monthly"),
]

# keep in step with: select key from services
# where active and quotable and parent_key is null and category in ('cleaning','winter')
SERVICES = [
    "siding", "roof_soft_wash", "gutter_brightening", "concrete", "deck",
    "fence", "windows", "moss", "graffiti",
    "winter_property_care", "winter_deicing_cables",
]

def main():
    today = datetime.date.today().isoformat()
    rows = []
    for loc, pri, freq in STATIC:
        rows.append((loc, pri, freq))
    for key in SERVICES:
        rows.append((f"/service.html?s={key}", "0.8", "monthly"))

    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for loc, pri, freq in rows:
        url = SITE + loc
        url = url.replace("&", "&amp;")
        out += ["  <url>",
                f"    <loc>{url}</loc>",
                f"    <lastmod>{today}</lastmod>",
                f"    <changefreq>{freq}</changefreq>",
                f"    <priority>{pri}</priority>",
                "  </url>"]
    out.append("</urlset>")

    path = pathlib.Path(__file__).resolve().parent.parent / "site" / "sitemap.xml"
    path.write_text("\n".join(out) + "\n")
    print(f"wrote {path} — {len(rows)} urls")

if __name__ == "__main__":
    sys.exit(main())
