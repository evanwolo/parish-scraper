/**
 * Scraper: Romanian Orthodox Church (Patriarhia Română)
 * URL: https://www.patriarhia.ro/
 *
 * Strategy: Scrapes the Romanian patriarchate site for diocesan structure
 * and parish listings. Romania has extensive Orthodox presence.
 *
 * Columns: name, jurisdiction, diocese, city, state, country,
 *          phone, website, lat, lng, address, clergy.
 */

const cheerio = require("cheerio");
const { fetchPage, fetchJSON, clean, writeCSV, writeJSON, sleep } = require("../utils");

const SOURCE_URL = "https://www.patriarhia.ro/";
const SOURCE_NAME = "romanian-orthodox-europe";
const JURISDICTION = "Romanian Orthodox Church (Patriarhia Română)";
const COUNTRY = "Romania";

const DIRECTORY_URLS = [
  "https://www.patriarhia.ro/",
  "https://www.patriarhia.ro/index.php/dieceze",
  "https://www.patriarhia.ro/index.php/biserici",
  "https://www.patriarhia.ro/index.php/parohii",
];

// Romanian dioceses (Mitropolitii)
const DIOCESES_RO = [
  "Mitropolia Munteniei și Dobrogei",
  "Mitropolia Moldovei și Sucevei",
  "Mitropolia Banatului",
  "Mitropolia Clujului, Maramureșului și Sălajului",
  "Mitropolia Argeșului și Muscelului",
  "Mitropolia Walachia (Alexandria)",
];

// ── Main scraper function ──

async function scrape() {
  console.log(`[${SOURCE_NAME}] Scraping ${JURISDICTION}...`);
  let parishes = [];

  // Fetch diocesan structure first
  try {
    const mainPage = await fetchPage(SOURCE_URL, 2);
    const $ = cheerio.load(mainPage);

    // Look for diocese listings
    const dioceses = [];
    $("a[href*='diecez'], .diocese, [data-diocese]").each((_i, el) => {
      const href = $(el).attr("href") || "";
      const text = clean($(el).text());
      if (text && href) {
        dioceses.push({ name: text, url: href });
      }
    });

    console.log(`[${SOURCE_NAME}] Found ${dioceses.length} dioceses`);

    // Scrape each diocese
    for (const diocese of dioceses.slice(0, 10)) {
      try {
        const dioUrl = diocese.url.startsWith("http") ? diocese.url : SOURCE_URL + diocese.url.replace(/^\//, "");
        console.log(`[${SOURCE_NAME}] Scraping diocese: ${diocese.name} from ${dioUrl}`);
        const html = await fetchPage(dioUrl, 1);
        const $dio = cheerio.load(html);

        // Parse parishes in this diocese
        const found = parseParishesFromDiocese($dio, diocese.name);
        console.log(`[${SOURCE_NAME}] Found ${found.length} parishes in ${diocese.name}`);
        parishes.push(...found);

        await sleep(1000);
      } catch (err) {
        console.error(`[${SOURCE_NAME}] Error scraping ${diocese.name}: ${err.message}`);
      }
    }
  } catch (err) {
    console.error(`[${SOURCE_NAME}] Error fetching main page: ${err.message}`);
  }

  // If no diocesan scrape, try main directory
  if (parishes.length === 0) {
    try {
      for (const url of DIRECTORY_URLS.slice(1)) {
        const html = await fetchPage(url, 2);
        const $ = cheerio.load(html);
        const found = parseParishList($);
        if (found.length > 0) {
          console.log(`[${SOURCE_NAME}] Found ${found.length} parishes from ${url}`);
          parishes.push(...found);
          break;
        }
      }
    } catch (err) {
      console.error(`[${SOURCE_NAME}] Error in fallback scrape: ${err.message}`);
    }
  }

  // Deduplicate
  const uniqueParishes = deduplicateByName(parishes);
  console.log(`[${SOURCE_NAME}] Deduped to ${uniqueParishes.length} parishes`);

  // Write outputs
  console.log(`[${SOURCE_NAME}] Writing ${uniqueParishes.length} parishes to CSV/JSON...`);
  await writeCSV(uniqueParishes, SOURCE_NAME);
  await writeJSON(uniqueParishes, SOURCE_NAME);

  console.log(`[${SOURCE_NAME}] ✓ Scraped ${uniqueParishes.length} parishes`);
  return uniqueParishes;
}

// ── Parse parishes from diocese page ──

function parseParishesFromDiocese($, dioceseName) {
  const parishes = [];

  // Pattern 1: Parish list items
  $(".parish, .parafia, [data-parish], .church-item, li[data-type='parish']").each((_i, el) => {
    const $el = $(el);
    const name = clean($el.find(".name, .title, h3, h4").text() || $el.text());
    if (!name || name.length < 3) return;

    const city = clean($el.find(".city, .location, .oras").text());
    const phone = clean($el.find(".phone, [data-phone]").text());
    const address = clean($el.find(".address, .adresa").text());

    if (name && name.length < 200) {
      parishes.push({
        source: SOURCE_NAME,
        name,
        jurisdiction: JURISDICTION,
        diocese: dioceseName,
        city,
        state: "",
        country: COUNTRY,
        phone,
        address,
        clergy: "",
        website: "",
        lat: "",
        lng: "",
      });
    }
  });

  // Pattern 2: Table rows
  $("table tr").each((_i, row) => {
    const cells = $(row).find("td");
    if (cells.length < 1) return;

    const name = clean($(cells[0]).text());
    const city = clean($(cells.length > 1 ? cells[1] : "").text());

    if (name && name.length > 3 && name.length < 200) {
      parishes.push({
        source: SOURCE_NAME,
        name,
        jurisdiction: JURISDICTION,
        diocese: dioceseName,
        city,
        state: "",
        country: COUNTRY,
        phone: "",
        address: "",
        clergy: "",
        website: "",
        lat: "",
        lng: "",
      });
    }
  });

  return parishes;
}

// ── Parse parish list from main directory ──

function parseParishList($) {
  const parishes = [];

  $(".parish, .parafia, [data-parish]").each((_i, el) => {
    const $el = $(el);
    const name = clean($el.find(".name, h3, h4").text() || $el.text());
    if (!name || name.length < 3) return;

    const city = clean($el.find(".city, .location").text());
    const diocese = clean($el.find(".diocese, .dieceza").text());

    if (name && name.length < 200) {
      parishes.push({
        source: SOURCE_NAME,
        name,
        jurisdiction: JURISDICTION,
        diocese,
        city,
        state: "",
        country: COUNTRY,
        phone: "",
        address: "",
        clergy: "",
        website: "",
        lat: "",
        lng: "",
      });
    }
  });

  return parishes;
}

// ── Deduplicate ──

function deduplicateByName(parishes) {
  const seen = new Set();
  return parishes.filter(p => {
    const key = `${p.name.toLowerCase()}|${p.city.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Export ──

module.exports = { scrape, SOURCE_NAME, SOURCE_URL };

// ── CLI ──

if (require.main === module) {
  scrape().catch(err => {
    console.error(`[${SOURCE_NAME}] Fatal error:`, err);
    process.exit(1);
  });
}
