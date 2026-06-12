# CAC/Movement — NTB Month-over-Month Analyzer

A single-page web app that compares two new-to-brand (NTB) campaign exports and surfaces
month-over-month movement in spend, customer acquisition cost (CAC), NTB sales, NTB share,
and ROAS — by category, by campaign, with pause / lean-in recommendations.

Everything runs **in the browser**. No server, no upload, no data leaves the page.

## What it does

- Drop two NTB-by-campaign CSV exports (an earlier period and a later one).
- Define categories by the search terms found in campaign names (start blank; add your own).
- Get an on-screen dashboard:
  - Headline cards (overall CAC, NB CAC, spend, NTB sales, NTB purchases) with MoM deltas.
  - A **channel toggle** (All / PPC only / DSP only) that re-scopes the cards and summary.
  - Overall vs. new-to-brand (`| NB |`) summary table.
  - Category breakdown with a CAC comparison chart and a driver caption.
  - Campaign movers — sortable by any column (spend, sales, NTB sales, NTB % of sales,
    CAC, and any delta) with a live search filter; `| NB |` / `| B |` / DSP flags.
  - Pause / lean-in recommendations (always excludes `| B |` campaigns).
- Export the full analysis as a four-tab Excel workbook (Summary, By Category, Campaign
  Movers, Recommendations).

## How CAC is computed

CAC is always recomputed from summed cost ÷ summed NTB purchases at the aggregate level —
never by averaging the per-row CAC column (that ignores volume weighting). When a segment
has zero NTB purchases, CAC shows `n/a` rather than dividing by zero. `| B |` (branded)
campaigns count toward overall/NB/category totals but are excluded from recommendations.

## DSP vs. PPC vs. Others channel split

The channel toggle separates performance by channel using campaign-name rules:
- **PPC** — name starts with `PLTFRM |`, contains `| B |` or `| NB |`, and has an `SP`/`SB`/`SBV`/`SD` token.
- **DSP** — name starts with a number (date prefix) or contains `conversion`, `consideration`, `streaming tv`, or `STV`.
- **Others** — anything matching neither rule (e.g. a misspelled prefix or a different vendor), surfaced in its own channel so nothing is silently miscounted.

PPC is evaluated first, then DSP, else Others. The three buckets always reconcile back to
"All" (PPC + DSP + Others = total). Each channel shows both **ROAS** (total sales ÷ spend) and
**NTB ROAS** (new-to-brand sales ÷ spend). The Excel Summary tab includes all four scopes.

## Expected CSV columns

The app reads these columns (leading/trailing spaces and `$`/comma formatting are handled):
`campaign`, `total_cost`, `new_to_brand_purchases`, `new_to_brand_product_sales`,
`non_new_to_brand_purchases`. Other columns are ignored.

## Run locally

It's static files — open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Deploy to GitHub Pages

1. Create a new GitHub repository and push these files to the `main` branch:
   ```bash
   git init
   git add .
   git commit -m "CAC/Movement analyzer"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
2. In the repo on GitHub: **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **Deploy from a branch**.
4. Set branch to **main** and folder to **/ (root)**, then **Save**.
5. Wait ~1 minute. Your site will be live at `https://<you>.github.io/<repo>/`.

No build step is required. The third-party libraries (PapaParse, SheetJS, Chart.js) are
vendored under `vendor/` so the site works offline and doesn't depend on a CDN.

## Project structure

```
index.html      markup + script/style includes
styles.css      PLTFRM visual identity (black / serif display / data type)
analysis.js     pure analysis engine (no DOM) — mirrors the cac-mom-analysis skill
app.js          UI wiring, rendering, chart, Excel export
vendor/         PapaParse, SheetJS (xlsx), Chart.js
```

`analysis.js` is a faithful port of the `cac-mom-analysis` skill's `analyze.py`, so the
browser output matches the skill's output exactly.

## Second page — Sponsored Products CAC Deep Dive

`deepdive.html` is a separate page (linked from the masthead nav) for a single month's
**NTB-by-campaign-and-target** export (Sponsored Products only). Drop the report the same
way as the MoM page; every campaign row has a **+** to expand and reveal the targets inside
it, with all of the report's metrics (impressions, clicks, spend, advertised/halo purchases
and sales, NTB purchases/sales advertised + halo, NTB % of sales, and CAC advertised / halo /
blended). The table is sortable by any column, searchable across campaigns and targets, has an
Expand-all toggle, and exports to Excel as a flat campaign+target sheet. The SP campaigns shown
here line up one-to-one with the most recent month's SP campaigns on the MoM page.

Note: this report uses backslash-escaped quotes in some campaign/target names; the page
sanitizes those on load so rows parse cleanly.
