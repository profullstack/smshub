#!/usr/bin/env bash
# expo-modules-core ships raw .ts as "main" which Node can't load.
# EAS builds happen remotely; we just need config resolution to not crash.
# Used by CI (.github/workflows/mobile.yml) and the eas-build-post-install hook.
set -e
EMC_DIR=$(find node_modules -path '*/expo-modules-core/src/index.ts' -print -quit 2>/dev/null | xargs dirname 2>/dev/null || true)
if [ -n "$EMC_DIR" ]; then
  echo "module.exports = {};" > "$EMC_DIR/index.js"
  sed -i 's|"main": "src/index.ts"|"main": "src/index.js"|' "$EMC_DIR/../package.json"
  echo "Patched expo-modules-core at $EMC_DIR"
else
  echo "expo-modules-core not found under node_modules — nothing to patch"
fi
