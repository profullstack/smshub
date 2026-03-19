// Entry point — runs before any electron imports
// Fixes Linux sandbox issues with AppImage
if (process.platform === "linux") {
  process.argv.push("--no-sandbox");
}
require("./index.js");
