/**
 * Scraper: Church of Greece (Ελληνική Ορθόδοξη Εκκλησία)
 * URL: https://www.ec-synod.gr/ (or via Metropolis listings)
 *
 * Strategy: Scrapes major Greek dioceses (Metropolitan areas).
 * Greece has well-organized church structures with Metropolites and Archbishops.
 * Major regions: Athens, Thessaloniki, Crete, Rhodes, Aegean Islands.
 *
 * Columns: name, jurisdiction, diocese, city, state, country,
 *          phone, website, lat, lng, address, clergy.
 */

const cheerio = require("cheerio");
const { fetchPage, fetchJSON, clean, writeCSV, writeJSON, sleep } = require("../utils");

const SOURCE_URL = "https://www.ec-synod.gr/";
const SOURCE_NAME = "church-of-greece";
const JURISDICTION = "Church of Greece (Ελληνική Ορθόδοξη Εκκλησία)";
const COUNTRY = "Greece";

const DIRECTORY_URLS = [
  "https://www.ec-synod.gr/",
  "https://www.ec-synod.gr/metropoleis/",
  "https://www.ec-synod.gr/metropolies/",
  "https://www.ec-synod.gr/page/parishes",
];

// Greek metropoleis (dioceses)
const METROPOLEIS = [
  "Metropoleis",
  "Metropolitan of Athens",
  "Metropolitan of Thessaloniki",
  "Metropolitan of Crete",
  "Metropolitan of Rhodes",
  "Metropolitan of Corfu",
  "Metropolitan of Patras",
];

// ── Main scraper function ──

async function scrape() {
  console.log(`[${SOURCE_NAME}] Scraping ${JURISDICTION}...`);
  let parishes = [];

  // Fetch main synod page
  try {
    console.log(`[${SOURCE_NAME}] Fetching main page...`);
    const html = await fetchPage(SOURCE_URL, 2);
    const $ = cheerio.load(html);

    // Look for metropolis links
    const metropolisLinks = [];
    $("a[href*='metropoli'], .metropolis-link, [data-metropolis]").each((_i, el) => {
      const href = $(el).attr("href") || "";
      const text = clean($(el).text());
      if (text && href && text.length > 3) {
        metropolisLinks.push({
          name: text,
          url: href.startsWith("http") ? href : (SOURCE_URL + href.replace(/^\//, "")),
        });
      }
    });

    console.log(`[${SOURCE_NAME}] Found ${metropolisLinks.length} metropolis links`);

    // Scrape each metropolis
    for (const metro of metropolisLinks.slice(0, 12)) {
      try {
        console.log(`[${SOURCE_NAME}] Scraping ${metro.name}...`);
        const html2 = await fetchPage(metro.url, 2);
        const $2 = cheerio.load(html2);
        const found = parseParishes($2, metro.name);
        console.log(`[${SOURCE_NAME}] Found ${found.length} parishes in ${metro.name}`);
        parishes.push(...found);
        await sleep(1000);
      } catch (err) {
        console.error(`[${SOURCE_NAME}] Error scraping ${metro.name}: ${err.message}`);
      }
    }

    // Also parse main page for churches
    const mainPageParishes = parseParishes($, "");
    if (mainPageParishes.length > 0) {
      console.log(`[${SOURCE_NAME}] Found ${mainPageParishes.length} parishes on main page`);
      parishes.push(...mainPageParishes);
    }

  } catch (err) {
    console.error(`[${SOURCE_NAME}] Error fetching main page: ${err.message}`);
  }

  // Try alternative directories
  if (parishes.length < 20) {
    for (const url of DIRECTORY_URLS.slice(1)) {
      try {
        console.log(`[${SOURCE_NAME}] Trying alternative URL: ${url}`);
        const html = await fetchPage(url, 2);
        const $ = cheerio.load(html);
        const found = parseParishes($, "");
        if (found.length > 0) {
          console.log(`[${SOURCE_NAME}] Found ${found.length} parishes from ${url}`);
          parishes.push(...found);
          if (parishes.length > 50) break;
        }
      } catch (err) {
        console.error(`[${SOURCE_NAME}] Error fetching ${url}: ${err.message}`);
      }
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

// ── Parse parishes from metropolis page ──

function parseParishes($, metropolis = "") {
  const parishes = [];

  // Pattern 1: Parish boxes/cards
  $(".parish, .church, .parochia, [data-parish], .church-item, .parish-card").each((_i, el) => {
    const $el = $(el);
    const name = clean($el.find(".name, .title, h3, h4, h2").text() || $el.text());
    if (!name || name.length < 3 || name.length > 200) return;

    const city = clean($el.find(".city, .location, .place").text());
    const address = clean($el.find(".address, .direction").text());
    const phone = clean($el.find(".phone, [data-phone]").text());
    const website = $el.find("a[href^='http']").attr("href") || "";

    parishes.push({
      source: SOURCE_NAME,
      name,
      jurisdiction: JURISDICTION,
      diocese: metropolis,
      city,
      state: "",
      country: COUNTRY,
      phone,
      address,
      clergy: "",
      website,
      lat: "",
      lng: "",
    });
  });

  // Pattern 2: Table rows (common in Greek Orthodox sites)
  $("table tr").each((_i, row) => {
    const cells = $(row).find("td");
    if (cells.length < 1) return;

    const name = clean($(cells[0]).text());
    const city = clean($(cells.length > 1 ? cells[1] : "").text());

    if (name && name.length > 3 && name.length < 200 && !name.toLowerCase().includes("name")) {
      parishes.push({
        source: SOURCE_NAME,
        name,
        jurisdiction: JURISDICTION,
        diocese: metropolis,
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

  // Pattern 3: List items with parish names and links
  $("li[data-parish], li.parish, .parish-list li").each((_i, el) => {
    const $el = $(el);
    const name = clean($el.find("a").first().text() || $el.text());
    if (name && name.length > 3 && name.length < 200) {
      const href = $el.find("a").attr("href") || "";
      parishes.push({
        source: SOURCE_NAME,
        name,
        jurisdiction: JURISDICTION,
        diocese: metropolis,
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
