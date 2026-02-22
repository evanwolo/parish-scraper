/**
 * Scraper: Ukrainian Orthodox Church of Ukraine
 * URL: https://www.orthodoxua.org/ or https://www.uocmp.org/
 *
 * Strategy: Scrapes Ukrainian Orthodox Church directories.
 * Ukraine has multiple Orthodox jurisdictions (UOC, UAOC, UGCC).
 * Note: Political situation creates multiple competing hierarchies.
 *
 * Columns: name, jurisdiction, diocese, city, state, country,
 *          phone, website, lat, lng, address, clergy.
 */

const cheerio = require("cheerio");
const { fetchPage, fetchJSON, clean, writeCSV, writeJSON, sleep } = require("../utils");

const SOURCE_URL = "https://www.orthodoxua.org/";
const ALTERNATE_URL = "https://www.uocmp.org/";
const SOURCE_NAME = "ukrainian-orthodox-europe";
const JURISDICTION = "Ukrainian Orthodox Church";
const COUNTRY = "Ukraine";

const DIRECTORY_URLS = [
  "https://www.orthodoxua.org/",
  "https://www.uocmp.org/",
  "https://www.uocmp.org/uk/about-the-church/structure/",
  "https://www.orthodoxua.org/uk/parishes/",
];

// Ukrainian dioceses (Eparchies)
const DIOCESES_UA = [
  "Kyivska Metropoliya",
  "Kharkivska Eparhiya",
  "Donetska Eparhiya",
  "Luhanska Eparhiya",
  "Dnipropetrovska Eparhiya",
  "Zaporizka Eparhiya",
  "Mykolaivska Eparhiya",
  "Odaska Metropoliya",
  "Lvivska Eparhiya",
];

// ── Main scraper function ──

async function scrape() {
  console.log(`[${SOURCE_NAME}] Scraping ${JURISDICTION}...`);
  let parishes = [];

  const urls = [SOURCE_URL, ALTERNATE_URL, ...DIRECTORY_URLS];

  // Try to scrape from each source
  for (const baseUrl of urls) {
    try {
      console.log(`[${SOURCE_NAME}] Trying ${baseUrl}`);
      const html = await fetchPage(baseUrl, 2);
      const $ = cheerio.load(html);

      // Look for diocese/eparchy links
      const diocesesLinks = extractDioceseLinks($);
      if (diocesesLinks.length > 0) {
        console.log(`[${SOURCE_NAME}] Found ${diocesesLinks.length} diocese links`);

        // Scrape each diocese
        for (const diocese of diocesesLinks.slice(0, 10)) {
          try {
            const html2 = await fetchPage(diocese.url, 2);
            const $2 = cheerio.load(html2);
            const found = parseParishList($2, diocese.name);
            console.log(`[${SOURCE_NAME}] Found ${found.length} parishes in ${diocese.name}`);
            parishes.push(...found);
            await sleep(800);
          } catch (err) {
            console.error(`[${SOURCE_NAME}] Error scraping ${diocese.name}: ${err.message}`);
          }
        }
      }

      // Parse main page directly
      const mainPageParishes = parseParishList($, "");
      if (mainPageParishes.length > 0) {
        console.log(`[${SOURCE_NAME}] Found ${mainPageParishes.length} parishes on main page`);
        parishes.push(...mainPageParishes);
      }

      if (parishes.length > 20) break; // Success
    } catch (err) {
      console.error(`[${SOURCE_NAME}] Failed to fetch ${baseUrl}: ${err.message}`);
    }
  }

  // Deduplicate
  const uniqueParishes = deduplicateByName(parishes);
  console.log(`[${SOURCE_NAME}] Deduped to ${uniqueParishes.length} parishes`);

  // Fetch details from a sample
  for (let i = 0; i < Math.min(uniqueParishes.length, 30); i++) {
    const parish = uniqueParishes[i];
    if (parish._detailUrl) {
      try {
        await fetchParishDetail(parish);
      } catch (err) {
        console.error(`[${SOURCE_NAME}] Error fetching detail: ${err.message}`);
      }
    }
    if (i % 4 === 0) await sleep(400);
  }

  // Write outputs
  console.log(`[${SOURCE_NAME}] Writing ${uniqueParishes.length} parishes to CSV/JSON...`);
  await writeCSV(uniqueParishes, SOURCE_NAME);
  await writeJSON(uniqueParishes, SOURCE_NAME);

  console.log(`[${SOURCE_NAME}] ✓ Scraped ${uniqueParishes.length} parishes`);
  return uniqueParishes;
}

// ── Extract diocese/eparchy links ──

function extractDioceseLinks($) {
  const links = [];

  // Pattern 1: Eparchy/Diocese navigation links
  $("a[href*='eparhiya'], a[href*='diocese'], a[href*='metropoliya'], .eparchy-link, [data-eparchy]").each((_i, el) => {
    const href = $(el).attr("href") || "";
    const text = clean($(el).text());
    if (text && href && text.length > 3 && !text.toLowerCase().includes("all")) {
      links.push({ name: text, url: href.startsWith("http") ? href : (SOURCE_URL + href.replace(/^\//, "")) });
    }
  });

  // Pattern 2: Navigation menu
  $("nav a, .menu a, .sidebar a").each((_i, el) => {
    const href = $(el).attr("href") || "";
    const text = clean($(el).text());
    if (text && href && (text.includes("епархія") || text.includes("метрополія") || text.includes("diocese"))) {
      const url = href.startsWith("http") ? href : (SOURCE_URL + href.replace(/^\//, ""));
      if (!links.find(l => l.url === url)) {
        links.push({ name: text, url });
      }
    }
  });

  return links;
}

// ── Parse parish list ──

function parseParishList($, dioceseName = "") {
  const parishes = [];

  // Pattern 1: Parish/church divs
  $(".parish, .church, .monastery, [data-parish], .church-item, .parafia").each((_i, el) => {
    const $el = $(el);
    const name = clean($el.find(".name, .title, h3, h4").text() || $el.text());
    if (!name || name.length < 3 || name.length > 250) return;

    const city = clean($el.find(".city, .location, .misto").text());
    const phone = clean($el.find(".phone, [data-phone], a[href^='tel:']").text());
    const address = clean($el.find(".address, .adresa").text());

    parishes.push({
      source: SOURCE_NAME,
      name,
      jurisdiction: JURISDICTION,
      diocese: dioceseName,
      city,
      state: "",
      country: COUNTRY,
      phone: phone.replace("tel:", ""),
      address,
      clergy: "",
      website: "",
      lat: "",
      lng: "",
    });
  });

  // Pattern 2: Table rows
  $("table tr").each((_i, row) => {
    const cells = $(row).find("td");
    if (cells.length < 1) return;

    const name = clean($(cells[0]).text());
    const city = clean($(cells.length > 1 ? cells[1] : "").text());

    if (name && name.length > 3 && name.length < 250) {
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

  // Pattern 3: Links
  $("a[href*='parish'], a[href*='church'], .parish-link").each((_i, el) => {
    const text = clean($(el).text());
    const href = $(el).attr("href") || "";
    if (text && text.length > 3 && text.length < 250) {
      parishes.push({
        source: SOURCE_NAME,
        name: text,
        jurisdiction: JURISDICTION,
        diocese: dioceseName,
        city: "",
        state: "",
        country: COUNTRY,
        phone: "",
        address: "",
        clergy: "",
        website: href.startsWith("http") ? href : "",
        lat: "",
        lng: "",
      });
    }
  });

  return parishes;
}

// ── Fetch parish detail page ──

async function fetchParishDetail(parish) {
  if (!parish._detailUrl) return;
  try {
    const html = await fetchPage(parish._detailUrl, 1);
    const $ = cheerio.load(html);

    const phone = clean($("a[href^='tel:'], .phone").text());
    if (phone) parish.phone = phone.replace("tel:", "").trim();

    const address = clean($(".address, .adresa").text());
    if (address) parish.address = address;

    const clergy = clean($(".clergy, .priests, .dukhovnyky").text());
    if (clergy) parish.clergy = clergy;

  } catch (err) {
    // Silent fail
  }
}

// ── Deduplicate ──

function deduplicateByName(parishes) {
  const seen = new Set();
  return parishes.filter(p => {
    const key = p.name.toLowerCase();
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
