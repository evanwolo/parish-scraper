const { fetchPage, clean } = require("./src/utils");
const cheerio = require("cheerio");

(async () => {
  // Chicago detail full HTML in content region
  console.log("=== CHICAGO DETAIL - full parish section ===");
  const html2 = await fetchPage("https://chicagodiocese.org/parishes.html?type=details&id=403");
  const $2 = cheerio.load(html2);
  // Get .parish-header, .parish-info, .parish-contact etc.
  for (const cls of [".parish-header", ".parish-title", ".parish-address", ".parish-info", ".parish-contact", ".contact-info", ".SECTION_TITLE"]) {
    const el = $2(cls);
    if (el.length) {
      console.log(`\n${cls} (${el.length}):`);
      el.each(function () { console.log($2(this).html().substring(0, 500)); });
    }
  }
  // Find Clergy / Phone / Email / Website text
  console.log("\n=== Text containing Clergy/Phone/Website ===");
  const bodyText = $2("body").html();
  const m1 = bodyText.match(/Clergy[\s\S]{0,500}/i);
  if (m1) console.log("Clergy context:", m1[0].substring(0, 500));
  const m2 = bodyText.match(/Phone[\s\S]{0,200}/i);
  if (m2) console.log("Phone context:", m2[0].substring(0, 300));
  const m3 = bodyText.match(/Website[\s\S]{0,200}/i);
  if (m3) console.log("Website context:", m3[0].substring(0, 300));

  // EA diocese
  console.log("\n\n=== EA-DIOCESE DETAIL - full parish section ===");
  const html3 = await fetchPage("https://eadiocese.org/parishes.html?type=details&id=1");
  const $3 = cheerio.load(html3);
  for (const cls of [".parish-header", ".parish-title", ".parish-address", ".parish-info", ".parish-contact", ".contact-info", ".parish-details-section"]) {
    const el = $3(cls);
    if (el.length) {
      console.log(`\n${cls} (${el.length}):`);
      el.each(function () { console.log($3(this).html().substring(0, 800)); });
    }
  }
  // Find Clergy / Phone / Email / Website
  const bodyText3 = $3("body").html();
  const m4 = bodyText3.match(/Clergy[\s\S]{0,500}/i);
  if (m4) console.log("Clergy context:", m4[0].substring(0, 500));
  const m5 = bodyText3.match(/Phone[\s\S]{0,200}/i);
  if (m5) console.log("Phone context:", m5[0].substring(0, 300));
  const m6 = bodyText3.match(/Website[\s\S]{0,200}/i);
  if (m6) console.log("Website context:", m6[0].substring(0, 300));

  // Check for "SM_" id patterns (likely template-based)
  console.log("\n=== EA-DIOCESE SM_ ids ===");
  $3("[id*='SM_parish']").each(function () {
    console.log($3(this).attr("id"), ":", clean($3(this).text()).substring(0, 200));
  });

  console.log("\n=== CHICAGO SM_ ids ===");
  $2("[id*='SM_parish']").each(function () {
    console.log($2(this).attr("id"), ":", clean($2(this).text()).substring(0, 200));
  });
})().catch(console.error);
