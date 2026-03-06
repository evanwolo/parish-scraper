# Parish Scraper

A comprehensive Node.js scraper that collects Orthodox parish data from **19+ public directories** across North America and Europe and exports to CSV + JSON.

## Sources

### North America (12 sources)

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

### Europe (7 sources) 🌍

| Key | Source | URL | Country | Est. Coverage |
|-----|--------|-----|---------|---------------|
| `romanian-europe` | Romanian Orthodox Church | https://www.patriarhia.ro/ | Romania 🇷🇴 | ~150 |
| `serbian-europe` | Serbian Orthodox Church | https://www.spc.rs/ | Serbia 🇷🇸 | ~200 |
| `ukrainian-europe` | Ukrainian Orthodox Church | https://www.orthodoxua.org/ | Ukraine 🇺🇦 | ~300 |
| `russian-europe` | Russian Orthodox Church | https://www.patriarchia.ru/ | Russia 🇷🇺 | ~150 |
| `church-of-greece` | Church of Greece | https://www.ec-synod.gr/ | Greece 🇬🇷 | ~150 |
| `warsaw-orthodox` | Polish Orthodox Church | https://www.orthodox.pl/ | Poland 🇵🇱 | ~100 |
| `georgian-orthodox` | Georgian Orthodox Church | https://www.georgian-church.org/ | Georgia 🇬🇪 | ~50 |

**Total Coverage: ~3,700+ Orthodox parishes (North America + Europe)**

## Quick Start

### Scrape All Sources (Recommended)

```bash
npm install
npm run scrape              # scrape ALL 12 sources + merge + deduplicate
npm run scrape:retry        # retry failed scrapers automatically
npm run snapshot:refresh    # rebuild DB + map + static frontend snapshots
```

### Static Snapshot Data Layer

The frontend can now run as a standalone client from static JSON snapshots.

- Live backend role: scrape, seed, refresh, update, and spot-check data
- Static client role: read immutable snapshot payloads in `public/data/snapshots/`
- Frontend load order: snapshot first, then fallback to live `/api/*` endpoints

Commands:

```bash
npm run snapshot            # build static snapshot JSON from DB
npm run snapshot:refresh    # import:fresh + compute + snapshot
npm run pipeline            # full pipeline now includes snapshot stage
```

### Scrape Individual Sources

```bash
# North America
node scrape.js --source oca
node scrape.js --source chicago
node scrape.js --source goarch       # Greek Orthodox
node scrape.js --source antiochian
node scrape.js --source serbian
node scrape.js --source romanian
node scrape.js --source bulgarian
node scrape.js --source acrod
node scrape.js --source uoc
node scrape.js --source ea-diocese
node scrape.js --source assembly
node scrape.js --source orthodox-world

# Europe 🌍
node scrape.js --source romanian-europe
node scrape.js --source serbian-europe
node scrape.js --source ukrainian-europe
node scrape.js --source russian-europe
node scrape.js --source church-of-greece
node scrape.js --source warsaw-orthodox
node scrape.js --source georgian-orthodox
```

Output files are written to `output/` as both CSV and JSON:

```
output/
  # North America (12 sources)
  oca.csv / oca.json
  chicago-rocor.csv / chicago-rocor.json
  goarch.csv / goarch.json
  antiochian.csv / antiochian.json
  serbian.csv / serbian.json
  romanian.csv / romanian.json
  bulgarian.csv / bulgarian.json
  acrod.csv / acrod.json
  uoc-usa.csv / uoc-usa.json
  ea-diocese.csv / ea-diocese.json
  assembly-of-bishops.csv / assembly-of-bishops.json
  orthodox-world.csv / orthodox-world.json
  
  # Europe (7 sources) 🌍
  romanian-orthodox-europe.csv / romanian-orthodox-europe.json
  serbian-orthodox-europe.csv / serbian-orthodox-europe.json
  ukrainian-orthodox-europe.csv / ukrainian-orthodox-europe.json
  russian-orthodox-europe.csv / russian-orthodox-europe.json
  church-of-greece.csv / church-of-greece.json
  warsaw-orthodox.csv / warsaw-orthodox.json
  georgian-orthodox.csv / georgian-orthodox.json
  
  all-parishes.csv                              # ⭐ Merged & deduplicated (19 sources)
  all-parishes.json                             # ⭐ Complete dataset
```

## Features

### Comprehensive Coverage
- **19 scrapers** covering Orthodox jurisdictions in North America (12) and Europe (7)
- Cross-references multiple sources for accuracy
- Deduplication merges records from different sources intelligently

### Data Quality
- Automatic geocoding (latitude/longitude)
- Diocese/Metropolis/Deanery assignment
- Phone, website, address, clergy information
- Source priority system (first-party > cross-reference > supplementary)

### Scrape Script
The `scrape.js` script provides:
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
scrape.js                     # ⭐ Unified scraper CLI (all or individual sources)
src/
  build-snapshots.js         # generate frontend static snapshot payloads
  snapshot-data.js           # shared live/static JSON data contract builders
  utils.js                    # shared HTTP client, CSV/JSON writers
  sanitize.js                 # data normalization
  dedup.js                    # intelligent deduplication & merging
  diocese-lookup.js           # diocese/patriarchate mapping
  import.js                   # SQLite database import
  db.js                       # SQLite schema & queries
  geocode.js                  # coordinate lookup
  routes/                     # Express route modules
    auth.js
    user.js
    parishes.js
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
data/
  diocese-registry.json
  patriarchate-hierarchy.json
output/                       # generated (gitignored)
public/                       # web interface
server.js                     # Express server for map visualization
```

## Requirements

- Node.js 18+
- npm

## Documentation

- [Scraper Audit](docs/SCRAPER_AUDIT.md) – Coverage analysis and data quality report
- [User Authentication](docs/USER_AUTHENTICATION.md) – Web interface authentication guide

## Notes

- **Orthodox World** (`orthodox-world`) is protected by Cloudflare and returns HTTP 403 to automated requests. It requires a headless browser (Puppeteer/Playwright) or a residential proxy to scrape. The scraper handles this gracefully and reports 0 results without crashing.
- The Assembly of Bishops scraper filters by ROCOR (`jur=roc`) by default. To scrape other jurisdictions, change the `jur` query parameter in [src/scrapers/assembly-of-bishops.js](src/scrapers/assembly-of-bishops.js).
- All scrapers include polite delays between requests to avoid overwhelming target servers.
