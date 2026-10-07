# @profullstack/smshub

Rent a US phone number on [smshub.dev](https://smshub.dev/phonenumbers) and read the texts and
verification codes it receives, from a terminal, a script or an AI agent. No dependencies.

```sh
npx @profullstack/smshub login --key smshub_...      # Settings > API Keys on smshub.dev
npx @profullstack/smshub rent --area 415             # prints a CoinPay link, waits for payment
npx @profullstack/smshub numbers
npx @profullstack/smshub otp +14155550123 --wait 60  # prints the next code and exits
npx @profullstack/smshub tui                         # live view
```

Install it once with `npm i -g @profullstack/smshub` and the command is `smshub-cli`.

| command | what it does |
| --- | --- |
| `login --key <key>` | save your API key to `~/.config/smshub/config.json` (mode 600) |
| `numbers` | your numbers, with expiry for rented ones |
| `rent [--area 415] [--months 1] [--chain USDC_POL] [--no-wait]` | open a checkout; waits until the number is ready |
| `order <id>` | status of a rent/renew order |
| `renew <number> [--months 1]` | extend a rented number |
| `messages <number> [--since ISO] [--limit 20]` | texts received, newest first, codes extracted |
| `otp <number> [--wait 60] [--recent 300]` | print the next one-time code (exit 2 if none) |
| `conversations [--line <number>] [--limit 20]` | the inbox, newest first; `--line` takes a number, id or line name ("Mom") |
| `tui` | full-screen live view |
| `mcp` | MCP server on stdio, proxied to `https://smshub.dev/api/mcp` |

`<number>` is a number id or the number itself. Every command takes `--json`.
`SMSHUB_API_KEY` and `SMSHUB_URL` override the saved config.

## MCP

Remote (streamable HTTP): `https://smshub.dev/api/mcp` with header `X-API-Key: smshub_...`.

Local (stdio), e.g. for Claude Code:

```sh
claude mcp add smshub -e SMSHUB_API_KEY=smshub_... -- npx -y @profullstack/smshub mcp
```

Tools: `account_overview`, `list_numbers`, `list_conversations`, `rent_number`, `renew_number`, `order_status`,
`list_orders`, `get_messages`, `wait_for_code`.

Rented numbers receive texts only. Some services refuse virtual numbers for sign-up codes.
