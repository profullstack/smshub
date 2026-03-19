const fs = require("fs");
const path = require("path");

// Remove chrome-sandbox from Linux builds to avoid SUID permission errors in AppImage
exports.default = async function (context) {
  if (context.electronPlatformName !== "linux") return;

  const sandboxPath = path.join(context.appOutDir, "chrome-sandbox");
  if (fs.existsSync(sandboxPath)) {
    fs.unlinkSync(sandboxPath);
    console.log("Removed chrome-sandbox from Linux build");
  }
};
