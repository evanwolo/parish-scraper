/**
 * Scraper: Polish Orthodox Church (Warszawska Episkopatura Polska)
 * URL: https://www.orthodox.pl/
 *
 * Strategy: Fetch both the main site and the parish PDF directory.
 * The church provides a structured list of Orthodox parishes across Poland.
 * Dioceses: Warsaw, Białystok, and other administrative divisions.
 *
 * Columns: name, jurisdiction, diocese, city, state, country,
 *          phone, website, lat, lng, address, clergy.
 */

const cheerio = require("cheerio");
const { fetchPage, fetchJSON, clean, writeCSV, writeJSON, sleep } = require("../utils");

const SOURCE_URL = "https://www.orthodox.pl/";
const SOURCE_NAME = "warsaw-orthodox";
const JURISDICTION = "Polish Orthodox Church";
const COUNTRY = "Poland";

const DIRECTORY_URLS = [
  "https://www.orthodox.pl/parafie",
  "https://www.orthodox.pl/parishes",
  "https://www.orthodox.pl/directory",
  "https://www.orthodox.pl/",
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

      // Strategy 1: Look for parish list elements
      const found = parseParishLists($);
      if (found.length > 0) {
        console.log(`[${SOURCE_NAME}] Found ${found.length} parishes from ${url}`);
        parishes.push(...found);
        break;
      }
    } catch (err) {
      console.error(`[${SOURCE_NAME}] Failed to fetch ${url}: ${err.message}`);
    }
  }

  // Deduplicate by name
  const uniqueParishes = deduplicateByName(parishes);
  console.log(`[${SOURCE_NAME}] Deduped to ${uniqueParishes.length} parishes`);

  // Fetch detail pages where available
  for (let i = 0; i < Math.min(uniqueParishes.length, 50); i++) {
    const parish = uniqueParishes[i];
    if (parish._detailUrl) {
      try {
        await fetchParishDetail(parish);
      } catch (err) {
        console.error(`[${SOURCE_NAME}] Error fetching detail for ${parish.name}: ${err.message}`);
      }
    }
    if (i % 5 === 0) await sleep(500);
  }

  // Write outputs
  console.log(`[${SOURCE_NAME}] Writing ${uniqueParishes.length} parishes to CSV/JSON...`);
  await writeCSV(uniqueParishes, SOURCE_NAME);
  await writeJSON(uniqueParishes, SOURCE_NAME);

  console.log(`[${SOURCE_NAME}] ✓ Scraped ${uniqueParishes.length} parishes`);
  return uniqueParishes;
}

// ── Parse parish lists from directory page ──

function parseParishLists($) {
  const parishes = [];

  // Look for common parish list patterns
  // Pattern 1: <div class="parish"> or <li class="parish">
  $(".parish, .parafia, [data-parish], .church-item").each((_i, el) => {
    const $el = $(el);
    const name = clean($el.find(".name, .title, h3, h4").text() || $el.text());
    if (!name || name.length < 3) return;

    const city = clean($el.find(".city, .location, .place").text());
    const diocese = clean($el.find(".diocese, .diecezja").text());
    const phone = clean($el.find(".phone, [data-phone]").text());
    const website = $el.find("a[href^='http']").attr("href") || "";

    if (name && name.length > 3) {
      parishes.push({
        source: SOURCE_NAME,
        name: name.substring(0, 200),
        jurisdiction: JURISDICTION,
        diocese,
        city,
        state: "",
        country: COUNTRY,
        phone,
        address: "",
        clergy: "",
        website,
        lat: "",
        lng: "",
      });
    }
  });

  // Pattern 2: Table rows with parish data
  $("table tbody tr").each((_i, row) => {
    const cells = $(row).find("td");
    if (cells.length < 2) return;

    const name = clean($(cells[0]).text());
    const city = clean($(cells.length > 1 ? cells[1] : cells[0]).text());
    const diocese = clean($(cells.length > 2 ? cells[2] : "").text());

    if (name && name.length > 3) {
      parishes.push({
        source: SOURCE_NAME,
        name: name.substring(0, 200),
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

// ── Fetch detail page for a single parish ──

async function fetchParishDetail(parish) {
  if (!parish._detailUrl) return;
  try {
    const html = await fetchPage(parish._detailUrl, 1);
    const $ = cheerio.load(html);

    // Extract address
    const address = clean($(".address, .location, [data-address]").text());
    if (address) parish.address = address;

    // Extract phone
    const phone = clean($(".phone, [data-phone], a[href^='tel:']").text());
    if (phone) parish.phone = phone.replace("tel:", "").trim();

    // Extract clergy
    const clergy = clean($(".clergy, .priests, .bishop").text());
    if (clergy) parish.clergy = clergy;

    // Look for external website
    const links = $("a[href^='http']").map((_i, el) => $(el).attr("href")).get();
    const externalLink = links.find(l => !l.includes("orthodox.pl"));
    if (externalLink) parish.website = externalLink;

  } catch (err) {
    // Silent fail for detail pages
  }
}

// ── Deduplicate parishes by name ──

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
