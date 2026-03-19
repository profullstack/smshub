# 📱 SMSHub

A multi-platform, real-time SMS messaging platform with unified inbox, multi-provider support (Twilio + Telnyx), and an API-first architecture.

## Tech Stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, TailwindCSS
- **Backend:** Next.js API routes
- **Database:** Supabase (Postgres + Realtime + Auth)
- **SMS Providers:** Twilio, Telnyx
- **Testing:** Vitest
- **Linting:** ESLint + lint-staged + Husky pre-commit hooks

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

# Run the database migration against your Supabase project
# (paste supabase/migrations/001_initial_schema.sql into the Supabase SQL editor)

# Start dev server
pnpm dev
```

### Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only) |
| `TWILIO_ACCOUNT_SID` | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token |
| `TELNYX_API_KEY` | Telnyx API Key |
| `TELNYX_PUBLIC_KEY` | Telnyx Public Key (webhook verification) |
| `NEXT_PUBLIC_APP_URL` | App URL (default: `http://localhost:3000`) |

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── contacts/          # GET /api/contacts
│   │   ├── conversations/     # GET /api/conversations
│   │   ├── messages/          # GET /api/messages, POST /api/messages/send
│   │   └── webhooks/          # POST /api/webhooks/twilio, /api/webhooks/telnyx
│   ├── login/                 # Login page
│   ├── register/              # Register page
│   ├── settings/              # Provider & phone number management
│   ├── layout.tsx             # Root layout (dark mode)
│   └── page.tsx               # Main inbox
├── components/
│   └── inbox-client.tsx       # Inbox UI (conversations sidebar + chat view)
├── lib/
│   ├── providers/             # SMS provider layer
│   │   ├── twilio.ts          # Twilio send/parse/validate
│   │   ├── telnyx.ts          # Telnyx send/parse/validate
│   │   ├── index.ts           # Unified sendSMS() + getProvider()
│   │   └── types.ts           # Provider interfaces
│   ├── supabase/              # Supabase client/server/middleware helpers
│   └── types/
│       └── database.ts        # Database type definitions
├── middleware.ts               # Auth guard middleware
supabase/
└── migrations/
    └── 001_initial_schema.sql  # Full schema with RLS policies
```

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/messages/send` | Send an SMS |
| `POST` | `/api/webhooks/twilio` | Twilio inbound webhook |
| `POST` | `/api/webhooks/telnyx` | Telnyx inbound webhook |
| `GET` | `/api/conversations` | List conversations |
| `GET` | `/api/messages?conversation_id=` | Get messages for a conversation |
| `GET` | `/api/contacts` | List contacts |

## Scripts

```bash
pnpm dev              # Start development server
pnpm build            # Production build
pnpm start            # Start production server
pnpm test             # Run tests
pnpm test:watch       # Run tests in watch mode
pnpm test:coverage    # Run tests with coverage
pnpm lint             # Lint source files
pnpm typecheck        # TypeScript type checking
```

## Pre-commit Hook

Every commit automatically runs:
1. **Tests** — `vitest run`
2. **Type check** — `tsc --noEmit`
3. **Lint** — `eslint --fix` on staged `.ts/.tsx` files

## Database Schema

Tables: `providers`, `phone_numbers`, `contacts`, `conversations`, `messages`

All tables have Row Level Security (RLS) enabled. Realtime is enabled on `messages` and `conversations`.

See `supabase/migrations/001_initial_schema.sql` for the full schema.

## License

MIT
