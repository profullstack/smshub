# TODO

## MVP (In Progress)

- [x] Project scaffolding (Next.js 16, TypeScript, TailwindCSS)
- [x] Supabase schema + migrations + RLS
- [x] Provider layer (Twilio + Telnyx) with unified interface
- [x] API routes (send, webhooks, conversations, messages, contacts)
- [x] Auth (login/register with Supabase Auth)
- [x] Inbox UI (sidebar + chat view + realtime)
- [x] Settings page (providers + phone numbers)
- [x] Test suite (24 tests, Vitest)
- [x] Pre-commit hook (tests + typecheck + lint)
- [ ] Wire up Supabase project and test end-to-end
- [ ] Configure Twilio/Telnyx webhook URLs
- [ ] Message status updates (delivery receipts)
- [ ] Unread message indicators
- [ ] New conversation compose flow
- [ ] Contact name editing
- [ ] Search/filter conversations
- [ ] Error toasts / notification UI

## Post-MVP

- [ ] PWA support (service worker, offline cache, push notifications)
- [ ] Keyboard shortcuts (power users)
- [ ] Message retry logic on failure
- [ ] Rate limiting on API routes
- [ ] Bulk message operations

## Desktop (Electron)

- [ ] Electron wrapper setup
- [ ] Native window + tray icon
- [ ] Background notifications
- [ ] Deep linking

## Mobile (React Native)

- [ ] Expo project setup
- [ ] Auth screen
- [ ] Conversations list
- [ ] Chat screen
- [ ] Settings screen
- [ ] Push notifications (Expo / FCM / APNs)
- [ ] Offline support (SQLite or MMKV)

## Future Features

- [ ] MMS support
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
