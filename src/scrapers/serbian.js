/**
 * Scraper: Serbian Orthodox Church in North and South America
 *
 * The Serbian Church in the US/Canada is organized into several dioceses,
 * each with its own website:
 *   - Diocese of Eastern America: https://www.easterndiocese.org/
 *   - Diocese of the Midwest: https://midwestserbdio.org/
 *   - Diocese of Western America: https://www.westsrbdio.org/
 *   - Diocese of Canada: https://www.serborth.org/
 *   - New Gracanica Metropolitanate: https://www.newgracanica.com/
 *
 * We try each diocese site plus any JSON/API endpoints we can discover.
 *
 * Columns: name, jurisdiction, diocese, city, state, country,
 *          phone, website, lat, lng, address, clergy.
 */

const cheerio = require("cheerio");
const { fetchPage, fetchJSON, clean, writeCSV, writeJSON, sleep } = require("../utils");

const SOURCE_URL = "https://www.easterndiocese.org/parishes";
const SOURCE_NAME = "serbian";
const JURISDICTION = "Serbian Orthodox Church in North and South America";

const DIOCESE_SOURCES = [
  {
    name: "Diocese of Eastern America",
    urls: [
      "https://www.easterndiocese.org/parishes",
      "https://www.easterndiocese.org/parishes.html",
      "https://www.easterndiocese.org/churches",
    ],
  },
  {
    name: "Diocese of the Midwest",
    urls: [
      "https://midwestserbdio.org/parishes",
      "https://midwestserbdio.org/parishes.html",
      "https://midwestserbdio.org/churches",
      "https://midwestserbdio.org/parishes/",
    ],
  },
  {
    name: "Diocese of Western America",
    urls: [
      "https://www.westsrbdio.org/parishes",
      "https://www.westsrbdio.org/en/parishes",
      "https://www.westsrbdio.org/parishes.html",
    ],
  },
  {
    name: "New Gracanica Metropolitanate",
    urls: [
      "https://www.newgracanica.com/parishes",
      "https://www.newgracanica.com/churches",
      "https://www.newgracanica.com/parishes.html",
    ],
  },
  {
    name: "Diocese of Canada",
    urls: [
      "https://www.serborth.org/parishes",
      "https://www.serborth.org/churches",
    ],
  },
];

// ── Generic parish extraction from an HTML page ──

function extractParishes($, dioceseName) {
  const parishes = [];

  // Strategy A: common listing blocks
  const blockSelectors = [
    ".parish-listing", ".parish-item", ".parish-result", ".directory-item",
    ".views-row", ".card", ".parish", ".church-item", ".location-item",
    "table tbody tr", ".entry-content li",
  ];

  for (const sel of blockSelectors) {
    $(sel).each((_i, el) => {
      const name = clean($(el).find("h2, h3, h4, h5, .title, .name, .parish-name, a, td:first-child").first().text());
      if (!name || name.length < 4) return;

      const record = {
        source: SOURCE_NAME,
        name,
        jurisdiction: JURISDICTION,
        diocese: dioceseName,
        country: "USA",
      };

      const loc = clean($(el).find(".location, .city-state, .address, td:nth-child(2)").first().text());
      if (loc) {
        const parts = loc.split(",").map(s => s.trim());
        record.city = parts[0] || "";
        record.state = (parts[1] || "").replace(/\d{5}.*/, "").trim();
        if (parts.length > 2 && /canada/i.test(parts[parts.length - 1])) record.country = "Canada";
      }

      record.phone = clean($(el).find(".phone, td:nth-child(3)").first().text());
      const href = $(el).find("a[href*='http']").attr("href") || $(el).find("a").attr("href") || "";
      if (href) record.website = href.startsWith("http") ? href : "";
      record.address = clean($(el).find(".address, .street").first().text());

      const lat = $(el).attr("data-lat") || $(el).find("[data-lat]").attr("data-lat") || "";
      const lng = $(el).attr("data-lng") || $(el).find("[data-lng]").attr("data-lng") || "";
      if (lat) record.lat = lat;
      if (lng) record.lng = lng;

      parishes.push(record);
    });
    if (parishes.length > 0) return parishes;
  }

  // Strategy B: links containing parish-like patterns
  const linkParishes = new Set();
  $("a[href]").each((_i, el) => {
    const href = $(el).attr("href") || "";
    const text = clean($(el).text());
    if (text.length >= 4 && /parish|church|cathedral|monastery|mission/i.test(href)) {
      if (!/search|diocese|category|tag/i.test(href)) {
        linkParishes.add(JSON.stringify({ name: text, href }));
      }
    }
  });
  for (const item of linkParishes) {
    const { name, href } = JSON.parse(item);
    parishes.push({
      source: SOURCE_NAME,
      name,
      jurisdiction: JURISDICTION,
      diocese: dioceseName,
      website: href.startsWith("http") ? href : "",
      country: "USA",
    });
  }

  // Strategy C: embedded JSON
  $("script").each((_i, el) => {
    const content = $(el).html() || "";
    const m = content.match(/(?:parishes|markers|locations|churches)\s*[:=]\s*(\[[\s\S]*?\]);/);
    if (m) {
      try {
        JSON.parse(m[1]).forEach(p => {
          parishes.push({
            source: SOURCE_NAME,
            name: p.name || p.title || "",
            jurisdiction: JURISDICTION,
            diocese: dioceseName,
            city: p.city || "",
            state: p.state || "",
            country: "USA",
            lat: p.lat || p.latitude || "",
            lng: p.lng || p.longitude || "",
            phone: p.phone || "",
            website: p.website || p.url || "",
            address: p.address || "",
          });
        });
      } catch { /* ignore */ }
    }
  });

  return parishes;
}

// ── Main ──

async function scrape() {
  const allParishes = [];
  const seen = new Set();

  for (const diocese of DIOCESE_SOURCES) {
    let found = false;
    for (const url of diocese.urls) {
      try {
        const html = await fetchPage(url);
        const $ = cheerio.load(html);
        const data = extractParishes($, diocese.name);
        if (data.length > 0) {
          for (const p of data) {
            const key = (p.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
            if (!seen.has(key)) {
              seen.add(key);
              allParishes.push(p);
            }
          }
          console.log(`[${SOURCE_NAME}] ${diocese.name}: ${data.length} parishes from ${url}`);
          found = true;
          break;
        }
      } catch { /* try next URL */ }
      await sleep(500);
    }
    if (!found) {
      console.log(`[${SOURCE_NAME}] ${diocese.name}: no parishes found from any URL`);
    }
    await sleep(600);
  }

  console.log(`[${SOURCE_NAME}] Total: ${allParishes.length} parishes.`);
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
  console.log(`[${SOURCE_NAME}] Wrote ${csvPath} (${data.length} records)`);
  console.log(`[${SOURCE_NAME}] Wrote ${jsonPath}`);
  return data;
}

module.exports = { scrape, run, SOURCE_NAME, SOURCE_URL };
