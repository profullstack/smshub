# @profullstack/smshub

Rent a US phone number on [smshub.dev](https://smshub.dev/phonenumbers) and read the texts and
verification codes it receives, from a terminal, a script or an AI agent. No dependencies.

Install the `smshub-cli` command (brings its own Node if yours is older than 18; remove with
`sh ~/.local/share/smshub/uninstall.sh`):

```sh
curl -fsSL https://smshub.dev/cli/install.sh | sh
```

Or run it without installing:

```sh
npx @profullstack/smshub login --key smshub_...      # Settings > API Keys on smshub.dev
npx @profullstack/smshub rent --area 415             # prints a CoinPay link, waits for payment
npx @profullstack/smshub numbers
npx @profullstack/smshub otp +14155550123 --wait 60  # prints the next code and exits
npx @profullstack/smshub tui                         # live view
```

Installed, the command is `smshub-cli` (`npm i -g @profullstack/smshub` works too).

| command | what it does |
| --- | --- |
| `login --key <key>` | save your API key to `~/.config/smshub/config.json` (mode 600) |
| `numbers` | your numbers, with expiry for rented ones |
| `rent [--area 415] [--months 1] [--chain USDC_POL] [--no-wait]` | open a checkout; waits until the number is ready |
| `order <id>` | status of a rent/renew order |
| `renew <number> [--months 1] [--credit]` | extend a rented number (`--credit` pays from store credit) |
| `redeem <code>` | redeem a credit code for store credit (pays for rentals: `rent --credit`) |
| `credits` | store credit balance and history |
| `invites [new --note ..]` | your 3 invites (an accepted one gives you both $2.50 credit) and your `?ref=` link |
| `messages <number> [--since ISO] [--limit 20]` | texts received, newest first, codes extracted |
| `otp <number> [--wait 60] [--recent 300]` | print the next one-time code (exit 2 if none) |
| `send <to> "<message>" [--from <number>] [--media <url>]` | text someone from your own Twilio/Telnyx number (rented numbers receive only) |
| `conversations [--line <number>] [--limit 20]` | the inbox, newest first; `--line` takes a number, id or line name ("Mom") |
| `thread <conversation-id> [--limit 50]` | messages in one conversation, oldest first |
| `lines` | your numbers and who shares each one (name, cell, keypad digit, text prefix) |
| `contacts <number> add --name Kim --cell +14155550123 [--digit 1] [--prefix K] [--forward-sms]` | add someone to a number; a digit also turns on the voice menu |
| `contacts <number> edit <id> [--digit none] [--prefix none] ...` / `rm <id>` | change or remove them |
| `contacts <number> share <other-number\|none>` | answer this number with another line's contacts, menu and prefixes |
| `voice <number> [--setup] [--force] [--record on\|off]` | where calls to the number go; `--setup` points them at the voice menu; `--record` turns MP3 call recording on/off |
| `recording <call-message-id> [--out call.mp3]` | save a recorded call as MP3 |
| `alert "<message>" [--severity info\|warning\|critical] [--to +1...]` | alert your phone (Settings > Alerts): a text when your number can send one, otherwise a call that reads it; critical always calls; the same alert is sent once per 10 minutes |
| `alerts [--limit 20]` | recent alerts and how each went out |
| `webhooks` | your webhook endpoints and the event types smshub sends |
| `webhook add <https-url> [--event message.received]... [--description ..]` | get a signed POST for every text (and other events); prints the signing secret once |
| `webhook test\|secret\|rotate\|on\|off\|rm <id>` | send a test event, show or replace the secret, switch on/off, remove |
| `webhook events <id> <pattern>...` / `webhook log [<id>]` / `webhook retry <delivery-id>` | change its events, see recent deliveries, send one again |
| `tui` | full-screen live view |
| `mcp` | MCP server on stdio, proxied to `https://smshub.dev/api/mcp` |

`<number>` is a number id or the number itself. Every command takes `--json`.
`SMSHUB_API_KEY` and `SMSHUB_URL` override the saved config.

## Key vault

Your own Twilio / Telnyx keys are sealed under a passphrase only you know. To send
from them (CLI, API, MCP, campaigns), unlock a session first:

```sh
smshub-cli vault                 # locked / unlocked until ..., sealed key counts
smshub-cli vault unlock --ttl 3d # asks for the passphrase; sends only the derived key (max 7d)
smshub-cli vault lock            # sends fail with "locked: ..." until the next unlock
```

A server restart also locks. Create the vault (and get your recovery key) at
https://smshub.dev/settings.

## MCP

Remote (streamable HTTP): `https://smshub.dev/api/mcp` with header `X-API-Key: smshub_...`.

Local (stdio), e.g. for Claude Code:

```sh
claude mcp add smshub -e SMSHUB_API_KEY=smshub_... -- npx -y @profullstack/smshub mcp
```

Tools: `account_overview`, `list_numbers`, `list_conversations`, `get_conversation`, `send_message`, `list_lines`, `add_line_contact`, `update_line_contact`, `remove_line_contact`, `share_line_contacts`, `voice_menu`, `rent_number`, `renew_number`, `redeem_code`, `credit_balance`, `list_invites`, `create_invite`, `order_status`,
`list_orders`, `get_messages`, `wait_for_code`, `list_groups`, `get_group`, `save_group`, `add_group_members`, `send_to_group`,
`send_alert`, `list_alerts`, `list_webhooks`, `create_webhook`, `update_webhook`, `delete_webhook`, `test_webhook`,
`rotate_webhook_secret`, `webhook_deliveries`.

Rented numbers receive texts only. Some services refuse virtual numbers for sign-up codes.

Webhooks are CloudEvents JSON signed per Standard Webhooks (`webhook-id`, `webhook-timestamp`,
`webhook-signature`); verify with `verifyAndParse` from `@profullstack/webhooks` or any Standard Webhooks library.

Full reference: https://smshub.dev/docs/api (OpenAPI: https://smshub.dev/openapi.json).
