# Travel Plans

Trip research and comparisons, published at **https://wernercd.github.io/TravelPlans/**.

## Features
- A home page listing each trip being planned.
- **Winter 2027** (`winter-2027.html`): a two-week January/February trip for one US and one Nigerian passport. Germany, Barbados and Japan compared on visas, flights, hotels, daily costs and weather; alternatives (Thailand, Kenya, Sri Lanka, Vietnam, Senegal, Cape Verde, Malaysia, Tanzania with Zanzibar, Egypt, Italy and more); visa rules for both passports re-checked against official sources on 27 Nov 2026 (`visaChecked` in the JSON); Air Peace and safe connections; official links; an animated cost chart.
- **Trip Planner** (`planner.html` + `planner.js` + `data/winter-2027.json`): set dates, nights, hotel level and weights; destinations re-rank with costs for two, the latest safe date to start visas, and events inside the dates. Settings stay in the browser (`travel.planner.<trip>`); Copy link puts them in a `#s=start,nights,tier,weights` link that overrides saved settings. Each destination's `more` field is the link to its full plan. Every result has a **Plan this trip** panel: itemised cost with each traveller's share, dated steps (paperwork from `leadDays`, flights at a 60-day rule of thumb, events, trip dates) and an .ics download built in the browser. The JSON is the one place to change a destination's numbers; after changing it, update the copies `check_site.py` lists (and re-run `tools/make_gif.py`), or the deploy stops.
- Light and dark themes (key `travel.theme`), update notice for long-open tabs, print-friendly pages.

## Data and copyright
Prices are ranges taken from airline and fare-site listings on the research date, and entry rules come from public government and news sources. Each trip page lists its sources. Nothing here is a quote or legal advice; confirm with airlines and official sites before booking.

## Layout
```
site/            the published site (GitHub Pages serves this folder)
  index.html     trip list
  winter-2027.html
  planner.html
  changes.html   change log
  404.html
  styles.css, theme.js, version.js, icon.svg, og.png, winter-trip-costs.gif
tools/
  check_site.py  page check run by CI before every deploy; also fails if any copied cost figure
                 (tables, route totals, flight lines, chart alt text, make_gif.py) drifts from the trip JSON
  make_gif.py    renders winter-trip-costs.gif and og.png (needs Pillow)
.github/workflows/pages.yml
```
Layout and conventions follow the D&D Toolbox sites: static HTML, no build step, a separate `changes.html`, `?v=dev` asset links that CI replaces with the commit id.

## Run locally
```
python -m http.server 8000 --directory site
python tools/check_site.py
```
Add a trip: copy `winter-2027.html`, add a card to `index.html` and a footer link on every page, and log it in `changes.html`.

## Credits and license
Code is MIT licensed (see `LICENSE`). Fonts: Fraunces and Inter from Google Fonts.
