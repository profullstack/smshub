# SMSHub Desktop (Electron)

Native desktop app for SMSHub — wraps the Next.js web app with native OS notifications, tray icon, auto-updates, and deep linking.

## Prerequisites

- Node.js 20+
- The main SMSHub Next.js app (parent directory)

## Setup

```bash
cd electron
npm install
```

### Environment Variables

Create a `.env` file in the `electron/` directory (or set env vars):

```env
# App URL — defaults to http://localhost:3000 in dev
APP_URL=http://localhost:3000

# Supabase config (for realtime notifications in main process)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Development

1. Start the Next.js dev server from the project root:

```bash
cd ..
npm run dev
```

2. In a separate terminal, run the Electron app:

```bash
cd electron
npm run dev
```

This compiles TypeScript and launches Electron pointing at `http://localhost:3000`.

## Architecture

```
electron/
├── main.ts              # Main process — window, tray, IPC, deep links
├── preload.ts           # Context bridge — exposes safe APIs to renderer
├── config.ts            # Environment/config loading
├── notifications.ts     # Supabase Realtime → native OS notifications
├── updater.ts           # Auto-update via electron-updater (GitHub Releases)
├── assets/              # Icon descriptions/placeholders
├── tsconfig.json        # TypeScript config (outputs to dist/)
├── package.json         # Electron-specific deps and scripts
└── electron-builder.yml # Build/packaging/signing/protocol config
```

### Key Features

- **Native Notifications**: Connects to Supabase Realtime from the main process. Inbound SMS triggers OS-level notifications. Clicking a notification focuses the window and navigates to the conversation.
- **Tray Icon**: App minimizes to system tray on close. Right-click for context menu.
- **IPC Bridge**: Renderer can control window (minimize/maximize/close), get app version, and receive real-time message events via the preload bridge.
- **Auto-Updater**: Checks GitHub Releases for updates on launch and every 4 hours. Prompts user to download and install. Sends IPC events (`update-available`, `update-progress`, `update-downloaded`, `update-error`) for in-app UI.
- **Deep Linking**: Registers `smshub://` protocol handler. Supports `smshub://chat/{id}` and `smshub://compose?to={phone}`.

## Building for Distribution

### All platforms

```bash
npm run package
```

### Platform-specific

```bash
npm run package:linux   # → AppImage
npm run package:mac     # → dmg (x64 + arm64)
npm run package:win     # → NSIS installer
```

Build output goes to `electron/release/`.

### Production Build Steps

1. Build the Next.js app with static export:

```bash
cd ..
npm run build    # generates /out directory
```

2. Package the Electron app (bundles the Next.js output):

```bash
cd electron
npm run package
```

The electron-builder config copies `../out` into the app as the `renderer/` directory, which the production build loads via `file://` protocol.

### Icons

Place platform icons in `electron/resources/`:

- `icon.icns` — macOS
- `icon.ico` — Windows
- `icons/` directory with PNGs (256x256, 512x512) — Linux
- `tray-iconTemplate.png` — macOS tray (22x22, white on transparent)
- `tray-icon.png` — Windows/Linux tray (22x22)

Generate icons from a 1024x1024 source PNG:

```bash
npx electron-icon-builder --input=source-icon.png --output=resources/
```

## Code Signing

Code signing is required for distribution. Without it, macOS Gatekeeper and Windows SmartScreen will warn or block installation.

### macOS Code Signing

1. **Get an Apple Developer certificate** from [developer.apple.com](https://developer.apple.com/account/resources/certificates/list)
   - Type: "Developer ID Application" (for distribution outside App Store)

2. **Export as .p12** from Keychain Access

3. **Set environment variables** in CI:

```env
# Path to .p12 file, or base64-encoded certificate
CSC_LINK=/path/to/certificate.p12
# or: CSC_LINK=base64://...

# Certificate password
CSC_KEY_PASSWORD=your-certificate-password
```

4. **For notarization** (recommended for macOS 10.15+):

```env
APPLE_ID=your@apple.id
APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
APPLE_TEAM_ID=XXXXXXXXXX
```

Then set `notarize: true` in `electron-builder.yml` and create `resources/entitlements.mac.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>com.apple.security.cs.allow-dyld-environment-variables</key>
    <true/>
  </dict>
</plist>
```

### Windows Code Signing

1. **Get a code signing certificate** from a trusted CA (DigiCert, Sectigo, etc.)
   - EV certificates provide immediate SmartScreen reputation
   - OV certificates build reputation over time

2. **Set environment variables** in CI:

```env
# Path to .pfx file, or base64-encoded certificate
CSC_LINK=/path/to/certificate.pfx
# or: CSC_LINK=base64://...

# Certificate password
CSC_KEY_PASSWORD=your-certificate-password
```

Alternatively, configure directly in `electron-builder.yml` under `nsis`:

```yaml
nsis:
  certificateFile: path/to/certificate.pfx
  certificatePassword: ${env.WIN_CSC_KEY_PASSWORD}
```

### Linux

No code signing required for AppImage distribution. For Snap/Flatpak, see their respective signing docs.

### CI/CD Example (GitHub Actions)

```yaml
- name: Build & Sign
  env:
    CSC_LINK: ${{ secrets.CSC_LINK }}
    CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
    APPLE_ID: ${{ secrets.APPLE_ID }}
    APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
    APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
  run: |
    cd electron
    npm run package
```

## Deep Linking

The app registers `smshub://` as a custom protocol handler.

### Supported URLs

| URL | Action |
|-----|--------|
| `smshub://chat/{conversationId}` | Open a specific conversation |
| `smshub://compose?to={phone}` | Open compose with pre-filled recipient |
| `smshub://compose` | Open compose (empty) |

### How it works

- **macOS**: Registered via `app.setAsDefaultProtocolClient()` and handled in `open-url` event
- **Windows/Linux**: Registered in `electron-builder.yml` under `protocols`. Second instance passes URL via `second-instance` event
- **Single instance**: Only one app window runs. Deep links from a second launch are forwarded to the existing window

### Testing Deep Links

```bash
# macOS
open smshub://chat/abc123

# Linux
xdg-open smshub://chat/abc123

# Windows
start smshub://chat/abc123
```

## Renderer API (window.electron)

The preload script exposes these methods to the web app:

```typescript
// Notifications
window.electron.sendNotification(title, body)

// App info
window.electron.getVersion()  // async

// Window controls
window.electron.minimize()
window.electron.maximize()
window.electron.close()

// Event listeners
window.electron.onNewMessage(callback)       // Realtime messages from main process
window.electron.onNavigate(callback)         // Deep link navigation events
window.electron.onUpdateAvailable(callback)  // { version, releaseDate?, releaseNotes? }
window.electron.onUpdateProgress(callback)   // percent (number)
window.electron.onUpdateDownloaded(callback) // { version }
window.electron.onUpdateError(callback)      // { message }
```

## Dependencies

| Package | Purpose |
|---------|---------|
| `electron` | Desktop runtime |
| `electron-builder` | Packaging & distribution |
| `electron-updater` | Auto-update from GitHub Releases |
| `@supabase/supabase-js` | Realtime subscription for notifications |
| `typescript` | Build tooling |
