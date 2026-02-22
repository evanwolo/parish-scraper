/**
 * Scraper: Russian Orthodox Church (Русская Православная Церковь)
 * URL: https://www.patriarchia.ru/
 *
 * Strategy: Scrapes Russian Orthodox Church (Moscow Patriarchate) directory.
 * Primarily covers Russia but also includes diaspora branches.
 * Extensive monastery and cathedral listings.
 *
 * Columns: name, jurisdiction, diocese, city, state, country,
 *          phone, website, lat, lng, address, clergy.
 */

const cheerio = require("cheerio");
const { fetchPage, fetchJSON, clean, writeCSV, writeJSON, sleep } = require("../utils");

const SOURCE_URL = "https://www.patriarchia.ru/";
const SOURCE_NAME = "russian-orthodox-europe";
const JURISDICTION = "Russian Orthodox Church (Moscow Patriarchate)";
const COUNTRY = "Russia";

const DIRECTORY_URLS = [
  "https://www.patriarchia.ru/",
  "https://www.patriarchia.ru/ru/church/",
  "https://www.patriarchia.ru/en/church/",
  "https://www.patriarchia.ru/ru/monasteries/",
];

// ── Main scraper function ──

async function scrape() {
  console.log(`[${SOURCE_NAME}] Scraping ${JURISDICTION}...`);
  let parishes = [];

  // Try main pages
  for (const url of DIRECTORY_URLS) {
    try {
      console.log(`[${SOURCE_NAME}] Trying ${url}`);
      const html = await fetchPage(url, 2);
      const $ = cheerio.load(html);

      // Look for diocesan/eparchial links
      const dioceseLinks = extractDioceseLinks($);
      if (dioceseLinks.length > 0) {
        console.log(`[${SOURCE_NAME}] Found ${dioceseLinks.length} dioceses`);

        // Scrape each diocese
        for (const diocese of dioceseLinks.slice(0, 8)) {
          try {
            console.log(`[${SOURCE_NAME}] Scraping ${diocese.name}...`);
            const html2 = await fetchPage(diocese.url, 2);
            const $2 = cheerio.load(html2);
            const found = parseChurches($2, diocese.name);
            console.log(`[${SOURCE_NAME}] Found ${found.length} churches in ${diocese.name}`);
            parishes.push(...found);
            await sleep(1000);
          } catch (err) {
            console.error(`[${SOURCE_NAME}] Error scraping ${diocese.name}: ${err.message}`);
          }
        }
      }

      // Parse main page
      const mainPageChurches = parseChurches($, "");
      if (mainPageChurches.length > 0) {
        console.log(`[${SOURCE_NAME}] Found ${mainPageChurches.length} churches on main page`);
        parishes.push(...mainPageChurches);
      }

      if (parishes.length > 15) break;
    } catch (err) {
      console.error(`[${SOURCE_NAME}] Failed to fetch ${url}: ${err.message}`);
    }
  }

  // Deduplicate
  const uniqueParishes = deduplicateByName(parishes);
  console.log(`[${SOURCE_NAME}] Deduped to ${uniqueParishes.length} churches`);

  // Fetch details
  for (let i = 0; i < Math.min(uniqueParishes.length, 35); i++) {
    const parish = uniqueParishes[i];
    if (parish._detailUrl) {
      try {
        await fetchChurchDetail(parish);
      } catch (err) {
        console.error(`[${SOURCE_NAME}] Error fetching detail: ${err.message}`);
      }
    }
    if (i % 5 === 0) await sleep(600);
  }

  // Write outputs
  console.log(`[${SOURCE_NAME}] Writing ${uniqueParishes.length} churches to CSV/JSON...`);
  await writeCSV(uniqueParishes, SOURCE_NAME);
  await writeJSON(uniqueParishes, SOURCE_NAME);

  console.log(`[${SOURCE_NAME}] ✓ Scraped ${uniqueParishes.length} churches`);
  return uniqueParishes;
}

// ── Extract diocese/eparchy links ──

function extractDioceseLinks($) {
  const links = [];

  // Pattern 1: Diocesan links
  $("a[href*='eparchiya'], a[href*='diocese'], a[href*='mitropoly'], [data-diocese], .diocese-link").each((_i, el) => {
    const href = $(el).attr("href") || "";
    const text = clean($(el).text());
    if (text && href && text.length > 3) {
      links.push({
        name: text,
        url: href.startsWith("http") ? href : (SOURCE_URL + href.replace(/^\//, "")),
      });
    }
  });

  // Pattern 2: Navigation links containing "епархия", "митрополия"
  $("a, nav a, .menu a").each((_i, el) => {
    const href = $(el).attr("href") || "";
    const text = clean($(el).text());
    if (text && href && (text.includes("епархия") || text.includes("митрополия"))) {
      links.push({
        name: text,
        url: href.startsWith("http") ? href : (SOURCE_URL + href.replace(/^\//, "")),
      });
    }
  });

  // Remove duplicates
  const seen = new Set();
  return links.filter(l => {
    const key = l.url.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Parse churches from page ──

function parseChurches($, dioceseName = "") {
  const churches = [];

  // Pattern 1: Church/monastery divs
  $(".church, .monastery, .cathedral, [data-church], .convent, .chapel").each((_i, el) => {
    const $el = $(el);
    const name = clean($el.find(".name, .title, h3, h4, .church-name").text() || $el.text());
    if (!name || name.length < 3 || name.length > 250) return;

    const city = clean($el.find(".city, .location, .город").text());
    const phone = clean($el.find(".phone, [data-phone], a[href^='tel:']").text());
    const address = clean($el.find(".address, .адрес").text());

    churches.push({
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
      churches.push({
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
  $("a[href*='church'], a[href*='monastery'], a[href*='cathedral'], .church-link").each((_i, el) => {
    const text = clean($(el).text());
    const href = $(el).attr("href") || "";
    if (text && text.length > 3 && text.length < 250) {
      churches.push({
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

  return churches;
}

// ── Fetch church detail page ──

async function fetchChurchDetail(parish) {
  if (!parish._detailUrl) return;
  try {
    const html = await fetchPage(parish._detailUrl, 1);
    const $ = cheerio.load(html);

    const phone = clean($("a[href^='tel:'], .phone").text());
    if (phone) parish.phone = phone.replace("tel:", "").trim();

    const address = clean($(".address, .адрес").text());
    if (address) parish.address = address;

    const clergy = clean($(".clergy, .priests, .духовенство").text());
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
