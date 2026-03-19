# TODO

## v1 ✅ Complete

- [x] Project scaffolding (Next.js 16, TypeScript, TailwindCSS)
- [x] Supabase schema + migrations + RLS
- [x] Provider layer (Twilio + Telnyx) with unified interface
- [x] API routes (send, webhooks, conversations, messages, contacts)
- [x] Auth (login/register with Supabase Auth)
- [x] Inbox UI (sidebar + chat view + realtime)
- [x] Settings page (providers + phone numbers + delete)
- [x] Test suite (48 tests, Vitest)
- [x] Pre-commit hook (tests + typecheck + lint)
- [x] New conversation compose flow
- [x] Unread message indicators
- [x] Contact name editing
- [x] Search/filter conversations
- [x] Message delivery receipts (Twilio + Telnyx status callbacks)
- [x] Toast notification system
- [x] PWA support (manifest, service worker, offline page)
- [x] Keyboard shortcuts (Ctrl+N, Ctrl+K, arrows, Escape)
- [x] Electron desktop app (window, tray, IPC, notifications, auto-updater)
- [x] React Native mobile app (Expo, chat, push notifications, EAS deploy)
- [x] phonenumbers.bot coming soon page

## v2 ✅ Complete

- [x] Message retry logic on failure (exponential backoff, 3 attempts)
- [x] Rate limiting on API routes (10/min send, 100/min webhooks)
- [x] Bulk message operations (POST /api/messages/bulk-send)
- [x] MMS support (Twilio + Telnyx, inline images in chat)
- [x] Contact import/export (CSV)
- [x] Conversation archive/delete
- [x] phonenumbers.bot provider integration

## Mobile Enhancements ✅ Complete

- [x] Offline support (async-storage + netinfo, outbox queue)
- [x] Background fetch (expo-background-fetch)
- [x] Deep linking (smshub://chat/{id}, smshub://compose?to={phone})
- [x] App icon + splash screen assets
- [x] Contact search on mobile

## Desktop Enhancements ✅ Complete

- [x] App icon (tray + window, platform-aware)
- [x] Code signing (macOS + Windows stubs in electron-builder.yml)
- [x] Auto-update from GitHub Releases
- [x] Deep link handler (smshub://)

## Future Features ✅ Complete

- [x] AI auto-replies (OpenAI gpt-4o-mini, suggest-reply endpoint + UI button)
- [x] Bulk messaging campaigns (campaigns + campaign_recipients tables, CRUD API + UI)
- [x] Outbound webhooks / event system (HMAC-SHA256 signed, async delivery)
- [x] CRM features (contact fields: email, company, notes, tags; contact detail page)
- [x] Team inbox / shared numbers (teams + team_members, RLS for team access)
- [x] Analytics dashboard (/analytics with message stats)
- [x] Multi-tenant SaaS mode (organizations + org_members, org-scoped RLS)
- [x] White-label API (/api/v1/ with API key auth, rate limiting)

## DevOps ✅ Complete

- [x] CI/CD pipeline (GitHub Actions — test + typecheck + lint)
- [x] Deploy to Railway (railway.json + Procfile + deploy workflow)
- [x] Electron builds (AppImage, dmg, exe via GitHub Actions)
- [x] Expo EAS builds (iOS + Android via GitHub Actions)
- [x] Staging environment (deploy-staging.yml on develop branch)
- [x] Monitoring / error tracking (Sentry config — install @sentry/nextjs to activate)

## Remaining Setup (requires credentials/infra)

- [ ] Wire up Supabase project and run all migrations
- [ ] Configure Twilio/Telnyx webhook URLs
- [ ] Set up Railway project and connect repo
- [ ] Configure GitHub Actions secrets (RAILWAY_TOKEN, etc.)
- [ ] Set up Sentry project and add DSN
- [ ] Configure code signing certificates for Electron
- [ ] Set up Expo EAS project
- [ ] Create app icons and splash screen artwork
