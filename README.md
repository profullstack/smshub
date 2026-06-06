# SMSHub

<p align="center">
  <img src="./public/banner.png" alt="SMSHub logo"  />
</p>

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Realtime-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![Expo](https://img.shields.io/badge/Expo-React%20Native-000020?logo=expo&logoColor=white)](https://expo.dev/)
[![Electron](https://img.shields.io/badge/Electron-Desktop-47848F?logo=electron&logoColor=white)](https://electronjs.org/)
[![Tests](https://img.shields.io/badge/Tests-110%20unit%20%2B%20e2e-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

A multi-platform, real-time SMS messaging platform with unified inbox, multi-provider support (Twilio + Telnyx), and an API-first architecture.

> **🚀 Coming Soon:** [phonenumbers.bot](https://phonenumbers.bot) — Real SIM phone numbers with a developer-first API

## Platforms

| Platform | Tech | Status |
|---|---|---|
| 🌐 Web | Next.js 16 (App Router) | ✅ v1 |
| 📲 PWA | Service Worker + Manifest | ✅ v1 |
| 📱 iOS | React Native (Expo) | ✅ v1 |
| 🤖 Android | React Native (Expo) | ✅ v1 |
| 🖥 Desktop | Electron | ✅ v1 |

## Features

- **Unified Inbox** — Threaded conversations across all devices
- **Real-time Messaging** — Sub-second updates via Supabase Realtime
- **Multi-Provider** — Twilio + Telnyx with unified API (`sendSMS()`)
- **Compose Flow** — New message modal with sender number picker
- **Unread Tracking** — Badge counts, auto-mark read on open
- **Search** — Filter conversations by name or phone number
- **Contact Management** — Auto-create on inbound, inline name editing
- **Delivery Receipts** — Live status updates (queued → sent → delivered → failed)
- **Keyboard Shortcuts** — Ctrl+N (compose), Ctrl+K (search), arrows, Escape
- **Push Notifications** — Native on mobile (Expo), OS notifications on desktop (Electron)
- **PWA** — Installable, offline support, background sync
- **Dark Mode** — Default, developer-focused UI

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, TailwindCSS |
| Mobile | React Native, Expo, expo-router |
| Desktop | Electron, electron-builder |
| Backend | Next.js API routes |
| Database | Supabase (Postgres + Realtime + Auth + RLS) |
| Providers | Twilio, Telnyx |
| Testing | Vitest (110 tests), Playwright e2e |
| CI | Husky pre-commit (tests + typecheck + lint) |
| Mobile Deploy | Expo EAS (expo.dev) |
| Desktop Build | electron-builder (AppImage, dmg, NSIS) |

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm
- A [Supabase](https://supabase.com) project
- Twilio and/or Telnyx account(s)

### Setup

```bash
# Install dependencies
pnpm install

# Copy env file and fill in your values
cp .env.example .env

# Run database migrations against your Supabase project
# (paste supabase/migrations/*.sql into the Supabase SQL editor)

# Start dev server
pnpm dev
```

### Mobile (Expo)

```bash
cd mobile
pnpm install
npx expo start

# Build for iOS/Android via Expo EAS
eas build --profile production --platform all
```

### Desktop (Electron)

```bash
cd electron
pnpm install
pnpm dev

# Package distributable
pnpm package
```

### Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only) |
| `TWILIO_ACCOUNT_SID` | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token |
| `TELNYX_API_KEY` | Telnyx API Key |
| `TELNYX_PUBLIC_KEY` | Telnyx Public Key (webhook verification) |
| `NEXT_PUBLIC_APP_URL` | App URL (default: `http://localhost:3000`) |

## Project Structure

```
src/                          # Web app (Next.js)
├── app/
│   ├── api/
│   │   ├── contacts/         # GET, PATCH /api/contacts/[id]
│   │   ├── conversations/    # GET, POST /api/conversations/[id]/read
│   │   ├── messages/         # GET, POST /api/messages/send
│   │   ├── providers/        # DELETE /api/providers/[id]
│   │   ├── phone-numbers/    # DELETE /api/phone-numbers/[id]
│   │   └── webhooks/         # Twilio + Telnyx inbound & status callbacks
│   ├── login/                # Login page
│   ├── register/             # Register page
│   ├── settings/             # Provider & phone number management
│   ├── phonenumbers/         # phonenumbers.bot coming soon page
│   └── offline/              # PWA offline fallback
├── components/
│   ├── inbox-client.tsx      # Main inbox (sidebar + chat + realtime)
│   ├── new-message-modal.tsx # Compose new conversation
│   ├── contact-name-editor.tsx
│   ├── toast-container.tsx   # Toast notifications
│   └── sw-register.tsx       # Service worker registration
├── contexts/
│   └── toast-context.tsx     # Global toast state
├── lib/
│   ├── providers/            # Twilio + Telnyx unified layer
│   ├── supabase/             # Client/server/middleware helpers
│   └── types/                # TypeScript definitions
├── middleware.ts              # Auth guard
mobile/                        # React Native (Expo)
├── app/                       # expo-router screens
│   ├── (tabs)/                # Inbox + Settings tabs
│   ├── chat/[id].tsx          # Chat screen
│   └── auth.tsx               # Login/register
├── lib/                       # Supabase, API client, notifications
└── eas.json                   # Expo EAS build profiles
electron/                      # Desktop app
├── main.ts                    # Window + tray + IPC
├── preload.ts                 # Renderer bridge
├── notifications.ts           # Supabase Realtime → OS notifications
├── updater.ts                 # Auto-updater
└── electron-builder.yml       # Build config
supabase/
└── migrations/                # 001_initial_schema + 002_unread_tracking
```

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/messages/send` | Send an SMS |
| `GET` | `/api/messages?conversation_id=` | Get messages for a conversation |
| `GET` | `/api/conversations` | List conversations |
| `POST` | `/api/conversations/[id]/read` | Mark conversation as read |
| `GET` | `/api/contacts` | List contacts |
| `PATCH` | `/api/contacts/[id]` | Update contact name |
| `DELETE` | `/api/providers/[id]` | Delete a provider |
| `DELETE` | `/api/phone-numbers/[id]` | Delete a phone number |
| `POST` | `/api/webhooks/twilio` | Twilio inbound webhook |
| `POST` | `/api/webhooks/telnyx` | Telnyx inbound webhook |
| `POST` | `/api/webhooks/twilio/status` | Twilio delivery status callback |
| `POST` | `/api/webhooks/telnyx/status` | Telnyx delivery status callback |

## Scripts

```bash
pnpm dev              # Start development server
pnpm build            # Production build
pnpm start            # Start production server
pnpm test             # Run unit and contract tests
pnpm test:e2e         # Run Playwright e2e tests
pnpm test:watch       # Run tests in watch mode
pnpm test:coverage    # Run tests with coverage
pnpm lint             # Lint source files
pnpm typecheck        # TypeScript type checking
```

## Pre-commit Hook

Every commit automatically runs:
1. 🧪 **Tests** — `vitest run`
2. 🔍 **Type check** — `tsc --noEmit`
3. ✨ **Lint** — `eslint --fix` on staged `.ts/.tsx` files

## Database Schema

Tables: `providers`, `phone_numbers`, `contacts`, `conversations`, `messages`

- Row Level Security (RLS) on all tables
- Realtime enabled on `messages` and `conversations`
- Unread tracking via `last_read_at` + computed count

See `supabase/migrations/` for the full schema.

## Contributing

PRs welcome! Please ensure all checks pass before submitting:

```bash
pnpm test && pnpm test:e2e && pnpm typecheck && pnpm lint
```

## License

MIT
