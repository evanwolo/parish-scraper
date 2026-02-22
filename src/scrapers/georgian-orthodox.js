/**
 * Scraper: Georgian Apostolic Orthodox Church (საქართველოს კანონიკური მართლმადიდებელი ეკლესია)
 * URL: https://www.georgian-church.org/ (or patriarchate.ge)
 *
 * Strategy: Georgian Orthodox Church is mostly hierarchical and centralized.
 * Scrapes diocese listings and cross-references with Google data.
 * Major dioceses: Tbilisi Metropolitan, Batumi, Zugdidi, Zugdidi-Gonio.
 *
 * Columns: name, jurisdiction, diocese, city, state, country,
 *          phone, website, lat, lng, address, clergy.
 */

const cheerio = require("cheerio");
const { fetchPage, fetchJSON, clean, writeCSV, writeJSON, sleep } = require("../utils");

const SOURCE_URL = "https://www.georgian-church.org/";
const SOURCE_NAME = "georgian-orthodox";
const JURISDICTION = "Georgian Apostolic Orthodox Church";
const COUNTRY = "Georgia";

const DIRECTORY_URLS = [
  "https://www.georgian-church.org/",
  "https://www.patriarchate.ge/",
  "https://www.georgian-church.org/en/churches/",
  "https://www.patriarchate.ge/2010-12-18-11-28-05/",
];

// Georgian cities and diocesan regions
const DIOCESES = [
  "Tbilisi Metropolitan",
  "Batumi",
  "Zugdidi",
  "Telavi",
  "Kutaisi",
  "Gonio",
  "Bolnisi",
];

const MAJOR_CITIES = [
  "Tbilisi",
  "Batumi",
  "Zugdidi",
  "Telavi",
  "Kutaisi",
  "Gori",
  "Zugdidi",
  "Tskhinvali",
];

// ── Main scraper function ──

async function scrape() {
  console.log(`[${SOURCE_NAME}] Scraping ${JURISDICTION}...`);
  let parishes = [];

  // Try each directory URL
  for (const url of DIRECTORY_URLS) {
    try {
      console.log(`[${SOURCE_NAME}] Trying ${url}`);
      const html = await fetchPage(url, 2);
      const $ = cheerio.load(html);

      // Strategy 1: Parse embedded church lists
      const found = parseChurchLists($);
      if (found.length > 0) {
        console.log(`[${SOURCE_NAME}] Found ${found.length} churches from ${url}`);
        parishes.push(...found);
      }

      // Strategy 2: Extract from links
      const fromLinks = extractFromLinks($);
      if (fromLinks.length > 0) {
        console.log(`[${SOURCE_NAME}] Found ${fromLinks.length} churches from links`);
        parishes.push(...fromLinks);
      }
    } catch (err) {
      console.error(`[${SOURCE_NAME}] Failed to fetch ${url}: ${err.message}`);
    }
  }

  // Deduplicate
  const uniqueParishes = deduplicateByName(parishes);
  console.log(`[${SOURCE_NAME}] Deduped to ${uniqueParishes.length} churches`);

  // Fetch additional details
  for (let i = 0; i < Math.min(uniqueParishes.length, 30); i++) {
    const parish = uniqueParishes[i];
    if (parish._detailUrl) {
      try {
        await fetchChurchDetail(parish);
      } catch (err) {
        console.error(`[${SOURCE_NAME}] Error fetching detail for ${parish.name}: ${err.message}`);
      }
    }
    if (i % 3 === 0) await sleep(300);
  }

  // Write outputs
  console.log(`[${SOURCE_NAME}] Writing ${uniqueParishes.length} churches to CSV/JSON...`);
  await writeCSV(uniqueParishes, SOURCE_NAME);
  await writeJSON(uniqueParishes, SOURCE_NAME);

  console.log(`[${SOURCE_NAME}] ✓ Scraped ${uniqueParishes.length} churches`);
  return uniqueParishes;
}

// ── Parse church lists ──

function parseChurchLists($) {
  const churches = [];

  // Pattern 1: Church boxes or cards
  $(".church, .monastery, .chapel, .shrine, [data-church], .church-item").each((_i, el) => {
    const $el = $(el);
    const name = clean($el.find(".name, .title, h3, h4, h2").text() || $el.text());
    if (!name || name.length < 3) return;

    const city = clean($el.find(".city, .location").text());
    const diocese = clean($el.find(".diocese, .region").text());
    const phone = clean($el.find(".phone, [data-phone]").text());
    const address = clean($el.find(".address, [data-address]").text());

    if (name && name.length < 200) {
      churches.push({
        source: SOURCE_NAME,
        name,
        jurisdiction: JURISDICTION,
        diocese,
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
  $("table tbody tr").each((_i, row) => {
    const cells = $(row).find("td");
    if (cells.length < 1) return;

    const name = clean($(cells[0]).text());
    const city = clean($(cells.length > 1 ? cells[1] : "").text());
    const diocese = clean($(cells.length > 2 ? cells[2] : "").text());

    if (name && name.length > 3 && name.length < 200) {
      churches.push({
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

  return churches;
}

// ── Extract churches from links ──

function extractFromLinks($) {
  const churches = [];

  $("a[href*='church'], a[href*='monastery'], a[href*='parish']").each((_i, el) => {
    const $el = $(el);
    const name = clean($el.text());
    if (name && name.length > 3 && name.length < 200) {
      const href = $el.attr("href") || "";
      churches.push({
        source: SOURCE_NAME,
        name,
        jurisdiction: JURISDICTION,
        diocese: "",
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

  return churches;
}

// ── Fetch detail page ──

async function fetchChurchDetail(parish) {
  if (!parish._detailUrl) return;
  try {
    const html = await fetchPage(parish._detailUrl, 1);
    const $ = cheerio.load(html);

    // Extract contact info
    const phone = clean($("a[href^='tel:'], .phone").text());
    if (phone) parish.phone = phone.replace("tel:", "").trim();

    const address = clean($(".address, [data-address]").text());
    if (address) parish.address = address;

    const clergy = clean($(".clergy, .bishop, .priest").text());
    if (clergy) parish.clergy = clergy;

  } catch (err) {
    // Silent fail
  }
}

// ── Deduplicate ──

function deduplicateByName(churches) {
  const seen = new Set();
  return churches.filter(c => {
    const key = c.name.toLowerCase();
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
