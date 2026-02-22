# European Orthodox Church Scrapers

Added **7 new scrapers** for comprehensive coverage of European Orthodox churches.

## New Sources Overview

| Source Key | Scraper | Jurisdiction | Country | URL | Coverage |
|------------|---------|--------------|---------|-----|----------|
| `romanian-europe` | `romanian-orthodox-europe.js` | Romanian Orthodox Church | Romania 🇷🇴 | https://www.patriarhia.ro/ | Metropolities, parishes, dioceses |
| `serbian-europe` | `serbian-orthodox-europe.js` | Serbian Orthodox Church | Serbia 🇷🇸 | https://www.spc.rs/ | 9+ dioceses, churches |
| `ukrainian-europe` | `ukrainian-orthodox-europe.js` | Ukrainian Orthodox Church | Ukraine 🇺🇦 | https://www.orthodoxua.org/ | Multiple jurisdictions |
| `russian-europe` | `russian-orthodox-europe.js` | Russian Orthodox Church | Russia 🇷🇺 | https://www.patriarchia.ru/ | Moscow Patriarchate branches |
| `church-of-greece` | `church-of-greece.js` | Church of Greece | Greece 🇬🇷 | https://www.ec-synod.gr/ | Metropolises, parishes |
| `warsaw-orthodox` | `warsaw-orthodox.js` | Polish Orthodox Church | Poland 🇵🇱 | https://www.orthodox.pl/ | Polish dioceses |
| `georgian-orthodox` | `georgian-orthodox.js` | Georgian Orthodox Church | Georgia 🇬🇪 | https://www.georgian-church.org/ | Georgian dioceses, monasteries |

**Total Combined Coverage: ~1000+ European Orthodox parishes**

## Usage

### Scrape All European Sources

```bash
# Scrape all new European sources
npm run scrape -- --source romanian-europe && \
npm run scrape -- --source serbian-europe && \
npm run scrape -- --source ukrainian-europe && \
npm run scrape -- --source russian-europe && \
npm run scrape -- --source church-of-greece && \
npm run scrape -- --source warsaw-orthodox && \
npm run scrape -- --source georgian-orthodox
```

### Scrape Individual European Source

```bash
node scrape.js --source romanian-europe
node scrape.js --source serbian-europe
node scrape.js --source ukrainian-europe
node scrape.js --source russian-europe
node scrape.js --source church-of-greece
node scrape.js --source warsaw-orthodox
node scrape.js --source georgian-orthodox
```

### Scrape All (North America + Europe)

```bash
npm run scrape  # Scrapes all 19 sources (12 NA + 7 Europe)
```

## Scraper Details

### Romanian Orthodox Church (`romanian-europe`)
- **URL**: https://www.patriarhia.ro/
- **Strategy**: Scrapes diocesan structure (Metropolities) and parish listings
- **Dioceses**: Muntenia, Moldavia, Banat, Cluj, Arges
- **Data Points**: Name, diocese, city, phone, address, website
- **Estimated Coverage**: 100-150 Orthodox parishes in Romania

### Serbian Orthodox Church (`serbian-europe`)
- **URL**: https://www.spc.rs/
- **Strategy**: Diocese-level scraping with church detail pages
- **Dioceses**: 9 major dioceses including Raska-Prizren, Nis, Valjevo, Vranje
- **Data Points**: Church name, diocese, city, contact info
- **Estimated Coverage**: 150-200 Serbian Orthodox churches

### Ukrainian Orthodox Church (`ukrainian-europe`)  
- **URL**: https://www.orthodoxua.org/ & https://www.uocmp.org/
- **Strategy**: Multi-jurisdiction scraping (UOC-MP, UOC-KP, UAOC)
- **Dioceses**: 9+ eparchies including Kyiv, Kharkiv, Lviv, Donetsk
- **Data Points**: Parish name, diocese, city, clergy
- **Estimated Coverage**: 200-300 Ukrainian Orthodox parishes
- **Note**: Ukraine has complex ecclesiastical structure due to recent historical divisions

### Russian Orthodox Church (`russian-europe`)
- **URL**: https://www.patriarchia.ru/
- **Strategy**: Moscow Patriarchate diocesan scraping
- **Coverage**: Primarily Russian territory + some diaspora
- **Data Points**: Church name, diocese, city, address, phone
- **Estimated Coverage**: 100-200 churches

### Church of Greece (`church-of-greece`)
- **URL**: https://www.ec-synod.gr/
- **Strategy**: Metropolitan-level scraping
- **Dioceses**: Athens, Thessaloniki, Crete, Rhodes, Corfu, Patras, etc.
- **Data Points**: Parish name, metropolis, city, contact info
- **Estimated Coverage**: 100-150 parishes

### Polish Orthodox Church (`warsaw-orthodox`)
- **URL**: https://www.orthodox.pl/
- **Strategy**: Directory parsing with diocese classification
- **Dioceses**: Warsaw, Białystok, and other administrative divisions
- **Data Points**: Church name, diocese, city, phone, address
- **Estimated Coverage**: 50-100 Orthodox parishes in Poland

### Georgian Orthodox Church (`georgian-orthodox`)
- **URL**: https://www.georgian-church.org/
- **Strategy**: Hierarchical structure scraping
- **Data Points**: Church/monastery name, diocese, city
- **Estimated Coverage**: 30-50 Georgian Orthodox churches
- **Special**: Includes historical monasteries and cathedrals

## Implementation Details

All European scrapers follow the same pattern as North American scrapers:

### Architecture
1. **Multi-Strategy Parsing**
   - HTML table parsing for structured data
   - Seminary pattern matching (`.church`, `.parish`, `.monastery`)
   - Link extraction for church directories
   - Embedded JSON parsing when available

2. **Data Extraction**
   - Church/Parish name
   - Diocese/Metropolis/Eparchy (canonical jurisdiction)
   - City/Location
   - Phone, Address, Website
   - Clergy information where available
   - Latitude/Longitude (future: geocoding)

3. **Deduplication**
   - Automatic merge of duplicate entries by name + city
   - Cross-reference validation

4. **Error Handling**
   - Graceful fallbacks for missing data
   - Retry mechanisms for network failures
   - Timeout protection

### Output Format

Each scraper generates:
```
output/
  {source-key}.csv          # CSV format for analysis
  {source-key}.json         # JSON format for APIs
```

Example JSON record:
```json
{
  "source": "romanian-europe",
  "name": "Holy Cross Orthodox Cathedral",
  "jurisdiction": "Romanian Orthodox Church",
  "diocese": "Mitropolia Munteniei și Dobrogei",
  "city": "Constanța",
  "state": "",
  "country": "Romania",
  "phone": "+40(241) 619000",
  "address": "Piața Ovidiu 1, Constanța 900100",
  "clergy": "Metropolitan Teofan",
  "website": "https://www.mitropolia-mesembria.ro/",
  "lat": "44.1679",
  "lng": "28.6537"
}
```

## Merging with North American Data

The existing `npm run scrape` continues to work and will now include European sources in the merged `all-parishes.csv` and `all-parishes.json` files.

```bash
npm run scrape  # Generates combined dataset (12 NA + 7 Europe = 19 sources)
```

## Requirements for Each Scraper

- **cheerio** - DOM parsing (already installed)
- **axios** - HTTP requests (already installed)
- **csv-writer** - CSV output (already installed)

## Future Enhancements

Potential additional European sources:
- [ ] Bulgarian Orthodox Church (Europe) - https://www.pomestna-tsarkva.bg/
- [ ] Church of Cyprus
- [ ] Orthodox Church in Finland
- [ ] Orthodox Church in Estonia
- [ ] Coptic Orthodox Church presence
- [ ] Ethiopian Orthodox presence
- [ ] Czech Orthodox Diocese
- [ ] Hungarian Orthodox Diocese

## Troubleshooting

### "Cannot find module" error
```bash
# Ensure all dependencies are installed
npm install
```

### Scraper times out
```bash
# Increase timeout for slow servers (microseconds)
SCRAPER_TIMEOUT_MS=600000 node scrape.js --source romanian-europe
```

### Missing data on specific source
- Check website structure changed
- Verify current source URL in scraper file
- Add new URL variants to `DIRECTORY_URLS` array
- Run with verbose logging

## Testing

Test individual scrapers:
```bash
node src/scrapers/romanian-orthodox-europe.js
node src/scrapers/serbian-orthodox-europe.js
node src/scrapers/church-of-greece.js
```

## Notes

- All scrapers respect HTTP rate limiting and include random delays
- User-Agent headers prevent blocking
- Graceful error handling ensures one failing scraper doesn't affect others
- Geographic geocoding can be applied post-scraping for mapping
- Clergy names are extracted but not cross-validated (future: canonicalize against known clergy databases)
