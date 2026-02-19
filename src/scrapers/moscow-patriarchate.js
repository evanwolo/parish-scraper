/**
 * Scraper: Patriarchal Parishes of the Russian Orthodox Church (Moscow Patriarchate)
 * URL: http://www.patriarchia.ru/db/parishes/ (Russian)
 *       http://www.russianchurchusa.org/
 *
 * These are parishes under the Moscow Patriarchate in the USA, distinct from ROCOR.
 * Relatively small number (~20-30 parishes), mostly embassy churches and representation parishes.
 *
 * NOTE: This scraper is OPTIONAL. The Assembly of Bishops may not have complete
 * data for this jurisdiction. Implement only if a structured directory is found.
 *
 * Columns: name, jurisdiction, diocese, city, state, country,
 *          phone, website, lat, lng, address, clergy.
 */

const cheerio = require("cheerio");
const { fetchPage, fetchJSON, clean, writeCSV, writeJSON, sleep } = require("../utils");

const SOURCE_NAME = "moscow-patriarchate";
const JURISDICTION = "Patriarchal Parishes of the Russian Orthodox Church in the USA";

// Known potential URLs (need verification)
const DIRECTORY_URLS = [
  "http://www.russianchurchusa.org/parishes",
  "http://www.russianorthodoxchurch.ws/synod/parishes.html",
  "http://www.patriarchia.ru/db/parishes/",
];

async function scrape() {
  console.log(`[${SOURCE_NAME}] Searching for Moscow Patriarchate parish directory...`);
  
  // Try multiple directory URLs
  for (const url of DIRECTORY_URLS) {
    try {
      console.log(`[${SOURCE_NAME}] Trying ${url} ...`);
      const html = await fetchPage(url);
      const $ = cheerio.load(html);
      
      // Look for parish listings - structure will depend on actual site
      const parishes = [];
      
      // Strategy 1: Look for common list patterns
      $("div.parish, li.parish-item, tr.parish-row").each((_i, el) => {
        const name = clean($(el).find(".name, .parish-name, h3, h4").first().text());
        if (name) {
          parishes.push({
            source: SOURCE_NAME,
            name: name,
            jurisdiction: JURISDICTION,
            city: clean($(el).find(".city, .location").text()),
            state: clean($(el).find(".state").text()),
            country: "USA",
            phone: clean($(el).find(".phone, .telephone").text()),
            website: $(el).find("a[href]").attr("href") || "",
            address: clean($(el).find(".address").text()),
          });
        }
      });
      
      if (parishes.length > 0) {
        console.log(`[${SOURCE_NAME}] Found ${parishes.length} parishes from ${url}`);
        return parishes;
      }
      
    } catch (err) {
      console.log(`[${SOURCE_NAME}] ${url} - ${err.message}`);
      // Continue to next URL
    }
  }
  
  console.log(`[${SOURCE_NAME}] ⚠️  No structured directory found.`);
  console.log(`[${SOURCE_NAME}] Note: Moscow Patriarchate parishes (~20-30) are likely covered`);
  console.log(`[${SOURCE_NAME}]       by the Assembly of Bishops cross-reference data.`);
  return [];
}

async function run() {
  const data = await scrape();
  if (data.length === 0) {
    console.log(`[${SOURCE_NAME}] No data to write.`);
    return [];
  }
  const columns = [...new Set(data.flatMap(Object.keys))];
  const csvPath = await writeCSV(`${SOURCE_NAME}.csv`, data, columns);
  const jsonPath = writeJSON(`${SOURCE_NAME}.json`, data);
  console.log(`[${SOURCE_NAME}] Wrote ${csvPath}`);
  console.log(`[${SOURCE_NAME}] Wrote ${jsonPath}`);
  return data;
}

module.exports = { scrape, run, SOURCE_NAME };
