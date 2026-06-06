# SMSHub /inbox Runtime Stability PRD

## Summary

The `/inbox` page emits console errors during normal use because Supabase Realtime attempts to open a WebSocket connection that is blocked by the current Content Security Policy. The visible impact is that live message updates can fail or degrade, leaving users dependent on manual refreshes or follow-up fetches after sending messages.

Most of the pasted `contentscript.js`, `moz-extension://`, and `inpage.js` warnings appear to come from browser extensions, not from SMSHub application code. They should be tracked as environmental noise unless they reproduce with extensions disabled.

## Problem

`/inbox` subscribes to Supabase Realtime through the browser client in `src/components/inbox-client.tsx`. The site-wide CSP in `next.config.ts` currently sets:

```txt
connect-src 'self' https:
```

Supabase Realtime uses a secure WebSocket URL:

```txt
wss://<project-ref>.supabase.co/realtime/v1/websocket
```

Because `wss:` is not allowed by `connect-src`, the browser blocks the connection and reports:

```txt
Content-Security-Policy: The page's settings blocked the loading of a resource (connect-src) at wss://...supabase.co/realtime/v1/websocket
Uncaught Error: WebSocket not available
```

## Goals

- Restore Supabase Realtime connectivity on `/inbox`.
- Keep the CSP restrictive while allowing the required Supabase WebSocket endpoint.
- Remove app-owned console errors from `/inbox` in a clean browser profile.
- Preserve existing inbox behavior for message loading, sending, read-state updates, and delivery-status updates.

## Non-Goals

- Do not attempt to fix warnings emitted by browser extensions such as MetaMask or other injected content scripts.
- Do not loosen CSP with broad origins unless an environment-specific origin cannot be derived.
- Do not redesign the inbox UI as part of this bug fix.

## Requirements

### Functional Requirements

1. The `/inbox` page must successfully subscribe to Supabase Realtime for `messages` inserts and updates.
2. The CSP `connect-src` directive must allow the configured Supabase Realtime WebSocket endpoint.
3. The allowed WebSocket source should be derived from `NEXT_PUBLIC_SUPABASE_URL` when available, converting `https://` to `wss://`.
4. If the Supabase URL is unavailable at build/config time, the fallback must be documented and intentionally scoped.
5. Browser-extension console warnings must be documented as excluded from app acceptance criteria unless reproducible with extensions disabled.

### Security Requirements

1. Continue to deny framing with `frame-ancestors 'none'` and `X-Frame-Options: DENY`.
2. Continue to restrict default resources to `'self'`.
3. Avoid adding generic `connect-src *`.
4. Keep `https:` for REST/API calls and add only the needed WebSocket allowance for Realtime.

### Test Requirements

1. Add or update a security-header test that asserts `connect-src` includes the Supabase Realtime WebSocket origin or an intentionally scoped `wss:` allowance.
2. Add a regression note or test coverage for `/inbox` Realtime subscription setup where practical.
3. Manually verify `/inbox` in a clean browser profile with extensions disabled.

## Acceptance Criteria

- Visiting `/inbox` no longer logs a CSP violation for `wss://*.supabase.co/realtime/v1/websocket` in a clean browser profile.
- New inbound messages appear in the active inbox without a full-page refresh.
- Delivery-status updates continue to update existing messages in place.
- The CSP header still blocks unapproved script, frame, and connection targets.
- Any remaining `contentscript.js`, `moz-extension://`, `InstallTrigger`, `onmozfullscreen*`, `ObjectMultiplex`, or MetaMask-related warnings are documented as browser-extension noise if they do not reproduce with extensions disabled.

## Implementation Notes

- Primary code path: `next.config.ts`.
- Runtime path using Realtime: `src/components/inbox-client.tsx`.
- Relevant current failure:

```txt
Content-Security-Policy: The page's settings blocked the loading of a resource (connect-src) at wss://sytajbytcdlsbnbkqpyo.supabase.co/realtime/v1/websocket
```

- Recommended approach:

```txt
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
connect-src 'self' https: wss://<project-ref>.supabase.co
```

## Open Questions

- Should local development also allow `ws://localhost:*` for any local Realtime or test harness usage?
- Should Sentry tunneling or other observability endpoints be explicitly included in `connect-src` if enabled?
