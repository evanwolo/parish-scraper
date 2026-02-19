/**
 * Scraper: Antiochian Orthodox Christian Archdiocese of North America (AOCA)
 * URL: https://www.antiochian.org/parishes
 *
 * Strategies:
 *   1. Try the Antiochian parish directory API / search endpoints.
 *   2. Scrape the parish listing HTML pages by diocese.
 *   3. Parse detail pages for richer data.
 *
 * Columns: name, jurisdiction, diocese, city, state, country,
 *          phone, website, lat, lng, address, clergy.
 */

const cheerio = require("cheerio");
const { fetchPage, fetchJSON, clean, writeCSV, writeJSON, sleep } = require("../utils");

const SOURCE_URL = "https://www.antiochian.org/parishes";
const SOURCE_NAME = "antiochian";
const JURISDICTION = "Antiochian Orthodox Christian Archdiocese of North America";

// Known diocese pages
const DIOCESE_URLS = [
  { url: "https://www.antiochian.org/parishes", name: "All" },
  { url: "https://www.antiochian.org/parishes?diocese=eastern", name: "Diocese of Charleston, Oakland, and the Mid-Atlantic" },
  { url: "https://www.antiochian.org/parishes?diocese=western", name: "Diocese of Los Angeles and the West" },
  { url: "https://www.antiochian.org/parishes?diocese=midwest", name: "Diocese of Toledo and the Midwest" },
  { url: "https://www.antiochian.org/parishes?diocese=southeast", name: "Diocese of Miami and the Southeast" },
  { url: "https://www.antiochian.org/parishes?diocese=northeast", name: "Diocese of New York and All North America" },
  { url: "https://www.antiochian.org/parishes?diocese=ottawa", name: "Diocese of Ottawa, Eastern Canada, and Upstate New York" },
  { url: "https://www.antiochian.org/parishes?diocese=wichita", name: "Diocese of Wichita and Mid-America" },
  { url: "https://www.antiochian.org/parishes?diocese=eagle_river", name: "Diocese of Eagle River and the Northwest" },
  { url: "https://www.antiochian.org/parishes?diocese=worcester", name: "Diocese of Worcester and New England" },
];

// ── API attempts ──

async function tryAPI() {
  const apiUrls = [
    "https://www.antiochian.org/api/parishes",
    "https://www.antiochian.org/parishes.json",
    "https://www.antiochian.org/wp-json/wp/v2/parish?per_page=100",
    "https://www.antiochian.org/wp-json/antiochian/v1/parishes",
    "https://www.antiochian.org/graphql?query={parishes{name,city,state,phone,latitude,longitude}}",
  ];

  for (const url of apiUrls) {
    try {
      const json = await fetchJSON(url, 1); // don't retry probes
      const arr = Array.isArray(json) ? json : (json?.data?.parishes || json?.parishes || json?.results || []);
      if (arr.length > 0) {
        console.log(`[${SOURCE_NAME}] Got ${arr.length} records from API: ${url}`);
        return arr.map(normaliseRecord);
      }
    } catch { /* silent */ }
  }

  // Try paginated WP REST API
  try {
    const all = [];
    for (let page = 1; page <= 10; page++) {
      const url = `https://www.antiochian.org/wp-json/wp/v2/parish?per_page=100&page=${page}`;
      const json = await fetchJSON(url, 1); // don't retry paginated probes
      const arr = Array.isArray(json) ? json : [];
      if (arr.length === 0) break;
      all.push(...arr.map(normaliseRecord));
      if (arr.length < 100) break;
      await sleep(500);
    }
    if (all.length > 0) {
      console.log(`[${SOURCE_NAME}] Got ${all.length} records from WP REST API`);
      return all;
    }
  } catch { /* silent */ }

  return null;
}

function normaliseRecord(raw) {
  return {
    source: SOURCE_NAME,
    name: raw.name || raw.title?.rendered || raw.title || raw.parish_name || "",
    jurisdiction: JURISDICTION,
    diocese: raw.diocese || raw.deanery || "",
    city: raw.city || "",
    state: raw.state || raw.province || "",
    country: raw.country || "USA",
    phone: raw.phone || raw.telephone || "",
    lat: raw.latitude || raw.lat || "",
    lng: raw.longitude || raw.lng || "",
    website: raw.website || raw.url || raw.link || "",
    address: raw.address || raw.street || "",
    clergy: raw.clergy || raw.pastor || raw.priest || "",
  };
}

// ── HTML scraping ──

async function scrapeDirectoryPage(pageUrl, dioceseName) {
  let html;
  try { html = await fetchPage(pageUrl); } catch (err) {
    console.error(`[${SOURCE_NAME}] Failed to fetch ${pageUrl}: ${err.message}`);
    return [];
  }
  const $ = cheerio.load(html);
  const parishes = [];

  // Strategy A: parish listing blocks
  const blockSelectors = [
    ".parish-listing", ".parish-item", ".parish-result",
    ".directory-item", ".views-row", ".parish-card", ".card",
    ".field-content", "table tbody tr",
  ];

  for (const sel of blockSelectors) {
    $(sel).each((_i, el) => {
      const name = clean($(el).find("h2, h3, h4, .title, .name, .parish-name, a, td:first-child").first().text());
      if (!name || name.length < 4) return;

      const record = {
        source: SOURCE_NAME,
        name,
        jurisdiction: JURISDICTION,
        diocese: dioceseName || "",
        country: "USA",
      };

      // Location
      const locationText = clean($(el).find(".location, .city-state, .address, .parish-location, td:nth-child(2)").first().text());
      if (locationText) {
        const parts = locationText.split(",").map(s => s.trim());
        record.city = parts[0] || "";
        record.state = (parts[1] || "").replace(/\d{5}.*/, "").trim();
      }

      record.phone = clean($(el).find(".phone, .parish-phone, td:nth-child(3)").first().text());
      record.website = $(el).find("a[href*='http']").attr("href") || "";
      record.address = clean($(el).find(".address, .street, .parish-address").first().text());

      // lat/lng from data attributes
      const lat = $(el).attr("data-lat") || $(el).find("[data-lat]").attr("data-lat") || "";
      const lng = $(el).attr("data-lng") || $(el).find("[data-lng]").attr("data-lng") || "";
      if (lat) record.lat = lat;
      if (lng) record.lng = lng;

      parishes.push(record);
    });
    if (parishes.length > 0) break;
  }

  // Strategy B: link scanning for parish detail pages
  if (parishes.length === 0) {
    const detailLinks = new Set();
    $("a[href]").each((_i, el) => {
      const href = $(el).attr("href") || "";
      const text = clean($(el).text());
      if (text.length >= 4 && (href.includes("/parish/") || href.includes("/parishes/"))) {
        if (!href.includes("search") && !href.includes("diocese")) {
          const fullHref = href.startsWith("http") ? href : `https://www.antiochian.org${href}`;
          detailLinks.add(JSON.stringify({ name: text, url: fullHref }));
        }
      }
    });

    for (const item of detailLinks) {
      const { name, url } = JSON.parse(item);
      parishes.push({
        source: SOURCE_NAME,
        name,
        jurisdiction: JURISDICTION,
        diocese: dioceseName || "",
        website: url,
        country: "USA",
      });
    }
  }

  // Strategy C: embedded JSON
  if (parishes.length === 0) {
    $("script").each((_i, el) => {
      const content = $(el).html() || "";
      const m = content.match(/(?:parishes|markers|locations|mapData)\s*[:=]\s*(\[[\s\S]*?\]);/);
      if (m) {
        try {
          JSON.parse(m[1]).forEach(p => parishes.push(normaliseRecord(p.properties || p)));
        } catch { /* ignore */ }
      }
    });
  }

  return parishes;
}

async function scrapeAllPages() {
  const allParishes = [];
  const seen = new Set();

  // Try the main page first
  const mainData = await scrapeDirectoryPage(SOURCE_URL, "");
  for (const p of mainData) {
    const key = (p.name || "").toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      allParishes.push(p);
    }
  }

  // If the main page didn't yield much, try diocese pages
  if (allParishes.length < 50) {
    for (const dio of DIOCESE_URLS.slice(1)) {
      await sleep(600);
      const data = await scrapeDirectoryPage(dio.url, dio.name);
      for (const p of data) {
        const key = (p.name || "").toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          if (!p.diocese) p.diocese = dio.name;
          allParishes.push(p);
        }
      }
    }
  }

  return allParishes;
}

// ── Main ──

async function scrape() {
  // 1. Try API
  let data = await tryAPI();
  if (data && data.length > 20) {
    console.log(`[${SOURCE_NAME}] API returned ${data.length} parishes.`);
    return data;
  }

  // 2. Try HTML
  data = await scrapeAllPages();
  console.log(`[${SOURCE_NAME}] HTML scraping returned ${data.length} parishes.`);
  return data;
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
