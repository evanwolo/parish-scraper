const m = require("./src/scrapers/uoc-usa");
m.run()
  .then((d) => {
    console.log("=== UOC-USA RESULT ===");
    console.log("Records:", d.length);
    console.log("Has lat:", d.filter((r) => r.lat).length);
    console.log("Has lng:", d.filter((r) => r.lng).length);
    console.log("Has address:", d.filter((r) => r.address).length);
    console.log("Has phone:", d.filter((r) => r.phone).length);
    console.log("Has clergy:", d.filter((r) => r.clergy).length);
  })
  .catch((e) => {
    console.error("=== UOC-USA ERROR ===");
    console.error(e.message);
  });
