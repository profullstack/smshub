# SMSHub — Mobile App (React Native / Expo)

## Overview

Native iOS + Android app built with Expo and expo-router. Shares the same Supabase backend as the web app.

## Screens

- **Auth** — Login / Register with Supabase Auth
- **Inbox** — Conversations list with realtime updates, unread indicators, pull-to-refresh, new conversation FAB
- **Chat** — Full messaging with send/receive, realtime updates, message status
- **Settings** — Provider listing, phone numbers, user info, logout

## Setup

```bash
cd mobile
pnpm install

# Create .env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EXPO_PUBLIC_API_URL=https://smshub.example.com
EXPO_PUBLIC_PROJECT_ID=your-expo-project-id

# Start dev
npx expo start
```

## Deploying with Expo EAS

All builds and submissions go through [Expo Application Services (EAS)](https://expo.dev).

### First-time setup

```bash
# Install EAS CLI globally
npm install -g eas-cli

# Login to your Expo account
eas login

# Link this project to Expo
eas init
```

### Build profiles (see eas.json)

| Profile | Use case | iOS | Android |
|---|---|---|---|
| `development` | Dev client with simulator | Simulator build | APK |
| `preview` | Internal testing | Device build | APK |
| `production` | App Store / Play Store | Optimized | AAB |

### Building

```bash
# Development build (for testing with Expo Dev Client)
eas build --profile development --platform ios
eas build --profile development --platform android

# Preview build (internal distribution)
eas build --profile preview --platform ios
eas build --profile preview --platform android

# Production build
eas build --profile production --platform ios
eas build --profile production --platform android

# Build both platforms at once
eas build --profile production --platform all
```

### Submitting to stores

```bash
# Submit to Apple App Store (fill in eas.json submit config first)
eas submit --platform ios

# Submit to Google Play Store
eas submit --platform android
```

### OTA Updates

```bash
# Push an over-the-air update (no rebuild needed for JS changes)
eas update --branch production --message "Bug fix"
```

## Push Notifications

Push notifications use `expo-notifications` and are registered automatically on login.

- Tokens are stored in the `push_tokens` table in Supabase
- Notification taps navigate to the relevant conversation
- Tokens are cleaned up on logout

## Environment Variables

| Variable | Description |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `EXPO_PUBLIC_API_URL` | Web app API URL |
| `EXPO_PUBLIC_PROJECT_ID` | Expo project ID (for push tokens) |
