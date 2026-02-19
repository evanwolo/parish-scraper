const { fetchPage, clean } = require("./src/utils");
const cheerio = require("cheerio");

(async () => {
  // Get the full contact section from both sites
  for (const [label, url] of [
    ["CHICAGO", "https://chicagodiocese.org/parishes.html?type=details&id=403"],
    ["EA-DIOCESE", "https://eadiocese.org/parishes.html?type=details&id=1"],
  ]) {
    console.log(`\n=== ${label} ===`);
    const html = await fetchPage(url);
    const $ = cheerio.load(html);

    // Find all detail-label / detail-value pairs
    $(".detail-label").each(function () {
      const lbl = clean($(this).text());
      const val = clean($(this).next(".detail-value").text());
      const link = $(this).next(".detail-value").find("a").attr("href") || "";
      console.log(`  ${lbl} => ${val} [link: ${link}]`);
    });

    // Also try "contact-detail" or "parish-contact" sections
    for (const cls of [".contact-detail", ".parish-contact", ".parish-contacts", ".contact-section", ".detail-row"]) {
      const els = $(cls);
      if (els.length) {
        console.log(`\n  ${cls} (${els.length}):`);
        els.each(function () { console.log("  ", clean($(this).text()).substring(0, 200)); });
      }
    }

    // Find clergy specifically - look for the clergy heading/section
    const bodyHtml = $("body").html();
    // Find Clergy text in the detail area
    const clergyMatch = bodyHtml.match(/Clergy:?([\s\S]{0,1000}?)(?:Phone|Email|Website|Location|Listing|<\/div>\s*<\/div>\s*<\/div>)/i);
    if (clergyMatch) {
      const clergyHtml = clergyMatch[1];
      const $c = cheerio.load(clergyHtml);
      console.log("\n  Clergy raw text:", clean($c.text()));
    }
  }
})().catch(console.error);
