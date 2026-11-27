// Vencord shim — finds patcher.js via resources\vencord-path.txt, boots the real _app.asar.
// fail-open: if the pointer file or patcher is missing/broken, Discord still launches stock.
try {
    const fs = require("fs");
    const path = require("path");
    const target = fs.readFileSync(path.join(__dirname, "..", "vencord-path.txt"), "utf8").trim();
    require(target);
} catch (e) {
    try { require("../_app.asar"); } catch { /* nothing we can do — let electron error */ }
}
