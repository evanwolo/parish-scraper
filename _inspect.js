const { fetchPage, clean } = require("./src/utils");
const cheerio = require("cheerio");

(async () => {
  // Fetch an OCA detail page
  const url = "https://www.oca.org/parishes/oca-ak-adasic";
  console.log("Fetching", url);
  const html = await fetchPage(url);
  const $ = cheerio.load(html);

  // Print raw HTML length
  console.log("HTML length:", html.length);

  // Print first 4000 chars of body text
  console.log("\n=== Body text (first 4000 chars) ===");
  console.log($("body").text().replace(/\s+/g, " ").substring(0, 4000));

  // Check for structured blocks
  console.log("\n=== dl/dt/dd ===");
  $("dl dt, dl dd").each(function () {
    console.log(this.tagName, ":", clean($(this).text()));
  });

  console.log("\n=== .field, .parish, .detail ===");
  $("[class*='parish'], [class*='detail'], [class*='field'], [class*='address'], [class*='clergy']").each(function () {
    const cls = $(this).attr("class") || "";
    console.log(cls, ":", clean($(this).text()).substring(0, 200));
  });
})().catch((e) => console.error(e.message));
