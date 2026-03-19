# SMSHub Desktop (Electron)

Native desktop app for SMSHub — wraps the Next.js web app with native OS notifications, tray icon, and auto-updates.

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
├── main.ts            # Main process — window, tray, IPC handlers
├── preload.ts         # Context bridge — exposes safe APIs to renderer
├── config.ts          # Environment/config loading
├── notifications.ts   # Supabase Realtime → native OS notifications
├── updater.ts         # Auto-update via electron-updater
├── tsconfig.json      # TypeScript config (outputs to dist/)
├── package.json       # Electron-specific deps and scripts
└── electron-builder.yml  # Build/packaging config
```

### Key Features

- **Native Notifications**: Connects to Supabase Realtime from the main process. Inbound SMS triggers OS-level notifications. Clicking a notification focuses the window and navigates to the conversation.
- **Tray Icon**: App minimizes to system tray on close. Right-click for context menu.
- **IPC Bridge**: Renderer can control window (minimize/maximize/close), get app version, and receive real-time message events via the preload bridge.
- **Auto-Updater**: Checks GitHub Releases for updates on launch. Prompts user to download and install.

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

## Dependencies

| Package | Purpose |
|---------|---------|
| `electron` | Desktop runtime |
| `electron-builder` | Packaging & distribution |
| `electron-updater` | Auto-update from GitHub Releases |
| `@supabase/supabase-js` | Realtime subscription for notifications |
| `typescript` | Build tooling |

## Renderer API (window.electron)

The preload script exposes these methods to the web app:

```typescript
window.electron.sendNotification(title, body)  // Trigger native notification
window.electron.getVersion()                     // Get app version (async)
window.electron.minimize()                       // Minimize window
window.electron.maximize()                       // Toggle maximize
window.electron.close()                          // Close (minimizes to tray)
window.electron.onNewMessage(callback)           // Listen for realtime messages
```
