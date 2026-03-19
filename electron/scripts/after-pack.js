const fs = require("fs");
const path = require("path");

exports.default = async function (context) {
  if (context.electronPlatformName !== "linux") return;

  // Remove chrome-sandbox (SUID issue)
  const sandboxPath = path.join(context.appOutDir, "chrome-sandbox");
  if (fs.existsSync(sandboxPath)) {
    fs.unlinkSync(sandboxPath);
    console.log("Removed chrome-sandbox from Linux build");
  }

  // Rename the real binary and create a wrapper that adds --no-sandbox
  const exeName = context.packager.executableName || "smshub-desktop";
  const realBinary = path.join(context.appOutDir, exeName);
  const renamedBinary = path.join(context.appOutDir, exeName + ".bin");

  if (fs.existsSync(realBinary)) {
    fs.renameSync(realBinary, renamedBinary);
    fs.writeFileSync(
      realBinary,
      `#!/bin/bash\nexec "\$(dirname "\$0")/${exeName}.bin" --no-sandbox "$@"\n`,
      { mode: 0o755 }
    );
    console.log(`Created --no-sandbox wrapper for ${exeName}`);
  }
};
