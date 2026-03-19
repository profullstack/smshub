# SMSHub — Mobile App (React Native / Expo)

## Overview

Native iOS + Android app built with Expo and expo-router. Shares the same Supabase backend as the web app.

## Screens

- **Auth** — Login / Register
- **Inbox** — Conversations list with realtime updates
- **Settings** — Provider management, logout

## Setup

```bash
cd mobile
npm install  # or pnpm install

# Create .env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Start dev
npx expo start
```

## Build

```bash
# Install EAS CLI
npm install -g eas-cli

# Build for iOS
eas build --platform ios

# Build for Android
eas build --platform android
```

## TODO

- [ ] Chat screen (message list + input)
- [ ] Push notifications (Expo Notifications)
- [ ] Contact search
- [ ] Unread badges
- [ ] Offline support (SQLite / MMKV)
- [ ] Background fetch
- [ ] Deep linking
- [ ] App icon + splash screen
