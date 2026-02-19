# Parish Scraper

A comprehensive Node.js scraper that collects Orthodox parish data from **12+ public directories** across all major jurisdictions in North America and exports to CSV + JSON.

## Sources

| Key | Source | URL | Est. Parishes |
|-----|--------|-----|---------------|
| `oca` | Orthodox Church in America | https://www.oca.org/parishes/search | ~660 |
| `chicago` | Diocese of Chicago & Mid-America (ROCOR) | https://chicagodiocese.org/parishes.html | ~440 |
| `goarch` | Greek Orthodox Archdiocese of America | https://www.goarch.org/parishes | ~500 |
| `antiochian` | Antiochian Orthodox Christian Archdiocese | https://www.antiochian.org/parishes | ~300 |
| `serbian` | Serbian Orthodox Church in NA | https://www.serbianorthodox.net/ | ~80 |
| `romanian` | Romanian Orthodox Archdiocese | https://roea.org/parishes | ~100 |
| `bulgarian` | Bulgarian Eastern Orthodox Diocese | https://www.bulgariandiocese.org/ | ~30 |
| `acrod` | American Carpatho-Russian Orthodox Diocese | https://www.acrod.org/parishes/ | ~80 |
| `uoc` | Ukrainian Orthodox Church of the USA | https://www.uocusa.org/directories_parishes | ~90 |
| `ea-diocese` | Eastern American Diocese (ROCOR) | Various | ~100 |
| `assembly` | Assembly of Canonical Orthodox Bishops | https://www.assemblyofbishops.org/directories/parishes | Cross-reference |
| `orthodox-world` | Orthodox World Directory | https://orthodox-world.oramaworld.com/ | Supplementary |

**Total Coverage: ~2,400+ Orthodox parishes in North America**

## Quick Start

### Scrape All Sources (Recommended)

```bash
npm install
npm run scrape:all          # scrape ALL 12 sources + merge + deduplicate
npm run scrape:all:retry    # retry failed scrapers automatically
```

### Scrape Individual Sources

```bash
npm run scrape              # scrape all (alternative)
npm run scrape:oca
npm run scrape:chicago
npm run scrape:goarch       # Greek Orthodox
npm run scrape:antiochian
npm run scrape:serbian
npm run scrape:romanian
npm run scrape:bulgarian
npm run scrape:acrod
npm run scrape:uoc
npm run scrape:ea-diocese
npm run scrape:assembly
npm run scrape:orthodox-world
```

Output files are written to `output/` as both CSV and JSON:

```
output/
  oca.csv / oca.json
  chicago-rocor.csv / chicago-rocor.json
  goarch.csv / goarch.json                      # Greek Orthodox
  antiochian.csv / antiochian.json
  serbian.csv / serbian.json
  romanian.csv / romanian.json
  bulgarian.csv / bulgarian.json
  acrod.csv / acrod.json
  uoc-usa.csv / uoc-usa.json
  ea-diocese.csv / ea-diocese.json
  assembly-of-bishops.csv / assembly-of-bishops.json
  orthodox-world.csv / orthodox-world.json
  
  all-parishes.csv                              # ⭐ Merged & deduplicated
  all-parishes.json                             # ⭐ Complete dataset
```

## Features

### Comprehensive Coverage
- **12 scrapers** covering all major Orthodox jurisdictions in North America
- Cross-references multiple sources for accuracy
- Deduplication merges records from different sources intelligently

### Data Quality
- Automatic geocoding (latitude/longitude)
- Diocese/Metropolis/Deanery assignment
- Phone, website, address, clergy information
- Source priority system (first-party > cross-reference > supplementary)

### Scrape-All Script
The `scrape-all.js` script provides:
- ✅ Runs all 12 scrapers sequentially
- ✅ Automatic retry on failure (with `--retry` flag)
- ✅ Comprehensive error handling
- ✅ Detailed summary report with coverage analysis
- ✅ Data quality metrics (geocoding %, phone %, website %, etc.)
- ✅ Jurisdiction and state breakdowns

## How It Works

Each scraper module uses a multi-strategy approach:

1. **HTML table parsing** – looks for `<table>` elements with structured rows/columns.
2. **Repeated-block parsing** – matches common CMS selectors (`.parish-item`, `.views-row`, etc.).
3. **Embedded JSON extraction** – searches `<script>` tags for inline data arrays.
4. **API probing** – tries known API endpoint patterns for JSON responses.
5. **Link-based fallback** – filters `<a>` tags whose text matches church/mission/parish keywords.

All HTTP requests include polite delays, retry logic with exponential back-off, and a standard browser User-Agent header.

## Project Structure

```
scrape-all.js                 # ⭐ Comprehensive scraper (runs all sources)
index.js                      # CLI runner (individual or all sources)
src/
  utils.js                    # shared HTTP client, CSV/JSON writers
  sanitize.js                 # data normalization
  dedup.js                    # intelligent deduplication & merging
  diocese-lookup.js           # diocese/patriarchate mapping
  import.js                   # SQLite database import
  db.js                       # SQLite schema & queries
  geocode.js                  # coordinate lookup
  scrapers/
    oca.js
    chicago-rocor.js
    goarch.js                 # Greek Orthodox
    antiochian.js
    serbian.js
    romanian.js
    bulgarian.js
    acrod.js
    Deduplication**: The scraper intelligently merges duplicate records across sources. For example, a parish might appear in both the OCA directory and the Assembly of Bishops directory; the deduplicator will combine them into a single record, preferring the most complete data from the highest-priority source.

- **Source Priority**: Primary jurisdiction websites (e.g., OCA, GOARCH, Antiochian) are prioritized over cross-reference sources (Assembly of Bishops) when merging duplicate records.

- **Orthodox World** (`orthodox-world`) is protected by Cloudflare and may return HTTP 403 to automated requests. It requires a headless browser (Puppeteer/Playwright) or residential proxy to scrape. The scraper handles this gracefully.

- **Greek Orthodox (GOARCH)**: Organizes parishes under metropolises (Direct Archdiocesan District, Atlanta, Boston, Chicago, Denver, Detroit, New Jersey, Pittsburgh, San Francisco).

- **Assembly of Bishops**: The scraper can be configured to filter by jurisdiction. By default it scrapes all canonical jurisdictions
    assembly-of-bishops.js
    orthodox-world.js
output/                       # generated (gitignored)
public/                       # web interface
server.js                     # Express server for map visualization
```

## Requirements

- Node.js 18+
- npm

## Notes

- **Orthodox World** (`orthodox-world`) is protected by Cloudflare and returns HTTP 403 to automated requests. It requires a headless browser (Puppeteer/Playwright) or a residential proxy to scrape. The scraper handles this gracefully and reports 0 results without crashing.
- The Assembly of Bishops scraper filters by ROCOR (`jur=roc`) by default. To scrape other jurisdictions, change the `jur` query parameter in [src/scrapers/assembly-of-bishops.js](src/scrapers/assembly-of-bishops.js).
- All scrapers include polite delays between requests to avoid overwhelming target servers.
