/**
 * Scraper: Assembly of Canonical Orthodox Bishops – Parish Directory
 * URL: https://www.assemblyofbishops.org/directories/parishes
 *
 * Scrapes ALL member jurisdictions by iterating over known jurisdiction codes.
 * Two strategies per jurisdiction:
 *   1. Hit possible JSON/AJAX API endpoints.
 *   2. Parse the server-rendered HTML.
 *
 * Each record includes: name, jurisdiction, state, city, phone, lat, lng.
 */

const cheerio = require("cheerio");
const { fetchPage, fetchJSON, clean, writeCSV, writeJSON, sleep } = require("../utils");

const SOURCE_URL =
  "https://www.assemblyofbishops.org/directories/parishes";
const SOURCE_NAME = "assembly-of-bishops";

// ── All Assembly jurisdiction codes and their canonical names ──
const JURISDICTION_CODES = {
  goa:  "Greek Orthodox Archdiocese of America",
  aoca: "Antiochian Orthodox Christian Archdiocese of North America",
  oca:  "Orthodox Church in America (OCA)",
  roc:  "Russian Orthodox Church Outside of Russia (ROCOR)",
  srb:  "Serbian Orthodox Church in North and South America",
  rom:  "Romanian Orthodox Archdiocese in the Americas",
  bul:  "Bulgarian Eastern Orthodox Diocese of the USA, Canada, and Australia",
  acrod:"American Carpatho-Russian Orthodox Diocese",
  uoc:  "Ukrainian Orthodox Church of the USA (UOC-USA)",
  alb:  "Albanian Orthodox Diocese of America",
  mp:   "Patriarchal Parishes of the Russian Orthodox Church in the USA",
  geo:  "Georgian Orthodox Church",
};

// ── API + HTML helpers per jurisdiction ──

function apiCandidates(jurCode) {
  return [
    `https://www.assemblyofbishops.org/api/parishes?jur=${jurCode}`,
    `https://www.assemblyofbishops.org/directories/parishes.json?jur=${jurCode}&searchType=jurisdiction`,
    `https://www.assemblyofbishops.org/wp-json/parishes?jur=${jurCode}`,
  ];
}

function normaliseAPIRecord(raw, jurCode) {
  return {
    source: SOURCE_NAME,
    name: raw.name || raw.title || raw.parish_name || "",
    jurisdiction: raw.jurisdiction || raw.jur || JURISDICTION_CODES[jurCode] || jurCode,
    city: raw.city || "",
    state: raw.state || raw.province || "",
    country: raw.country || "USA",
    phone: raw.phone || raw.telephone || "",
    lat: raw.lat || raw.latitude || "",
    lng: raw.lng || raw.longitude || "",
    website: raw.website || raw.url || "",
    address: raw.address || "",
  };
}

async function tryAPIForJur(jurCode) {
  for (const url of apiCandidates(jurCode)) {
    try {
      const json = await fetchJSON(url);
      if (Array.isArray(json) && json.length > 0) {
        console.log(`[${SOURCE_NAME}] Got ${json.length} records from API (${jurCode}): ${url}`);
        return json.map((p) => normaliseAPIRecord(p, jurCode));
      }
      if (json && json.data && Array.isArray(json.data)) {
        console.log(`[${SOURCE_NAME}] Got ${json.data.length} records from API (${jurCode}): ${url}`);
        return json.data.map((p) => normaliseAPIRecord(p, jurCode));
      }
    } catch {
      // silent – try next
    }
  }
  return null;
}

async function scrapeHTMLForJur(jurCode) {
  const url = `${SOURCE_URL}?jur=${jurCode}&searchType=jurisdiction`;
  console.log(`[${SOURCE_NAME}] Fetching HTML for ${jurCode}: ${url} …`);
  let html;
  try { html = await fetchPage(url); } catch (err) {
    console.error(`[${SOURCE_NAME}] Failed to fetch HTML for ${jurCode}: ${err.message}`);
    return [];
  }
  const $ = cheerio.load(html);

  const parishes = [];
  const defaultJur = JURISDICTION_CODES[jurCode] || jurCode;

  // ── Primary strategy: div.output_parish blocks ──
  $("div.output_parish").each((_i, el) => {
    const name = clean($(el).find(".parish_title").text());
    if (!name) return;

    const record = {
      source: SOURCE_NAME,
      name,
      jurisdiction: clean($(el).find(".parish_jurisdiction").text()) || defaultJur,
      jurisdictionCode: clean($(el).find(".parish_jurcode").text()) || jurCode,
      city: clean($(el).find(".parish_city").text()),
      state: clean($(el).find(".parish_state").text()),
      country: "USA",
      zip: clean($(el).find(".parish_zip").text()),
      lat: clean($(el).find(".parish_latitude").text()),
      lng: clean($(el).find(".parish_longitude").text()),
      geocodeType: clean($(el).find(".parish_geocode").text()),
      phone: clean($(el).find(".parish_phone").text()),
      website: clean($(el).find(".parish_website a").attr("href") || ""),
      address: clean($(el).find(".parish_address").text()),
    };

    if (!record.phone) {
      const moreInfo = $(el).find(".parish_more_info, .more-info");
      const phoneMatch = moreInfo.text().match(
        /(?:phone|tel)[:\s]*([\d\-().+\s]{7,})/i
      );
      if (phoneMatch) record.phone = clean(phoneMatch[1]);
    }

    parishes.push(record);
  });

  if (parishes.length > 0) {
    console.log(`[${SOURCE_NAME}] Extracted ${parishes.length} parishes for ${jurCode} from div.output_parish.`);
    return parishes;
  }

  // ── Fallback 1: generic block selectors ──
  const blockSelectors = [
    ".parish-result", ".views-row", ".parish-item", ".directory-item",
    ".result-item", "table tbody tr", ".card",
  ];

  for (const sel of blockSelectors) {
    $(sel).each((_i, el) => {
      const name = clean(
        $(el).find("h2, h3, h4, .title, .name, .parish-name, td:first-child").first().text()
      );
      if (!name) return;
      const record = { source: SOURCE_NAME, name, jurisdiction: defaultJur };

      const location = clean(
        $(el).find(".location, .city-state, .address, td:nth-child(2)").first().text()
      );
      if (location) {
        const parts = location.split(",").map((s) => s.trim());
        record.city = parts[0] || "";
        record.state = parts[1] || "";
      }

      const lat = $(el).attr("data-lat") || $(el).find("[data-lat]").attr("data-lat") || "";
      const lng = $(el).attr("data-lng") || $(el).find("[data-lng]").attr("data-lng") || "";
      if (lat) record.lat = lat;
      if (lng) record.lng = lng;

      parishes.push(record);
    });
    if (parishes.length > 0) break;
  }

  // ── Fallback 2: embedded JSON ──
  if (parishes.length === 0) {
    $("script").each((_i, el) => {
      const content = $(el).html() || "";
      const match = content.match(
        /(?:parishes|markers|locations|directory)\s*[:=]\s*(\[[\s\S]*?\]);/
      );
      if (match) {
        try {
          JSON.parse(match[1]).forEach((p) => parishes.push(normaliseAPIRecord(p, jurCode)));
        } catch { /* ignore */ }
      }
    });
  }

  return parishes;
}

// ── Main scrape: iterate all jurisdictions ──

async function scrape() {
  const allParishes = [];
  const jurCodes = Object.keys(JURISDICTION_CODES);

  console.log(`[${SOURCE_NAME}] Scraping ${jurCodes.length} jurisdictions: ${jurCodes.join(", ")} …`);

  for (const jur of jurCodes) {
    // Try API first, fall back to HTML
    let data = await tryAPIForJur(jur);
    if (!data || data.length === 0) {
      data = await scrapeHTMLForJur(jur);
    }
    console.log(`[${SOURCE_NAME}]   ${jur}: ${data.length} parish(es)`);
    allParishes.push(...data);
    await sleep(800); // polite delay between jurisdictions
  }

  console.log(`[${SOURCE_NAME}] Total: ${allParishes.length} parish(es) across all jurisdictions.`);
  return allParishes;
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

module.exports = { scrape, run, SOURCE_NAME, SOURCE_URL };
