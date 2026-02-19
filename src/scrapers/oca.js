/**
 * Scraper: Orthodox Church in America (OCA) parish directory
 * URL: https://www.oca.org/parishes/search
 *
 * 1. Scrape each diocese listing page for parish links.
 * 2. Visit each parish detail page to extract full info
 *    (city, state, address, phone, clergy, lat/lng, deanery).
 *
 * Columns: name, jurisdiction, diocese, deanery, city, state, country,
 *          phone, website, lat, lng, address, clergy.
 */

const cheerio = require("cheerio");
const { fetchPage, clean, writeCSV, writeJSON, sleep } = require("../utils");

const SOURCE_URL = "https://www.oca.org/parishes/search";
const SOURCE_NAME = "oca";
const JURISDICTION = "Orthodox Church in America (OCA)";

const DIOCESE_CODES = [
  "AK", "AL", "BU", "CA", "EP", "MX", "MW", "NE", "NY", "SO", "WA", "WE", "WP",
];

/* ── helpers ────────────────────────────────────────────────────────── */

function isNavLink(text, href) {
  return (
    !text ||
    text.length < 4 ||
    /^(parishes|search|diocese|state|select|list)/i.test(text) ||
    /deanery/i.test(text) ||
    href === "/parishes" ||
    href.includes("/search") ||
    href.includes("/diocese/") ||
    href.includes("/state/") ||
    href.includes("/deanery/")
  );
}

function fullUrl(href) {
  return href.startsWith("http") ? href : `https://www.oca.org${href}`;
}

/* ── diocese listing page ───────────────────────────────────────────── */

async function scrapeDiocesePage(code) {
  const url = `https://www.oca.org/parishes/diocese/${code}`;
  let html;
  try { html = await fetchPage(url); } catch { return []; }
  const $ = cheerio.load(html);
  const dioceseName = clean($("h1").first().text()) || code;
  const parishes = [];

  $("a[href*='/parishes/']").each((_i, el) => {
    const href = $(el).attr("href") || "";
    const text = clean($(el).text());
    if (isNavLink(text, href)) return;

    parishes.push({
      source: SOURCE_NAME,
      name: text,
      jurisdiction: JURISDICTION,
      diocese: dioceseName,
      detailUrl: fullUrl(href),
    });
  });

  $("table tbody tr, .parish-list li, ul.parishes li").each((_i, el) => {
    const cells = [];
    $(el).find("td").each((_ci, td) => cells.push(clean($(td).text())));
    if (cells.length < 2) return;
    const link = $(el).find("a").attr("href");
    parishes.push({
      source: SOURCE_NAME,
      name: cells[0],
      city: cells[1] || "",
      state: cells[2] || "",
      jurisdiction: JURISDICTION,
      diocese: dioceseName,
      detailUrl: link ? fullUrl(link) : "",
    });
  });

  return parishes;
}

/* ── detail page extraction ─────────────────────────────────────────── */

async function scrapeDetailPage(record) {
  const url = record.detailUrl;
  if (!url) return record;

  let html;
  try { html = await fetchPage(url); } catch { return record; }
  const $ = cheerio.load(html);
  const article = $("article, #content, main").first();
  const bodyText = $("body").text().replace(/\s+/g, " ");

  // City & State — try structured markup first, then regex on body text
  if (!record.city) {
    const locationEl = article.find(".field--name-field-city, [class*='city'], [class*='location'], .city-state").first();
    if (locationEl.length) {
      const locText = clean(locationEl.text());
      const parts = locText.split(",").map(s => s.trim());
      if (parts.length >= 2) {
        record.city = parts[0];
        record.state = parts[1];
      } else if (parts[0]) {
        record.city = parts[0];
      }
    }
  }

  if (!record.city) {
    const escaped = record.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const csMatch = bodyText.match(
      new RegExp(escaped + "\\s+([A-Za-z][A-Za-z .'-]+),\\s*([A-Za-z][A-Za-z .'-]+?)\\s+(?:Founded|Diocese|$)", "i")
    );
    if (csMatch) {
      record.city = csMatch[1].trim();
      record.state = csMatch[2].trim();
    }
  }

  // Diocese & Deanery
  if (article.length) {
    const dioLink = article.find("a[href*='/dioceses/']").first();
    if (dioLink.length) record.diocese = clean(dioLink.text()) || record.diocese;
    const dnLink = article.find("a[href*='/deanery/']").first();
    if (dnLink.length) record.deanery = clean(dnLink.text());
  }

  // ── Address extraction ──
  // Strategy 1: <h2>Address</h2> followed by <p> (most OCA parish pages)
  if (!record.address) {
    $("h2").each((_i, el) => {
      if (record.address) return; // already found
      const heading = $(el).text().trim();
      if (/^(mailing\s+)?address$/i.test(heading)) {
        const nextP = $(el).nextAll("p").first();
        if (nextP.length) {
          const addrHtml = nextP.html() || "";
          const lines = addrHtml
            .split(/<br\s*\/?>/gi)
            .map((l) => clean(cheerio.load(l).text()))
            .filter(Boolean)
            .filter((l) => !/^(US|USA)$/i.test(l)); // strip bare "USA" line
          if (lines.length) record.address = lines.join(", ");
        }
      }
    });
  }

  // Strategy 2: "Mailing address:" in body text (fallback)
  if (!record.address) {
    const addrBlock = bodyText.match(/Mailing address:\s*([\s\S]*?)(?:Parish Contacts|$)/i);
    if (addrBlock) {
      record.address = addrBlock[1].replace(/\s+/g, " ").replace(/\s*(US|USA)\s*$/i, "").trim();
    }
  }

  // ── Clergy & phone from .contact blocks ──
  const clergyParts = [];
  $(".contact").each((_i, el) => {
    const name = clean($(el).find(".name").text());
    const desc = clean($(el).find(".description").text());
    if (name) clergyParts.push(desc ? `${name} (${desc})` : name);
    if (!record.phone) {
      const ph = clean($(el).find(".phone").text()).match(/[\d(][\d\s\-().+]{6,}/);
      if (ph) record.phone = ph[0].trim();
    }
  });
  if (clergyParts.length) record.clergy = clergyParts.join("; ");

  // ── Phone from <p>Office: ...</p> or <p>Phone: ...</p> (fallback) ──
  if (!record.phone) {
    $("p").each((_i, el) => {
      if (record.phone) return;
      const txt = $(el).text().trim();
      const phoneMatch = txt.match(/^(?:Office|Phone|Tel|Telephone):\s*([\d(][\d\s\-().+]{6,})/i);
      if (phoneMatch) record.phone = phoneMatch[1].trim();
    });
  }

  // ── Lat / Lng from embedded Google Maps JS ──
  const scripts = $("script").toArray().map((s) => $(s).html() || "").join("\n");
  const latM = scripts.match(/new_latitude\s*=\s*'([^']+)'/);
  const lngM = scripts.match(/new_longitude\s*=\s*'([^']+)'/);
  if (latM) record.lat = latM[1];
  if (lngM) record.lng = lngM[1];

  record.website = url;
  if (!record.country) record.country = "USA";

  return record;
}

/* ── main scrape logic ──────────────────────────────────────────────── */

async function scrape() {
  let allParishes = [];
  console.log(`[${SOURCE_NAME}] Scraping ${DIOCESE_CODES.length} diocese pages …`);
  for (const code of DIOCESE_CODES) {
    await sleep(400);
    allParishes.push(...(await scrapeDiocesePage(code)));
  }

  if (allParishes.length < 20) {
    console.log(`[${SOURCE_NAME}] Diocese pages yielded ${allParishes.length}; trying state pages …`);
    const US_STATES = [
      "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
      "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
      "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
      "VA","WA","WV","WI","WY","DC",
    ];
    for (const st of US_STATES) {
      await sleep(300);
      let html; try { html = await fetchPage(`https://www.oca.org/parishes/state/${st}`); } catch { continue; }
      const $ = cheerio.load(html);
      $("a[href*='/parishes/']").each((_i, el) => {
        const href = $(el).attr("href") || "";
        const text = clean($(el).text());
        if (isNavLink(text, href)) return;
        allParishes.push({
          source: SOURCE_NAME, name: text, state: st,
          jurisdiction: JURISDICTION, detailUrl: fullUrl(href),
        });
      });
    }
  }

  // Deduplicate before detail fetches (by detail URL or name)
  const seen = new Set();
  const unique = allParishes.filter((p) => {
    const key = (p.detailUrl || p.name || "").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`[${SOURCE_NAME}] ${unique.length} unique parishes. Fetching detail pages …`);

  const enriched = [];
  for (let i = 0; i < unique.length; i++) {
    if ((i + 1) % 50 === 0) console.log(`[${SOURCE_NAME}]   … ${i + 1}/${unique.length}`);
    await sleep(250);
    try { enriched.push(await scrapeDetailPage(unique[i])); }
    catch { enriched.push(unique[i]); }
  }

  // Clean up temp field
  for (const r of enriched) {
    if (!r.website && r.detailUrl) r.website = r.detailUrl;
    delete r.detailUrl;
  }

  console.log(`[${SOURCE_NAME}] Completed with ${enriched.length} parish(es).`);
  return enriched;
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
