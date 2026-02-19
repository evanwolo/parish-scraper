/**
 * Scraper: Bulgarian Eastern Orthodox Diocese of the USA, Canada, and Australia
 * URL: https://www.bulgariandiocese.org/
 *
 * Columns: name, jurisdiction, city, state, country,
 *          phone, website, lat, lng, address, clergy.
 */

const cheerio = require("cheerio");
const { fetchPage, fetchJSON, clean, writeCSV, writeJSON, sleep } = require("../utils");

const SOURCE_URL = "https://www.bulgariandiocese.org/";
const SOURCE_NAME = "bulgarian";
const JURISDICTION = "Bulgarian Eastern Orthodox Diocese of the USA, Canada, and Australia";

const DIRECTORY_URLS = [
  "https://www.bulgariandiocese.org/parishes",
  "https://www.bulgariandiocese.org/parishes.html",
  "https://www.bulgariandiocese.org/churches",
  "https://www.bulgariandiocese.org/parish-directory",
  "https://www.bulgariandiocese.org/",
  "https://bulgariandiocese.org/parishes",
];

// ── API ──

async function tryAPI() {
  const urls = [
    "https://www.bulgariandiocese.org/api/parishes",
    "https://www.bulgariandiocese.org/parishes.json",
    "https://www.bulgariandiocese.org/wp-json/wp/v2/parish?per_page=100",
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

function extractParishes($, baseUrl) {
  const parishes = [];

  const blockSelectors = [
    ".parish-listing", ".parish-item", ".parish-result", ".directory-item",
    ".views-row", ".card", ".entry-content li", ".wp-block-list li",
    "table tbody tr", ".sqs-block-content li", "article",
  ];

  for (const sel of blockSelectors) {
    $(sel).each((_i, el) => {
      const name = clean($(el).find("h2, h3, h4, h5, .title, .name, a, strong, td:first-child").first().text());
      if (!name || name.length < 4) return;
      if (/^(home|about|contact|news|events|calendar|links|history|donate)/i.test(name)) return;

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

      if (!record.city) {
        const text = clean($(el).text());
        const csMatch = text.match(/([A-Z][a-z]+(?:\s[A-Z][a-z]+)*),\s*([A-Z]{2})/);
        if (csMatch) {
          record.city = csMatch[1];
          record.state = csMatch[2];
        }
      }

      record.phone = clean($(el).find(".phone").first().text());
      record.address = clean($(el).find(".address, .street").first().text());

      const href = $(el).find("a[href*='http']").attr("href") || "";
      if (href) record.website = href;

      parishes.push(record);
    });
    if (parishes.length > 0) return parishes;
  }

  // Look for parish links
  const parishLinks = new Set();
  $("a[href]").each((_i, el) => {
    const href = $(el).attr("href") || "";
    const text = clean($(el).text());
    if (text.length >= 4 && /parish|church|cathedral|temple/i.test(text)) {
      if (!/search|category|tag|about|contact/i.test(href)) {
        parishLinks.add(JSON.stringify({ name: text, href }));
      }
    }
  });
  for (const item of parishLinks) {
    const { name, href } = JSON.parse(item);
    parishes.push({
      source: SOURCE_NAME,
      name,
      jurisdiction: JURISDICTION,
      website: href.startsWith("http") ? href : `${baseUrl}${href}`,
      country: "USA",
    });
  }

  // Embedded JSON
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
  let data = await tryAPI();
  if (data && data.length > 0) return data;

  for (const url of DIRECTORY_URLS) {
    try {
      const html = await fetchPage(url);
      const $ = cheerio.load(html);
      data = extractParishes($, url.replace(/\/[^/]*$/, ""));
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
