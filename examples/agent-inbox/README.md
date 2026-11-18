# Agent inbox quickstart

Give a script or an AI agent its own US number on [smshub.dev](https://smshub.dev/agents) and read the
one-time codes sent to it. Two small Node scripts, no dependencies (Node 18 or newer):

| File | What it does |
| --- | --- |
| `wait-for-code.mjs` | Lists your numbers, or waits for the next text with a code on one of them and prints the code. REST API. |
| `webhook-receiver.mjs` | An HTTP server that checks smshub's webhook signature and prints every `message.received` event. |

## Read this first

- **Receive-only.** Rented numbers receive texts. They do not send texts or take calls. Sending needs your
  own Twilio or Telnyx number connected to smshub.
- **US numbers only**, $5 per number per month (the live price is on [/numbers](https://smshub.dev/numbers)).
- **Some services reject VoIP numbers.** We cannot promise that a particular site will accept the number or
  send a code to it.
- **Payment is crypto** (USDC, USDT, BTC, ETH and others) through CoinPay. The number is set up once the
  payment confirms.
- **Your own accounts only.** No bulk account creation, no collecting other people's codes, no getting around
  another service's limits. See the [terms](https://smshub.dev/terms).

## 1. Get a key and a number

1. Create an account at <https://smshub.dev> and an API key under **Settings > API Keys**.
2. Rent a number, from the web at <https://smshub.dev/numbers>, or with the CLI:

   ```sh
   export SMSHUB_API_KEY=smshub_...            # your key; never commit it
   npx -y @profullstack/smshub rent --area 415  # prints the order and a CoinPay pay link, then waits
   npx -y @profullstack/smshub order <order-id> # check on it later
   ```

   Open the pay link and pay. The order goes `pending` → `paid` → `active`.

## 2. Wait for a code (REST)

```sh
export SMSHUB_API_KEY=smshub_...
node wait-for-code.mjs                          # your numbers: +1..., id, paid-until date
node wait-for-code.mjs +1XXXXXXXXXX --timeout 300
```

Then trigger the code (sign in, or text the number from your phone: `Your code is 123456`). The script prints
the code alone on stdout, so you can capture it:

```sh
CODE=$(node wait-for-code.mjs +1XXXXXXXXXX) && echo "got $CODE"
```

Exit codes: `0` code printed, `1` error (bad key, number not on your account), `2` no code before the timeout.
Only texts that arrive after the script starts count.

How it works: `GET /api/v1/numbers/{id}/messages?since=<iso>&wait=<seconds>` with an `X-API-Key` header.
The server holds the request open for up to 55 seconds until a text arrives, and each text comes back with
any one-time code already pulled out:

```json
{ "messages": [ { "id": "…", "from": "+1XXXXXXXXXX", "body": "Your code is 123456", "otp": "123456", "received_at": "2026-11-18T00:00:00.000Z" } ] }
```

(Example shape; values redacted.) A bad key answers `401 {"error":"Invalid API key"}`, an id that is not
yours `404 {"error":"Number not found"}`. The full reference is at <https://smshub.dev/docs/api>.

## 3. Or have texts pushed to you (webhook)

```sh
npx -y @profullstack/smshub webhook add https://your.host/smshub --event message.received
# prints the endpoint and "Signing secret (keep it on your server): whsec_..."

SMSHUB_WEBHOOK_SECRET=whsec_... PORT=8787 node webhook-receiver.mjs
npx -y @profullstack/smshub webhook test <endpoint-id>   # sends a webhook.test event
```

smshub only delivers to a public `https://` URL and does not follow redirects, so run the receiver behind a TLS
reverse proxy or an HTTPS tunnel that forwards to port 8787. Each delivery is a CloudEvents 1.0 JSON body with
three headers ([Standard Webhooks](https://www.standardwebhooks.com/)):

- `webhook-id`: the event id, the same on every retry. Dedupe on it.
- `webhook-timestamp`: unix seconds. The receiver refuses anything more than 5 minutes off.
- `webhook-signature`: `v1,` + base64 of HMAC-SHA256 over `` `${webhook-id}.${webhook-timestamp}.${rawBody}` ``,
  keyed with the base64-decoded part of the secret after `whsec_`.

Verify against the raw body, never re-serialised JSON. Answer 2xx within 10 seconds; anything else is retried.
`npx -y @profullstack/smshub webhook log` shows recent deliveries and the status your server answered.

## 4. Connect an agent (MCP)

The same key works for MCP. Tools include `rent_number` (returns a `pay_url`), `order_status`,
`list_numbers`, `get_messages` (texts with `otp`) and `wait_for_code` (blocks up to 55 s; call again to keep
waiting).

Claude Code, over Streamable HTTP:

```sh
claude mcp add --transport http smshub https://smshub.dev/api/mcp --header "X-API-Key: smshub_..."
```

Cursor, Claude Desktop or any client that takes an `mcpServers` JSON block, over stdio:

```json
{
  "mcpServers": {
    "smshub": {
      "command": "npx",
      "args": ["-y", "@profullstack/smshub", "mcp"],
      "env": { "SMSHUB_API_KEY": "smshub_..." }
    }
  }
}
```

Then ask the agent to rent a number, pay the link it gives you, and have it call `wait_for_code`.

## Tested

- `wait-for-code.mjs` against production with no key, a bad key, and an id that is not on the account: the
  errors match the API's real responses.
- `webhook-receiver.mjs` signature check runs in the repo's test suite
  (`src/lib/webhooks/__tests__/agent-inbox-example.test.ts`) against deliveries signed by smshub's own webhook
  hub: valid ones pass; a changed body, the wrong secret or a stale timestamp fail.
