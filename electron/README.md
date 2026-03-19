# SMSHub — Electron Desktop App

## Overview

Wraps the Next.js web app in a native desktop window with:
- System tray icon
- Native OS notifications
- Background running (minimize to tray)
- Deep linking (future)

## Setup

```bash
# From project root
pnpm add -D electron electron-builder

# Build the Next.js app first
pnpm build

# Run Electron in dev mode
pnpm electron:dev

# Build distributable
pnpm electron:build
```

## TODO

- [ ] Add app icon (tray + window)
- [ ] Native notification forwarding from Supabase Realtime
- [ ] Auto-updater
- [ ] Deep link handler (smshub://)
- [ ] Build configs for AppImage, dmg, exe
- [ ] Code signing
