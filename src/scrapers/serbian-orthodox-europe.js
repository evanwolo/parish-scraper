/**
 * Scraper: Serbian Orthodox Church (Српска Православна Црква)
 * URL: https://www.spc.rs/
 *
 * Strategy: Scrapes the Serbian Orthodox Church main site.
 * Serbia has a strong Orthodox presence with detailed church registries.
 * Multiple dioceses: Raska-Prizren, Nis, Valjevo, Vranje, etc.
 *
 * Columns: name, jurisdiction, diocese, city, state, country,
 *          phone, website, lat, lng, address, clergy.
 */

const cheerio = require("cheerio");
const { fetchPage, fetchJSON, clean, writeCSV, writeJSON, sleep } = require("../utils");

const SOURCE_URL = "https://www.spc.rs/";
const SOURCE_NAME = "serbian-orthodox-europe";
const JURISDICTION = "Serbian Orthodox Church (Српска Православна Црква)";
const COUNTRY = "Serbia";

const DIRECTORY_URLS = [
  "https://www.spc.rs/",
  "https://www.spc.rs/en/about-us/diocesan-structure/",
  "https://www.spc.rs/en/church-directory/",
];

// Serbian dioceses
const DIOCESES_SR = [
  "Епархија Рашко-Призренска",
  "Епархија Нишка",
  "Епархија Валjevска",
  "Епархија Врањска",
  "Епархија Крушевачка",
  "Епархија Браничевска",
  "Епархија Смедеревска",
  "Епархија Бачка",
  "Епархија Темерин-Петроварадин",
];

// ── Main scraper function ──

async function scrape() {
  console.log(`[${SOURCE_NAME}] Scraping ${JURISDICTION}...`);
  let parishes = [];

  // Try main directory URLs
  for (const url of DIRECTORY_URLS) {
    try {
      console.log(`[${SOURCE_NAME}] Trying ${url}`);
      const html = await fetchPage(url, 2);
      const $ = cheerio.load(html);

      // Try to find diocesan links
      const dioceseLinks = extractDioceseLinks($);
      if (dioceseLinks.length > 0) {
        console.log(`[${SOURCE_NAME}] Found ${dioceseLinks.length} diocese links`);

        // Scrape each diocese
        for (const dioLink of dioceseLinks.slice(0, 8)) {
          try {
            const html2 = await fetchPage(dioLink.url, 2);
            const $2 = cheerio.load(html2);
            const found = parseChurchList($2, dioLink.name);
            console.log(`[${SOURCE_NAME}] Found ${found.length} churches in ${dioLink.name}`);
            parishes.push(...found);
            await sleep(800);
          } catch (err) {
            console.error(`[${SOURCE_NAME}] Error scraping ${dioLink.name}: ${err.message}`);
          }
        }
      }

      // Also try parsing main page directly
      const directParse = parseChurchList($, "");
      if (directParse.length > 0) {
        console.log(`[${SOURCE_NAME}] Found ${directParse.length} churches on main page`);
        parishes.push(...directParse);
      }

      if (parishes.length > 10) break; // Success, stop trying other URLs
    } catch (err) {
      console.error(`[${SOURCE_NAME}] Failed to fetch ${url}: ${err.message}`);
    }
  }

  // Deduplicate
  const uniqueParishes = deduplicateByName(parishes);
  console.log(`[${SOURCE_NAME}] Deduped to ${uniqueParishes.length} churches`);

  // Fetch details
  for (let i = 0; i < Math.min(uniqueParishes.length, 40); i++) {
    const parish = uniqueParishes[i];
    if (parish._detailUrl) {
      try {
        await fetchChurchDetail(parish);
      } catch (err) {
        console.error(`[${SOURCE_NAME}] Error fetching detail: ${err.message}`);
      }
    }
    if (i % 5 === 0) await sleep(500);
  }

  // Write outputs
  console.log(`[${SOURCE_NAME}] Writing ${uniqueParishes.length} churches to CSV/JSON...`);
  await writeCSV(uniqueParishes, SOURCE_NAME);
  await writeJSON(uniqueParishes, SOURCE_NAME);

  console.log(`[${SOURCE_NAME}] ✓ Scraped ${uniqueParishes.length} churches`);
  return uniqueParishes;
}

// ── Extract diocese links ──

function extractDioceseLinks($) {
  const links = [];

  // Pattern 1: Links with "eparhija", "diocese", etc.
  $("a[href*='eparhija'], a[href*='diocese'], .diocese-link").each((_i, el) => {
    const href = $(el).attr("href") || "";
    const text = clean($(el).text());
    if (text && href && text.length > 3) {
      const fullUrl = href.startsWith("http") ? href : (SOURCE_URL + href.replace(/^\//, ""));
      links.push({ name: text, url: fullUrl });
    }
  });

  // Pattern 2: Navigation menu items
  $("nav a, .menu a, .sidebar a").each((_i, el) => {
    const href = $(el).attr("href") || "";
    const text = clean($(el).text());
    if (text && href && (text.includes("епархија") || text.includes("епископ"))) {
      const fullUrl = href.startsWith("http") ? href : (SOURCE_URL + href.replace(/^\//, ""));
      if (!links.find(l => l.url === fullUrl)) {
        links.push({ name: text, url: fullUrl });
      }
    }
  });

  return links;
}

// ── Parse church list from page ──

function parseChurchList($, dioceseName = "") {
  const churches = [];

  // Pattern 1: Church/parish boxes
  $(".church, .parish, .monks, [data-church], .monastery, .convent").each((_i, el) => {
    const $el = $(el);
    const name = clean($el.find(".name, .title, h3, h4").text() || $el.text());
    if (!name || name.length < 3 || name.length > 200) return;

    const city = clean($el.find(".city, .location, .grad").text());
    const phone = clean($el.find(".phone, [data-phone]").text());
    const address = clean($el.find(".address, .adresa").text());

    churches.push({
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
  });

  // Pattern 2: Table rows
  $("table tr").each((_i, row) => {
    const cells = $(row).find("td");
    if (cells.length < 1) return;

    const name = clean($(cells[0]).text());
    const city = clean($(cells.length > 1 ? cells[1] : "").text());

    if (name && name.length > 3 && name.length < 200) {
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

  // Pattern 3: Links with church names
  $("a[href*='church'], a[href*='manastir'], .church-link").each((_i, el) => {
    const text = clean($(el).text());
    const href = $(el).attr("href") || "";
    if (text && text.length > 3 && text.length < 200) {
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

// ── Fetch detail page ──

async function fetchChurchDetail(parish) {
  if (!parish._detailUrl) return;
  try {
    const html = await fetchPage(parish._detailUrl, 1);
    const $ = cheerio.load(html);

    const phone = clean($("a[href^='tel:'], .phone").text());
    if (phone) parish.phone = phone.replace("tel:", "").trim();

    const address = clean($(".address, .adresa").text());
    if (address) parish.address = address;

    const clergy = clean($(".clergy, .priests, .епископ").text());
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
