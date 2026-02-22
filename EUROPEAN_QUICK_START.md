# Quick Start: European Orthodox Church Scrapers

## Run All European Scrapers

```bash
# Scrape all 7 European sources sequentially
npm run scrape

# This will generate output files:
# - romanian-orthodox-europe.csv/json
# - serbian-orthodox-europe.csv/json  
# - ukrainian-orthodox-europe.csv/json
# - russian-orthodox-europe.csv/json
# - church-of-greece.csv/json
# - warsaw-orthodox.csv/json
# - georgian-orthodox.csv/json
# - Plus: all-parishes.csv/json (merged from all 19 sources)
```

## Run Individual European Scraper

```bash
# Romanian Orthodox Church in Europe
node scrape.js --source romanian-europe

# Serbian Orthodox Church  
node scrape.js --source serbian-europe

# Ukrainian Orthodox Church
node scrape.js --source ukrainian-europe

# Russian Orthodox Church
node scrape.js --source russian-europe

# Church of Greece
node scrape.js --source church-of-greece

# Polish Orthodox Church
node scrape.js --source warsaw-orthodox

# Georgian Orthodox Church
node scrape.js --source georgian-orthodox
```

## What Gets Scraped

### Romanian Orthodox Church (romanian-europe)
```bash
node src/scrapers/romanian-orthodox-europe.js
# Scrapes: https://www.patriarhia.ro/
# Coverage: Romanian dioceses (Mitropolitii) and parishes
# Output: romanian-orthodox-europe.[csv/json]
```

### Serbian Orthodox Church (serbian-europe)  
```bash
node src/scrapers/serbian-orthodox-europe.js
# Scrapes: https://www.spc.rs/
# Coverage: 9+ Serbian dioceses with church listings
# Output: serbian-orthodox-europe.[csv/json]
```

### Ukrainian Orthodox Church (ukrainian-europe)
```bash
node src/scrapers/ukrainian-orthodox-europe.js
# Scrapes: https://www.orthodoxua.org/ + https://www.uocmp.org/
# Coverage: Multiple Ukrainian jurisdictions (UOC-MP, UAOC, etc)
# Output: ukrainian-orthodox-europe.[csv/json]
```

### Russian Orthodox Church (russian-europe)
```bash
node src/scrapers/russian-orthodox-europe.js
# Scrapes: https://www.patriarchia.ru/
# Coverage: Moscow Patriarchate churches and dioceses
# Output: russian-orthodox-europe.[csv/json]
```

### Church of Greece (church-of-greece)
```bash
node src/scrapers/church-of-greece.js
# Scrapes: https://www.ec-synod.gr/
# Coverage: Greek metropolities and parishes
# Output: church-of-greece.[csv/json]
```

### Polish Orthodox Church (warsaw-orthodox)
```bash
node src/scrapers/warsaw-orthodox.js
# Scrapes: https://www.orthodox.pl/
# Coverage: Polish Orthodox dioceses and parishes
# Output: warsaw-orthodox.[csv/json]
```

### Georgian Orthodox Church (georgian-orthodox)
```bash
node src/scrapers/georgian-orthodox.js
# Scrapes: https://www.georgian-church.org/
# Coverage: Georgian dioceses, monasteries, cathedrals
# Output: georgian-orthodox.[csv/json]
```

## Output Format

Each scraper generates CSV and JSON files in the `output/` directory:

**CSV Example:**
```csv
source,name,jurisdiction,diocese,city,state,country,phone,address,clergy,website,lat,lng
romanian-europe,Holy Cross Cathedral,Romanian Orthodox Church,Mitropolia Munteniei,Constanța,,Romania,+40241619000,Piața Ovidiu 1,Metropolitan Teofan,https://...,44.168,28.654
```

**JSON Example:**
```json
{
  "source": "romanian-europe",
  "name": "Holy Cross Cathedral",
  "jurisdiction": "Romanian Orthodox Church",
  "diocese": "Mitropolia Munteniei",
  "city": "Constanța",
  "state": "",
  "country": "Romania",
  "phone": "+40241619000",
  "address": "Piața Ovidiu 1",
  "clergy": "Metropolitan Teofan",
  "website": "https://...",
  "lat": "44.168",
  "lng": "28.654"
}
```

## Merge All Sources (North America + Europe)

After scraping, merge all sources:

```bash
# This is done automatically with npm run scrape
# But you can force a merge:
npm run compute

# Output:
# - output/all-parishes.csv (3,700+ parishes)
# - output/all-parishes.json (all data structured)
```

## Troubleshooting

### Scraper times out
```bash
# Increase timeout
SCRAPER_TIMEOUT_MS=600000 node scrape.js --source romanian-europe
```

### Network error on specific source
- The scraper will retry automatically up to 3 times
- Check if the source URL has changed
- Test URL manually in browser first

### Missing data fields
- Not all sources provide all fields
- Phone and address may not be available for all churches
- Clergy info is scraped when available
- Website links are extracted from directory pages

### View details of what was scraped
```bash
# See the generated JSON to verify data quality
cat output/romanian-orthodox-europe.json | head -50
```

## Integration with Your Project

Add to your application:

```javascript
// Load European Orthodox churches
const romanianChurches = require('./output/romanian-orthodox-europe.json');
const allChurches = require('./output/all-parishes.json');

// Filter by location
const churhesInBucharest = romanianChurches.filter(c => c.city === 'București');

// Get by jurisdiction
const greekChurches = allChurches.filter(c => c.country === 'Greece');
```

## Data Quality Notes

- **Accuracy**: Data sourced directly from official church directories
- **Completeness**: Some fields may be empty (depends on source availability)
- **Updates**: Scraped data reflects current state of source websites
- **Deduplication**: Records are merged by name + city to avoid duplicates

## For More Information

See [EUROPEAN_SCRAPERS.md](./EUROPEAN_SCRAPERS.md) for detailed documentation about each scraper.
