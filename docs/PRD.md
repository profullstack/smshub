# 📱 SMSHub — PRD (Unified Desktop + Web + PWA + Mobile)

---

# 1. Overview

**SMSHub** is a **multi-platform, real-time SMS messaging platform** supporting:

* 🖥 Desktop (Electron)
* 🌐 Web App (Next.js)
* 📲 PWA (installable)
* 📱 Mobile (React Native iOS + Android)

It integrates with SMS providers like **Twilio** and **Telnyx** to provide:

* Unified inbox
* Real-time messaging
* Multi-number + multi-provider support
* API-first automation layer

---

# 2. Goals

## Primary

* Unified SMS inbox across all devices
* Real-time send/receive (sub-second updates)
* Provider-agnostic architecture (Twilio + Telnyx)
* Clean, fast, modern UI

## Secondary

* AI-ready messaging workflows
* Offline support (PWA + mobile)
* Multi-tenant SaaS capability

---

# 3. Platforms

| Platform | Tech Stack                      |
| -------- | ------------------------------- |
| Desktop  | Electron + Next.js              |
| Web      | Next.js (App Router)            |
| PWA      | Next.js + Service Worker        |
| Mobile   | React Native (Expo recommended) |
| Backend  | Next.js API routes              |
| Database | Supabase (Postgres + Realtime)  |

---

# 4. Core Features (All Platforms)

## 4.1 Authentication

* Supabase Auth (email/password)
* OAuth (Google optional)
* JWT session handling
* Secure storage (mobile + desktop)

---

## 4.2 Messaging Inbox

* Threaded conversations
* Real-time updates (Supabase Realtime)
* Unread indicators
* Typing state (future)
* Message status (sent/delivered/failed)

---

## 4.3 Send SMS

* Select sender number
* Multi-provider support
* Input validation
* Retry logic

---

## 4.4 Receive SMS

* Webhook ingestion (Twilio + Telnyx)
* Normalize → store → broadcast realtime

---

## 4.5 Contacts

* Auto-create on inbound
* Editable names
* Search + filter

---

## 4.6 Multi-Provider System

```bash
/lib/providers/
  twilio.js
  telnyx.js
  index.js
```

Unified API:

```js
sendSMS({ to, from, body, provider })
```

---

## 4.7 Notifications

| Platform | Notifications            |
| -------- | ------------------------ |
| Desktop  | Native OS notifications  |
| Web      | Browser notifications    |
| PWA      | Push notifications       |
| Mobile   | Push (Expo / FCM / APNs) |

---

# 5. Architecture

## 5.1 High-Level

```txt
Clients (Electron / Web / PWA / Mobile)
        ↓
Next.js API (server-only)
        ↓
Provider Layer (Twilio / Telnyx)
        ↓
Supabase (DB + Realtime + Auth)
```

---

## 5.2 Backend Rules

🚨 NEVER call providers from client

All calls go through:

```bash
/app/api/*
```

---

## 5.3 Realtime

* Supabase Realtime on `messages`
* Channel scoped by user_id
* Broadcast new messages instantly

---

# 6. Database Schema (Supabase)

## Tables

### users

* id
* email

### providers

* id
* user_id
* type (twilio | telnyx)
* api_key (encrypted)
* metadata

### phone_numbers

* id
* user_id
* provider_id
* number

### contacts

* id
* user_id
* phone
* name

### conversations

* id
* user_id
* contact_id
* last_message_at

### messages

* id
* conversation_id
* direction (inbound | outbound)
* body
* status
* provider
* provider_message_id
* created_at

---

# 7. API Design

## Send SMS

```
POST /api/messages/send
```

## Webhooks

```
POST /api/webhooks/twilio
POST /api/webhooks/telnyx
```

## Get Conversations

```
GET /api/conversations
```

## Get Messages

```
GET /api/messages?conversation_id=
```

---

# 8. Desktop App (Electron)

## Features

* Native window
* Tray icon
* Background notifications
* Deep linking (future)

## Structure

```bash
/electron
  main.js
  preload.js
```

---

# 9. Web App (Next.js)

## Requirements

* Fully responsive
* SSR for initial load speed
* Auth-protected routes
* Keyboard shortcuts (power users)

---

# 10. PWA Requirements

## Must Have

* Installable (Add to Home Screen)
* Offline mode (view cached conversations)
* Background sync (send queued messages)
* Push notifications

## Tech

* Service Worker
* IndexedDB (for offline cache)

---

# 11. Mobile App (React Native)

## Stack

* React Native (Expo preferred)
* Supabase client (auth + realtime)
* Native push notifications

---

## Core Screens

### 1. Auth Screen

* Login / Register

### 2. Conversations List

* Scrollable list
* Search
* Unread badges

### 3. Chat Screen

* Messages
* Input box
* Send button

### 4. Settings

* Provider keys
* Phone numbers
* Logout

---

## Mobile Features

* Push notifications (Expo)
* Background fetch
* Offline support (SQLite or MMKV)
* Deep linking

---

# 12. UI/UX Design

## Layout

```txt
---------------------------------
| Sidebar | Conversation | Input |
---------------------------------
```

## Design System

* TailwindCSS
* Dark mode default
* Minimal, developer-focused UI

---

# 13. Security

* API keys encrypted at rest
* Server-only provider calls
* Rate limiting
* Webhook signature validation (Twilio/Telnyx)
* Secure storage (mobile keychain)

---

# 14. Deployment

## Backend

* Railway (Next.js API)

## Database

* Supabase Cloud

## Web

* Vercel or Railway

## Desktop

* Electron build (AppImage, dmg, exe)

## Mobile

* Expo EAS build

---

# 15. Future Features

* MMS support
* AI auto-replies (OpenAI / local LLMs)
* Bulk messaging campaigns
* Webhooks for outbound events
* CRM features
* Team inbox / shared numbers
* Analytics dashboard

---

# 16. Monetization

* Free tier (1 number)
* Paid tiers ($15–$49/mo)
* Usage-based pricing
* White-label API

---

# 17. MVP Scope

## Must Have

* Auth
* Send SMS (Twilio + Telnyx)
* Receive SMS (webhooks)
* Inbox UI (all platforms)
* Realtime updates

## Not Required (v1)

* MMS
* AI
* Campaigns
* Teams

---

# 18. Risks

* Carrier filtering / compliance (A2P 10DLC)
* Provider downtime
* Rate limits
* Mobile push reliability

---

# 19. Success Metrics

* Daily active users
* Messages sent
* Time to first message
* Retention (7/30 day)

---

# 🚀 Final Summary

SMSHub is a **cross-platform SMS communication layer**:

* Desktop (Electron)
* Web + PWA (Next.js)
* Mobile (React Native)
* Backend (Supabase + API routes)
* Providers (Twilio + Telnyx)

Designed to evolve into:
👉 AI messaging platform
👉 automation engine
👉 full SaaS communications stack

---

