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

## v2 — Next Up

- [ ] Wire up Supabase project and test end-to-end
- [ ] Configure Twilio/Telnyx webhook URLs
- [ ] phonenumbers.bot provider integration
- [ ] Message retry logic on failure
- [ ] Rate limiting on API routes
- [ ] Bulk message operations
- [ ] MMS support
- [ ] Contact import/export
- [ ] Conversation archive/delete

## Mobile Enhancements

- [ ] Offline support (SQLite / MMKV)
- [ ] Background fetch
- [ ] Deep linking
- [ ] App icon + splash screen assets
- [ ] Contact search on mobile

## Desktop Enhancements

- [ ] App icon (tray + window)
- [ ] Code signing
- [ ] Auto-update from GitHub Releases
- [ ] Deep link handler (smshub://)

## Future Features

- [ ] AI auto-replies (OpenAI / local LLMs)
- [ ] Bulk messaging campaigns
- [ ] Outbound webhooks / event system
- [ ] CRM features
- [ ] Team inbox / shared numbers
- [ ] Analytics dashboard
- [ ] Multi-tenant SaaS mode
- [ ] White-label API

## DevOps

- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Deploy backend to Railway
- [ ] Deploy web to Vercel
- [ ] Electron builds (AppImage, dmg, exe)
- [ ] Expo EAS builds (iOS + Android)
- [ ] Staging environment
- [ ] Monitoring / error tracking (Sentry)
