/**
 * Scraper: Greek Orthodox Archdiocese of America (GOARCH)
 * URL: https://www.goarch.org/parishes
 *
 * Strategies:
 *   1. Try the GOARCH parish search API (JSON endpoint).
 *   2. Scrape the HTML parish directory by metropolis.
 *   3. Fall back to the Assembly of Bishops data for GOA.
 *
 * Columns: name, jurisdiction, diocese (metropolis), city, state, country,
 *          phone, website, lat, lng, address, clergy.
 */

const cheerio = require("cheerio");
const { fetchPage, fetchJSON, clean, writeCSV, writeJSON, sleep, http } = require("../utils");

const SOURCE_URL = "https://www.goarch.org/parishes";
const SOURCE_NAME = "goarch";
const JURISDICTION = "Greek Orthodox Archdiocese of America";

// GOARCH organises parishes under metropolises (formerly dioceses)
const METROPOLISES = [
  { code: "direct",    name: "Direct Archdiocesan District" },
  { code: "atlanta",   name: "Metropolis of Atlanta" },
  { code: "boston",     name: "Metropolis of Boston" },  // historically "Metropolis of New England"; scraper uses current GOARCH naming
  { code: "chicago",   name: "Metropolis of Chicago" },
  { code: "denver",    name: "Metropolis of Denver" },
  { code: "detroit",   name: "Metropolis of Detroit" },
  { code: "newjersey", name: "Metropolis of New Jersey" },
  { code: "pittsburgh",name: "Metropolis of Pittsburgh" },
  { code: "sanfran",   name: "Metropolis of San Francisco" },
];

// ── API-based approach ──

async function tryAPI() {
  // GOARCH uses a Liferay-based backend; try common API patterns
  const apiUrls = [
    "https://www.goarch.org/api/jsonws/parish/get-parishes",
    "https://www.goarch.org/o/parish-directory-portlet/api/parishes",
    "https://www.goarch.org/parishes?p_p_id=parish_WAR_parishportlet&p_p_lifecycle=2&p_p_resource_id=parishes&_format=json",
    "https://www.goarch.org/web/guest/parishes?p_p_id=parish_WAR_parishportlet&p_p_lifecycle=2",
  ];

  for (const url of apiUrls) {
    try {
      const json = await fetchJSON(url);
      const arr = Array.isArray(json) ? json : (json?.data || json?.parishes || json?.results || []);
      if (arr.length > 0) {
        console.log(`[${SOURCE_NAME}] Got ${arr.length} records from API: ${url}`);
        return arr.map(normaliseAPIRecord);
      }
    } catch { /* silent */ }
  }
  return null;
}

function normaliseAPIRecord(raw) {
  return {
    source: SOURCE_NAME,
    name: raw.name || raw.title || raw.parishName || raw.parish_name || "",
    jurisdiction: JURISDICTION,
    diocese: raw.metropolis || raw.diocese || raw.district || "",
    city: raw.city || "",
    state: raw.state || raw.stateProvince || "",
    country: raw.country || "USA",
    phone: raw.phone || raw.telephone || raw.phoneNumber || "",
    lat: raw.latitude || raw.lat || "",
    lng: raw.longitude || raw.lng || "",
    website: raw.website || raw.url || raw.webUrl || "",
    address: [raw.address1 || raw.address || "", raw.address2 || ""]
      .filter(Boolean).join(", "),
    clergy: raw.clergy || raw.pastor || raw.priest || "",
  };
}

// ── HTML-based approach ──

async function scrapeParishDirectory() {
  console.log(`[${SOURCE_NAME}] Fetching parish directory HTML …`);
  let html;
  try { html = await fetchPage(SOURCE_URL); } catch (err) {
    console.error(`[${SOURCE_NAME}] Failed to load directory: ${err.message}`);
    return [];
  }
  const $ = cheerio.load(html);
  const parishes = [];

  // Strategy A: look for parish listing blocks
  $(".parish-listing, .parish-item, .parish-result, .directory-listing, .views-row").each((_i, el) => {
    const name = clean($(el).find("h2, h3, h4, .title, .name, .parish-name").first().text());
    if (!name) return;

    const record = {
      source: SOURCE_NAME,
      name,
      jurisdiction: JURISDICTION,
      city: clean($(el).find(".city, .parish-city").text()),
      state: clean($(el).find(".state, .parish-state").text()),
      country: "USA",
      phone: clean($(el).find(".phone, .parish-phone").text()),
      website: $(el).find("a[href*='http']").attr("href") || "",
      address: clean($(el).find(".address, .parish-address").text()),
    };

    // lat/lng from data attrs
    const lat = $(el).attr("data-lat") || $(el).find("[data-lat]").attr("data-lat") || "";
    const lng = $(el).attr("data-lng") || $(el).find("[data-lng]").attr("data-lng") || "";
    if (lat) record.lat = lat;
    if (lng) record.lng = lng;

    // Diocese/metropolis
    const metro = clean($(el).find(".metropolis, .diocese, .district").text());
    if (metro) record.diocese = metro;

    parishes.push(record);
  });

  if (parishes.length > 0) return parishes;

  // Strategy B: table rows
  $("table tbody tr").each((_i, el) => {
    const cells = $(el).find("td").toArray().map(td => clean($(td).text()));
    if (cells.length < 2) return;
    const link = $(el).find("a").attr("href") || "";
    parishes.push({
      source: SOURCE_NAME,
      name: cells[0],
      city: cells[1] || "",
      state: cells[2] || "",
      jurisdiction: JURISDICTION,
      country: "USA",
      website: link.startsWith("http") ? link : link ? `https://www.goarch.org${link}` : "",
    });
  });

  if (parishes.length > 0) return parishes;

  // Strategy C: embedded JSON / map markers
  $("script").each((_i, el) => {
    const content = $(el).html() || "";
    const patterns = [
      /(?:parishes|markers|locations|mapData|features)\s*[:=]\s*(\[[\s\S]*?\]);/,
      /"features"\s*:\s*(\[[\s\S]*?\])\s*\}/,
    ];
    for (const pat of patterns) {
      const m = content.match(pat);
      if (m) {
        try {
          const arr = JSON.parse(m[1]);
          arr.forEach(p => {
            parishes.push(normaliseAPIRecord(p.properties || p));
          });
        } catch { /* ignore */ }
      }
    }
  });

  return parishes;
}

// ── Try state-by-state search ──

async function scrapeByState() {
  const US_STATES = [
    "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN",
    "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH",
    "NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT",
    "VT","VA","WA","WV","WI","WY",
  ];

  const parishes = [];
  console.log(`[${SOURCE_NAME}] Trying state-by-state search …`);

  for (const st of US_STATES) {
    const searchUrls = [
      `https://www.goarch.org/parishes?state=${st}`,
      `https://www.goarch.org/parishes/-/parish/search?state=${st}`,
    ];

    for (const url of searchUrls) {
      try {
        const html = await fetchPage(url);
        const $ = cheerio.load(html);

        $(".parish-listing, .parish-result, .parish-item, .views-row, table tbody tr, .card").each((_i, el) => {
          const name = clean($(el).find("h2, h3, h4, .title, .name, td:first-child").first().text());
          if (!name || name.length < 4) return;
          parishes.push({
            source: SOURCE_NAME,
            name,
            jurisdiction: JURISDICTION,
            state: st,
            city: clean($(el).find(".city, td:nth-child(2)").first().text()),
            country: "USA",
          });
        });

        if (parishes.length > 0) break; // found a working URL pattern
      } catch { /* try next */ }
    }
    await sleep(300);
  }

  return parishes;
}

// ── Main ──

async function scrape() {
  // 1. Try API
  let data = await tryAPI();
  if (data && data.length > 20) return data;

  // 2. Try HTML directory
  data = await scrapeParishDirectory();
  if (data.length > 20) return data;

  // 3. Try state-by-state
  data = await scrapeByState();
  if (data.length > 0) return data;

  console.log(`[${SOURCE_NAME}] All strategies returned few/no results. Check site structure.`);
  return data || [];
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
