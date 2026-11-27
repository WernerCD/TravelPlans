"""TravelPlans site check v2 (adapted from the D&D Toolbox check_site.py).

CI runs it before every deploy, so a broken page never goes live:
    python tools/check_site.py
Checks every site/*.html page: <html lang>, one <h1>, a <title>, the header bar, footer and theme script;
non-404 pages also need a description, og:title, theme-color and the update notice; every local src/href exists.
Every cost figure copied into the pages, the chart alt text and make_gif.py must match site/data/<trip>.json.
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

# --- Numbers: the trip JSON is the one source of truth; every hand-copied figure must match it ---------
# Checked copies: comparison tables (columns matched by their c-<xx> colour class), the "Total: about" and
# flight lines in each route section, the chart alt text on every page, and the DATA rows in make_gif.py.
NIGHTS, TOL = 14, 50          # the pages quote 14-night, mid-range totals; copies may round to the nearest $50
CLASS_ID = {"c-de": "germany", "c-bb": "barbados", "c-jp": "japan", "c-th": "thailand",
            "c-vn": "vietnam", "c-ke": "kenya", "c-lk": "srilanka"}
RANGE = r"\$([\d,]+) to \$([\d,]+)"

def num(s): return int(s.replace(",", ""))

def figures(d):
    """Same arithmetic as planner.js cost() at mid-range, plus the per-row figures the tables show."""
    paid = NIGHTS - (d["package"]["nights"] if d.get("package") else 0)
    lo = hi = 0
    for k in ("flightUS", "flightNG", "extras", "visa"):
        if d.get(k): lo += d[k][0]; hi += d[k][1]
    lo += (d["hotel"][0] + d["daily"][0]) * paid; hi += (d["hotel"][1] + d["daily"][1]) * paid
    if d.get("package"): lo += d["package"]["cost"][0]; hi += d["package"]["cost"][1]
    return {"total": (lo, hi), "flightUS": d.get("flightUS"), "flightNG": d.get("flightNG"),
            "hotel": (d["hotel"][0] * NIGHTS, d["hotel"][1] * NIGHTS), "daily": (d["daily"][0] * NIGHTS, d["daily"][1] * NIGHTS)}

def compare(where, what, got, want):
    if want is None: errors.append(f"{where}: {what} quoted as ${got[0]:,}-${got[1]:,} but the JSON has none"); return
    if abs(got[0] - want[0]) > TOL or abs(got[1] - want[1]) > TOL:
        errors.append(f"{where}: {what} says ${got[0]:,} to ${got[1]:,}, JSON gives ${want[0]:,.0f} to ${want[1]:,.0f}")

def check_numbers(trip_json):
    doc = json.loads(trip_json.read_text(encoding="utf-8"))
    figs = {d["id"]: figures(d) for d in doc["destinations"]}
    names = {d["name"]: d["id"] for d in doc["destinations"]}
    page = SITE / f"{doc['trip']}.html"
    html = page.read_text(encoding="utf-8")
    seen = 0
    # Tables: header classes give the column order; known row labels map to a figure
    rows = {"Rough total for 2": "total", "From St. Louis": "flightUS", "From Port Harcourt": "flightNG",
            "Hotel, 14 nights": "hotel", "Food, transport, sights": "daily"}
    for table in re.findall(r"<table.*?</table>", html, re.S):
        head = re.search(r"<thead>(.*?)</thead>", table, re.S)
        if not head: continue
        cols = [CLASS_ID.get(c) for c in re.findall(r'<th class="(c-[a-z]+)"', head.group(1))]
        if not any(cols): continue
        for tr in re.findall(r"<tr>(.*?)</tr>", table, re.S):
            label = re.search(r"<th>([^<]+)</th>", tr)
            if not label or label.group(1).strip() not in rows: continue
            key = rows[label.group(1).strip()]
            for did, td in zip(cols, re.findall(r"<td>(.*?)</td>", tr, re.S)):
                b = re.search(r"<b>" + RANGE + r"</b>", td) or (re.search(RANGE, td) if key == "total" else None)
                if did and b:
                    compare(f"{page.name} table", f"{did} '{label.group(1).strip()}'", (num(b[1]), num(b[2])), figs[did][key]); seen += 1
    # Route sections: <section id="<destination id>"> ... "Total: about $X to $Y" and the flight line
    for did in figs:
        sec = re.search(r'<section[^>]*id="%s".*?</section>' % did, html, re.S)
        if not sec: continue
        s = sec.group(0)
        t = re.search(r"Total: about " + RANGE, s)
        if t: compare(f"{page.name} #{did}", "route total", (num(t[1]), num(t[2])), figs[did]["total"]); seen += 1
        f = re.search(r"St\. Louis about " + RANGE + r"; Port Harcourt[^$]*about " + RANGE, s)
        if f:
            compare(f"{page.name} #{did}", "St. Louis flight", (num(f[1]), num(f[2])), figs[did]["flightUS"])
            compare(f"{page.name} #{did}", "Port Harcourt flight", (num(f[3]), num(f[4])), figs[did]["flightNG"]); seen += 2
    # Chart alt text on every page that shows the chart
    for p in sorted(SITE.glob("*.html")):
        alt = re.search(r'<img src="winter-trip-costs\.gif"[^>]*alt="([^"]+)"', p.read_text(encoding="utf-8"))
        if not alt: continue
        found = dict((names.get(n.strip()), (num(a), num(b))) for n, a, b in re.findall(r"([A-Z][a-z]+(?: [A-Z][a-z]+)?) " + RANGE, alt.group(1)))
        for did in figs:
            if did not in found: errors.append(f"{p.name}: chart alt text has no figure for {did}"); continue
            compare(f"{p.name} chart alt", did, found[did], figs[did]["total"]); seen += 1
    # The chart itself: DATA rows in tools/make_gif.py, ("Name", lo, hi, ...)
    gif = (SITE.parent / "tools" / "make_gif.py").read_text(encoding="utf-8")
    data = dict((names.get(n), (int(a), int(b))) for n, a, b in re.findall(r'\("([^"]+)", (\d+), (\d+), \(', gif))
    for did in figs:
        if did not in data: errors.append(f"make_gif.py: no chart row for {did}"); continue
        compare("make_gif.py DATA", did, data[did], figs[did]["total"]); seen += 1
    return seen

numbers_checked = 0
for j in SITE.glob("data/*.json"):
    try: numbers_checked += check_numbers(j)
    except Exception as e: errors.append(f"{j.name}: number check crashed ({e})")
if numbers_checked < 20: errors.append(f"number check found only {numbers_checked} figures; a page layout probably changed")

pages = sorted(SITE.glob("*.html"))
for need in ("index.html", "changes.html", "404.html"):
    if not (SITE / need).exists(): errors.append(f"{need}: missing")
for p in pages: check_page(p)

if errors:
    print("check_site FAILED:\n  " + "\n  ".join(errors)); sys.exit(1)
print(f"check_site OK ({len(pages)} pages, {numbers_checked} figures match the trip data)")
