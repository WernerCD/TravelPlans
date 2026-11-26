"""TravelPlans site check v1 (adapted from the D&D Toolbox check_site.py).

CI runs it before every deploy, so a broken page never goes live:
    python tools/check_site.py
Checks every site/*.html page: <html lang>, one <h1>, a <title>, the header bar, footer and theme script;
non-404 pages also need a description, og:title, theme-color and the update notice; every local src/href exists.
Exit code 1 on any failure.
"""
import re, sys
from pathlib import Path

SITE = Path(__file__).resolve().parents[1] / "site"
errors = []

def check_page(f):
    name = f.name
    html = f.read_text(encoding="utf-8")
    must = {"lang": r'<html lang="[a-z]', "title": r"<title>[^<]+</title>", "hub-bar": r'class="wrap hub-bar"',
            "footer": r'class="site-footer"', "theme": r"getItem\('travel\.theme'\)"}
    if name != "404.html":
        must.update({"description": r'<meta name="description"', "og:title": r'property="og:title"',
                     "theme-color": r'name="theme-color"', "version.js": r'src="version\.js\?v='})
    for k, rx in must.items():
        if not re.search(rx, html): errors.append(f"{name}: no {k}")
    if len(re.findall(r"<h1[ >]", html)) != 1: errors.append(f"{name}: needs exactly one <h1>")
    for ref in re.findall(r'(?:src|href)="([^"#:?]+)(?:\?[^"]*)?"', html):
        if ref.startswith("//") or ref in ("./", "/"): continue
        rel = re.sub(r"^/[^/]+/", "", ref) if ref.startswith("/") else ref
        if rel.endswith("/") or not rel: continue
        if not (SITE / rel).exists(): errors.append(f"{name}: links missing file {ref}")

import json
for j in SITE.rglob("*.json"):
    try:
        doc = json.loads(j.read_text(encoding="utf-8"))
        for d in doc.get("destinations", []):
            for k in ("id", "name", "color", "hotel", "daily", "scores", "leadDays"):
                if k not in d: errors.append(f"{j.name}: {d.get('id', '?')} has no {k}")
    except Exception as e: errors.append(f"{j.relative_to(SITE)}: bad JSON ({e})")

pages = sorted(SITE.glob("*.html"))
for need in ("index.html", "changes.html", "404.html"):
    if not (SITE / need).exists(): errors.append(f"{need}: missing")
for p in pages: check_page(p)

if errors:
    print("check_site FAILED:\n  " + "\n  ".join(errors)); sys.exit(1)
print(f"check_site OK ({len(pages)} pages)")
