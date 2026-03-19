#!/bin/bash
# ===========================================
# SMSHub Desktop App Installer
# ===========================================
# Usage: curl -fsSL https://smshub.dev/install.sh | bash
# ===========================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

GITHUB_REPO="profullstack/smshub"
INSTALL_DIR="${SMSHUB_INSTALL_DIR:-$HOME/.smshub}"
BIN_DIR="${SMSHUB_BIN_DIR:-$HOME/.local/bin}"
APPLICATIONS_DIR="/Applications"

print_banner() {
    echo -e "${BLUE}"
    echo "  ____  __  __ ____  _   _       _     "
    echo " / ___||  \/  / ___|| | | |_   _| |__  "
    echo " \___ \| |\/| \___ \| |_| | | | | '_ \ "
    echo "  ___) | |  | |___) |  _  | |_| | |_) |"
    echo " |____/|_|  |_|____/|_| |_|\__,_|_.__/ "
    echo -e "${NC}"
    echo "  Desktop App Installer"
    echo ""
}

info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

detect_platform() {
    local os arch
    case "$(uname -s)" in
        Linux*)  os="linux";;
        Darwin*) os="darwin";;
        MINGW*|MSYS*|CYGWIN*) os="windows";;
        *) error "Unsupported OS: $(uname -s)";;
    esac
    case "$(uname -m)" in
        x86_64|amd64) arch="x64";;
        arm64|aarch64) arch="arm64";;
        *) error "Unsupported arch: $(uname -m)";;
    esac
    echo "${os}-${arch}"
}

get_latest_version() {
    local version
    version=$(curl -fsSL "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" 2>/dev/null \
        | grep -o '"tag_name": *"[^"]*"' | head -1 | cut -d'"' -f4 | sed 's/^v//')
    [ -z "$version" ] && error "Failed to fetch latest version"
    echo "$version"
}

install_macos() {
    local version="$1" arch="$2"
    local filename="SMSHub-${version}-${arch}.dmg"
    local url="https://github.com/${GITHUB_REPO}/releases/download/v${version}/${filename}"
    local temp_dir=$(mktemp -d)
    trap "rm -rf $temp_dir" EXIT

    info "Downloading SMSHub ${version} for macOS..."
    curl -fL --progress-bar "$url" -o "${temp_dir}/SMSHub.dmg" || error "Download failed"

    info "Mounting DMG..."
    local mount_point=$(hdiutil attach "${temp_dir}/SMSHub.dmg" -nobrowse -quiet | tail -1 | awk '{print $NF}')

    [ -d "${APPLICATIONS_DIR}/SMSHub.app" ] && rm -rf "${APPLICATIONS_DIR}/SMSHub.app"
    cp -R "${mount_point}/SMSHub.app" "${APPLICATIONS_DIR}/"
    hdiutil detach "$mount_point" -quiet 2>/dev/null

    mkdir -p "$BIN_DIR"
    cat > "$BIN_DIR/smshub" << 'WRAPPER'
#!/bin/bash
APP="/Applications/SMSHub.app/Contents/MacOS/SMSHub"
case "${1-}" in
    -v|--version) echo "smshub $(defaults read /Applications/SMSHub.app/Contents/Info.plist CFBundleShortVersionString 2>/dev/null || echo unknown)"; exit 0;;
    update) echo "Updating..."; curl -fsSL https://smshub.dev/install.sh | bash; exit $?;;
    uninstall) rm -rf /Applications/SMSHub.app ~/.local/bin/smshub; echo "Uninstalled."; exit 0;;
esac
exec "$APP" "$@"
WRAPPER
    chmod +x "$BIN_DIR/smshub"
    success "SMSHub installed to ${APPLICATIONS_DIR}/SMSHub.app"
}

install_linux() {
    local version="$1" arch="$2"
    local filename
    [ "$arch" = "arm64" ] && filename="SMSHub-${version}-arm64.AppImage" || filename="SMSHub-${version}.AppImage"
    local url="https://github.com/${GITHUB_REPO}/releases/download/v${version}/${filename}"
    local appimage_path="${INSTALL_DIR}/SMSHub.AppImage"

    mkdir -p "$INSTALL_DIR"
    info "Downloading SMSHub ${version} for Linux..."
    curl -fL --progress-bar "$url" -o "$appimage_path" || error "Download failed"
    chmod +x "$appimage_path"

    mkdir -p "$BIN_DIR"
    cat > "$BIN_DIR/smshub" << WRAPPER
#!/bin/bash
VERSION="${version}"
APPIMAGE="\$HOME/.smshub/SMSHub.AppImage"

case "\${1-}" in
    -h|--help)
        echo "Usage: smshub [options]"
        echo ""
        echo "SMSHub — Multi-platform SMS messaging"
        echo ""
        echo "  -v, --version    Show version"
        echo "  update           Update to latest version"
        echo "  uninstall        Remove SMSHub"
        exit 0;;
    -v|--version) echo "smshub \$VERSION"; exit 0;;
    update)
        echo "Checking for updates..."
        LATEST=\$(curl -fsSL "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" 2>/dev/null | grep -o '"tag_name": *"[^"]*"' | head -1 | cut -d'"' -f4 | sed 's/^v//')
        echo "  Current: \$VERSION"
        echo "  Latest:  \$LATEST"
        [ "\$VERSION" = "\$LATEST" ] && echo "Already up to date." && exit 0
        curl -fsSL https://smshub.dev/install.sh | bash
        exit \$?;;
    uninstall)
        echo "Uninstalling SMSHub..."
        pkill -f "SMSHub.AppImage" 2>/dev/null || true
        rm -rf "\$HOME/.smshub"
        rm -f "\$HOME/.local/share/applications/smshub.desktop"
        rm -f "\$HOME/.local/bin/smshub"
        echo "Done."
        exit 0;;
esac

if [ -x "\$APPIMAGE" ]; then
    export ELECTRON_DISABLE_SANDBOX=1
    unset ELECTRON_RUN_AS_NODE
    exec "\$APPIMAGE" --no-sandbox "\$@"
else
    echo "SMSHub not found. Reinstall: curl -fsSL https://smshub.dev/install.sh | bash"
    exit 1
fi
WRAPPER
    chmod +x "$BIN_DIR/smshub"

    # Desktop entry
    local desktop_dir="$HOME/.local/share/applications"
    mkdir -p "$desktop_dir"
    cat > "$desktop_dir/smshub.desktop" << DESKTOP
[Desktop Entry]
Name=SMSHub
Comment=Multi-platform SMS messaging
Exec=$BIN_DIR/smshub %U
Icon=smshub
Terminal=false
Type=Application
Categories=Network;Chat;
StartupWMClass=SMSHub
DESKTOP
    update-desktop-database "$desktop_dir" 2>/dev/null || true

    success "SMSHub ${version} installed to ${INSTALL_DIR}"
}

setup_path() {
    if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
        local rc=""
        [ -f "$HOME/.bashrc" ] && rc="$HOME/.bashrc"
        [ -f "$HOME/.zshrc" ] && rc="$HOME/.zshrc"
        if [ -n "$rc" ] && ! grep -q "$BIN_DIR" "$rc" 2>/dev/null; then
            echo "" >> "$rc"
            echo "# SMSHub" >> "$rc"
            echo "export PATH=\"\$PATH:$BIN_DIR\"" >> "$rc"
            warn "Added $BIN_DIR to PATH in $rc"
            warn "Run 'source $rc' or restart your terminal"
        fi
    fi
}

main() {
    print_banner
    info "Detecting platform..."
    local platform=$(detect_platform)
    info "Platform: ${platform}"

    info "Fetching latest version..."
    local version=$(get_latest_version)
    info "Version: ${version}"

    local os=$(echo "$platform" | cut -d'-' -f1)
    local arch=$(echo "$platform" | cut -d'-' -f2)

    case "$os" in
        darwin) install_macos "$version" "$arch";;
        linux)  install_linux "$version" "$arch";;
        *) error "Unsupported: $os";;
    esac

    setup_path

    echo ""
    success "Installation complete!"
    echo ""
    echo "  Run 'smshub' to launch"
    echo "  Run 'smshub update' to update"
    echo "  Run 'smshub uninstall' to remove"
    echo ""
}

main "$@"
