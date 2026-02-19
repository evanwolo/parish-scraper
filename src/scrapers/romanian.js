/**
 * Scraper: Romanian Orthodox Archdiocese in the Americas (ROEA)
 * URL: https://www.roea.org/parishes
 *
 * Also tries the Romanian Orthodox Episcopate page patterns.
 *
 * Columns: name, jurisdiction, diocese, city, state, country,
 *          phone, website, lat, lng, address, clergy.
 */

const cheerio = require("cheerio");
const { fetchPage, fetchJSON, clean, writeCSV, writeJSON, sleep } = require("../utils");

const SOURCE_URL = "https://www.roea.org/parishes";
const SOURCE_NAME = "romanian";
const JURISDICTION = "Romanian Orthodox Archdiocese in the Americas";

const DIRECTORY_URLS = [
  "https://www.roea.org/parishes",
  "https://www.roea.org/parishes.html",
  "https://www.roea.org/church-directory",
  "https://www.roea.org/parish-directory",
  "https://roea.org/parishes",
  "https://www.romarch.org/parishes",
  "https://www.romarch.org/parish-directory",
];

// ── API ──

async function tryAPI() {
  const urls = [
    "https://www.roea.org/api/parishes",
    "https://www.roea.org/parishes.json",
    "https://www.roea.org/wp-json/wp/v2/parish?per_page=100",
  ];
  for (const url of urls) {
    try {
      const json = await fetchJSON(url);
      const arr = Array.isArray(json) ? json : (json?.parishes || json?.data || []);
      if (arr.length > 0) {
        console.log(`[${SOURCE_NAME}] Got ${arr.length} records from API: ${url}`);
        return arr.map(normaliseRecord);
      }
    } catch { /* silent */ }
  }
  return null;
}

function normaliseRecord(raw) {
  return {
    source: SOURCE_NAME,
    name: raw.name || raw.title?.rendered || raw.title || "",
    jurisdiction: JURISDICTION,
    diocese: raw.diocese || raw.deanery || "",
    city: raw.city || "",
    state: raw.state || "",
    country: raw.country || "USA",
    phone: raw.phone || raw.telephone || "",
    lat: raw.latitude || raw.lat || "",
    lng: raw.longitude || raw.lng || "",
    website: raw.website || raw.url || raw.link || "",
    address: raw.address || "",
    clergy: raw.clergy || raw.pastor || raw.priest || "",
  };
}

// ── HTML ──

function extractParishes($) {
  const parishes = [];

  const blockSelectors = [
    ".parish-listing", ".parish-item", ".parish-result", ".directory-item",
    ".views-row", ".card", ".sqs-block-content", ".entry-content li",
    "table tbody tr", ".col-item",
  ];

  for (const sel of blockSelectors) {
    $(sel).each((_i, el) => {
      const name = clean($(el).find("h2, h3, h4, h5, .title, .name, a, td:first-child").first().text());
      if (!name || name.length < 4) return;

      const record = {
        source: SOURCE_NAME,
        name,
        jurisdiction: JURISDICTION,
        country: "USA",
      };

      const loc = clean($(el).find(".location, .city-state, .address, td:nth-child(2)").first().text());
      if (loc) {
        const parts = loc.split(",").map(s => s.trim());
        record.city = parts[0] || "";
        record.state = (parts[1] || "").replace(/\d{5}.*/, "").trim();
      }

      record.phone = clean($(el).find(".phone, td:nth-child(3)").first().text());
      record.address = clean($(el).find(".address, .street").first().text());

      const href = $(el).find("a[href*='http']").attr("href") || "";
      if (href) record.website = href;

      const lat = $(el).attr("data-lat") || $(el).find("[data-lat]").attr("data-lat") || "";
      const lng = $(el).attr("data-lng") || $(el).find("[data-lng]").attr("data-lng") || "";
      if (lat) record.lat = lat;
      if (lng) record.lng = lng;

      parishes.push(record);
    });
    if (parishes.length > 0) return parishes;
  }

  // Embedded JSON fallback
  $("script").each((_i, el) => {
    const content = $(el).html() || "";
    const m = content.match(/(?:parishes|markers|locations|churches)\s*[:=]\s*(\[[\s\S]*?\]);/);
    if (m) {
      try {
        JSON.parse(m[1]).forEach(p => parishes.push(normaliseRecord(p)));
      } catch { /* ignore */ }
    }
  });

  return parishes;
}

// ── Main ──

async function scrape() {
  // Try API first
  let data = await tryAPI();
  if (data && data.length > 5) return data;

  // Try each directory URL
  for (const url of DIRECTORY_URLS) {
    try {
      const html = await fetchPage(url);
      const $ = cheerio.load(html);
      data = extractParishes($);
      if (data.length > 0) {
        console.log(`[${SOURCE_NAME}] Got ${data.length} parishes from ${url}`);
        return data;
      }
    } catch { /* try next */ }
    await sleep(500);
  }

  console.log(`[${SOURCE_NAME}] No parishes found from any URL.`);
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
  console.log(`[${SOURCE_NAME}] Wrote ${csvPath} (${data.length} records)`);
  console.log(`[${SOURCE_NAME}] Wrote ${jsonPath}`);
  return data;
}

module.exports = { scrape, run, SOURCE_NAME, SOURCE_URL };
