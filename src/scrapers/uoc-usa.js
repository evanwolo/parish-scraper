/**
 * Scraper: Ukrainian Orthodox Church of the USA – Parish Directory
 * URL: https://www.uocusa.org/directories_parishes
 *
 * Parishes are listed alphabetically grouped by US state / region.
 * The layout is primarily text and links organised by headings.
 *
 * Columns: name, city, state, website.
 */

const cheerio = require("cheerio");
const { fetchPage, clean, writeCSV, writeJSON, sleep } = require("../utils");

const SOURCE_URL = "https://www.uocusa.org/directories_parishes";
const SOURCE_NAME = "uoc-usa";

async function scrape() {
  console.log(`[${SOURCE_NAME}] Fetching ${SOURCE_URL} …`);
  const html = await fetchPage(SOURCE_URL);
  const $ = cheerio.load(html);

  const parishes = [];

  // ── Primary strategy ──────────────────────────────────────────────
  // The UOC page uses:
  //   <h3><a name="XX"></a>STATE</h3>
  //   <p><strong>Parish Name</strong><br/>Address<br/>City, ST ZIP<br/>Phone<br/>Clergy: …</p>
  let currentState = "";

  // We iterate all <h3> and <p> in document order
  $("h3, p").each((_i, el) => {
    const tag = el.tagName.toLowerCase();

    // State heading: <h3><a name="XX"></a>STATE NAME</h3>
    if (tag === "h3") {
      const anchor = $(el).find("a[name]");
      if (anchor.length) {
        currentState = clean($(el).text());
      }
      return;
    }

    // Parish paragraph: starts with <strong> containing the parish name
    const strong = $(el).find("strong").first();
    if (!strong.length) return;

    const name = clean(strong.text());
    if (!name || name.length < 3) return;

    // Skip non-parish entries (offices, hierarchs, addresses, notes)
    if (/^(eastern eparchy|western eparchy|eparchial|mailing address|offices|consistory|his eminence|his grace|\*\*\*|replace)/i.test(name)) return;

    // The full text has the address/phone/clergy separated by line breaks
    // Get the raw HTML and split on <br>
    const innerHtml = $(el).html() || "";
    const lines = innerHtml
      .split(/<br\s*\/?>/gi)
      .map((l) => clean(cheerio.load(l).text()))
      .filter(Boolean);

    // lines[0] = parish name (inside <strong>), rest = address parts
    const record = {
      source: SOURCE_NAME,
      name,
      jurisdiction: "Ukrainian Orthodox Church of the USA (UOC-USA)",
      diocese: "UOC-USA",
      address: "",
      city: "",
      state: currentState,
      country: "USA",
      zip: "",
      phone: "",
      clergy: "",
      website: "",
    };

    // Extract link from <strong><a href="...">Name</a></strong>
    const link = strong.find("a").attr("href") || $(el).find("a").first().attr("href") || "";
    if (link && link.startsWith("http")) record.website = link;

    // Parse remaining lines
    const addressParts = [];
    for (const line of lines.slice(1)) {
      if (!line) continue;

      // Phone: digits, dashes, parens
      if (/^\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/.test(line.replace(/\s/g, ""))) {
        record.phone = line;
        continue;
      }

      // Clergy line
      if (/^clergy:/i.test(line)) {
        record.clergy = record.clergy
          ? `${record.clergy}; ${line.replace(/^clergy:\s*/i, "")}`
          : line.replace(/^clergy:\s*/i, "");
        continue;
      }

      // City, State ZIP pattern
      const csz = line.match(/^([A-Za-z\s.]+),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$/);
      if (csz) {
        record.city = csz[1].trim();
        record.state = csz[2];
        if (csz[3]) record.zip = csz[3];
        continue;
      }

      // Otherwise it's an address line
      addressParts.push(line);
    }

    record.address = addressParts.join(", ");

    parishes.push(record);
  });

  // ── Fallback: link-based extraction ─────────────────────────────
  if (parishes.length === 0) {
    console.log(`[${SOURCE_NAME}] Trying link fallback …`);
    $("a").each((_i, el) => {
      const text = clean($(el).text());
      const href = $(el).attr("href") || "";
      if (
        text.length > 5 &&
        /church|parish|cathedral|mission|monastery/i.test(text)
      ) {
        parishes.push({
          source: SOURCE_NAME,
          name: text,
          city: "",
          state: "",
          website: href.startsWith("http") ? href : "",
        });
      }
    });
  }

  // Deduplicate by name + city
  const seen = new Set();
  const unique = parishes.filter((p) => {
    const key = `${p.name}|${p.city}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`[${SOURCE_NAME}] Found ${unique.length} parish(es).`);
  return unique;
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
