#!/usr/bin/env bash
#
# Sync version across all packages (root, mobile, electron)
#
# Usage:
#   pnpm version:patch   # 0.1.0 → 0.1.1
#   pnpm version:minor   # 0.1.0 → 0.2.0
#   pnpm version:major   # 0.1.0 → 1.0.0
#   pnpm version:set 2.0.0
#
set -euo pipefail

BUMP_TYPE="${1:-}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

PACKAGES=(
  "$ROOT_DIR/package.json"
  "$ROOT_DIR/mobile/package.json"
  "$ROOT_DIR/electron/package.json"
)

# Get current version from root
CURRENT=$(node -p "require('$ROOT_DIR/package.json').version")

if [ -z "$BUMP_TYPE" ]; then
  echo "Current version: $CURRENT"
  echo ""
  echo "Usage: $0 <patch|minor|major|X.Y.Z>"
  echo ""
  echo "  patch  → bump patch (0.1.0 → 0.1.1)"
  echo "  minor  → bump minor (0.1.0 → 0.2.0)"
  echo "  major  → bump major (0.1.0 → 1.0.0)"
  echo "  X.Y.Z  → set explicit version"
  exit 0
fi

# Calculate new version
if [[ "$BUMP_TYPE" =~ ^[0-9]+\.[0-9]+\.[0-9]+ ]]; then
  NEW_VERSION="$BUMP_TYPE"
else
  IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"
  case "$BUMP_TYPE" in
    patch) PATCH=$((PATCH + 1)) ;;
    minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
    major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
    *) echo "Unknown bump type: $BUMP_TYPE"; exit 1 ;;
  esac
  NEW_VERSION="$MAJOR.$MINOR.$PATCH"
fi

echo "Bumping version: $CURRENT → $NEW_VERSION"
echo ""

# Update all package.json files
for PKG in "${PACKAGES[@]}"; do
  if [ -f "$PKG" ]; then
    # Use node to update version in-place
    node -e "
      const fs = require('fs');
      const pkg = JSON.parse(fs.readFileSync('$PKG', 'utf8'));
      pkg.version = '$NEW_VERSION';
      fs.writeFileSync('$PKG', JSON.stringify(pkg, null, 2) + '\n');
    "
    echo "  ✅ $(echo "$PKG" | sed "s|$ROOT_DIR/||")"
  else
    echo "  ⚠ Skipped $(echo "$PKG" | sed "s|$ROOT_DIR/||") (not found)"
  fi
done

# Update mobile app.json version too
APP_JSON="$ROOT_DIR/mobile/app.json"
if [ -f "$APP_JSON" ]; then
  node -e "
    const fs = require('fs');
    const app = JSON.parse(fs.readFileSync('$APP_JSON', 'utf8'));
    app.expo.version = '$NEW_VERSION';
    fs.writeFileSync('$APP_JSON', JSON.stringify(app, null, 2) + '\n');
  "
  echo "  ✅ mobile/app.json"
fi

echo ""
echo "All packages synced to v$NEW_VERSION"
echo ""
echo "Next steps:"
echo "  git add -A && git commit -m 'release: v$NEW_VERSION'"
echo "  git tag v$NEW_VERSION && git push --tags"
