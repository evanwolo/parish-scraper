# Parish Scraper

A Node.js scraper that collects Orthodox parish data from five public directories and exports CSV + JSON.

## Sources

| Key | Source | URL |
|-----|--------|-----|
| `chicago` | Diocese of Chicago & Mid-America (ROCOR) | https://chicagodiocese.org/parishes.html |
| `assembly` | Assembly of Canonical Orthodox Bishops | https://www.assemblyofbishops.org/directories/parishes?jur=roc&searchType=jurisdiction |
| `oca` | Orthodox Church in America | https://www.oca.org/parishes/search |
| `uoc` | Ukrainian Orthodox Church of the USA | https://www.uocusa.org/directories_parishes |
| `orthodox-world` | Orthodox World Directory | https://orthodox-world.oramaworld.com/ |

## Quick Start

```bash
npm install
npm run scrape              # scrape ALL sources
npm run scrape:chicago      # scrape one source
npm run scrape:assembly
npm run scrape:oca
npm run scrape:uoc
npm run scrape:orthodox-world
```

Output files are written to `output/` as both CSV and JSON:

```
output/
  chicago-rocor.csv
  chicago-rocor.json
  assembly-of-bishops.csv
  assembly-of-bishops.json
  oca.csv
  oca.json
  uoc-usa.csv
  uoc-usa.json
  orthodox-world.csv
  orthodox-world.json
  all-parishes.csv       # merged (only when scraping all)
  all-parishes.json
```

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
index.js                      # CLI runner
src/
  utils.js                    # shared HTTP client, CSV/JSON writers
  scrapers/
    chicago-rocor.js
    assembly-of-bishops.js
    oca.js
    uoc-usa.js
    orthodox-world.js
output/                       # generated (gitignored)
```

## Requirements

- Node.js 18+
- npm

## Notes

- **Orthodox World** (`orthodox-world`) is protected by Cloudflare and returns HTTP 403 to automated requests. It requires a headless browser (Puppeteer/Playwright) or a residential proxy to scrape. The scraper handles this gracefully and reports 0 results without crashing.
- The Assembly of Bishops scraper filters by ROCOR (`jur=roc`) by default. To scrape other jurisdictions, change the `jur` query parameter in [src/scrapers/assembly-of-bishops.js](src/scrapers/assembly-of-bishops.js).
- All scrapers include polite delays between requests to avoid overwhelming target servers.
