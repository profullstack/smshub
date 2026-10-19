import type { Metadata } from "next";
import Link from "next/link";
import { getBrand, getBrandSiteUrl } from "@/lib/brand-server";
import { ENDPOINTS, MCP_URL, NPM_PACKAGE } from "@/lib/developer-api";
import { MCP_TOOLS } from "@/lib/mcp/server";

export async function generateMetadata(): Promise<Metadata> {
  const { name } = await getBrand();
  return {
    title: `API, CLI and MCP — ${name}`,
    description: `Rent numbers, read texts and codes, send SMS and alert people from code, the terminal or an AI agent with ${name}.`,
  };
}

const Code = ({ children }: { children: string }) => (
  <pre className="overflow-x-auto rounded-lg bg-gray-950 border border-gray-800 p-3 text-xs text-gray-300">{children}</pre>
);

export default async function ApiDocsPage() {
  const site = await getBrandSiteUrl();
  const mcpConfig = JSON.stringify(
    { mcpServers: { smshub: { command: "npx", args: ["-y", NPM_PACKAGE, "mcp"], env: { SMSHUB_API_KEY: "smshub_..." } } } },
    null,
    2
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-16 space-y-12">
      <div className="space-y-3">
        <Link href="/docs" className="text-sm text-blue-400">← Setup guides</Link>
        <h1 className="text-4xl font-bold">API, CLI and MCP</h1>
        <p className="text-gray-400">
          Everything in the inbox works from code. Create an API key in{" "}
          <Link href="/settings/api-keys" className="text-blue-400">Settings → API Keys</Link> and send it as{" "}
          <code>X-API-Key: smshub_...</code> or <code>Authorization: Bearer smshub_...</code>. The same key works for the
          REST API, the CLI and MCP.
        </p>
        <nav className="flex flex-wrap gap-3 text-sm">
          <a href="#api" className="rounded border border-gray-800 px-3 py-1 hover:border-blue-600">REST API</a>
          <a href="#cli" className="rounded border border-gray-800 px-3 py-1 hover:border-blue-600">CLI</a>
          <a href="#mcp" className="rounded border border-gray-800 px-3 py-1 hover:border-blue-600">MCP</a>
          <a href="/openapi.json" className="rounded border border-gray-800 px-3 py-1 hover:border-blue-600">openapi.json</a>
          <a href="/llms.txt" className="rounded border border-gray-800 px-3 py-1 hover:border-blue-600">llms.txt</a>
        </nav>
      </div>

      <section id="api" className="space-y-4 scroll-mt-20">
        <h2 className="text-2xl font-semibold">REST API</h2>
        <Code>{`curl -H "X-API-Key: $SMSHUB_API_KEY" ${site}/api/v1/numbers

curl -X POST -H "X-API-Key: $SMSHUB_API_KEY" -H "Content-Type: application/json" \\
  -d '{"to":"+14155551234","message":"Your table is ready"}' \\
  ${site}/api/v1/messages/send`}</Code>
        <p className="text-sm text-gray-400">
          JSON in, JSON out. Errors are <code>{`{ "error": "..." }`}</code> with a 4xx or 5xx status; 429 carries
          <code> Retry-After</code>. Sending uses your own Twilio or Telnyx number; rented numbers receive only.
        </p>
        <div className="space-y-3">
          {ENDPOINTS.map((e) => (
            <div key={e.method + e.path} className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2">
              <div className="font-mono text-sm">
                <span className={e.method === "GET" ? "text-green-400" : "text-blue-400"}>{e.method}</span> {e.path}
              </div>
              <p className="text-sm text-gray-300">{e.summary}</p>
              {e.params?.length ? (
                <ul className="text-xs text-gray-400 space-y-1">
                  {e.params.map((p) => (
                    <li key={p.name}>
                      <code className="text-gray-200">{p.name}</code> <span className="text-gray-500">{p.in}, {p.type}{p.required ? ", required" : ""}</span> — {p.description}
                    </li>
                  ))}
                </ul>
              ) : null}
              {(e.cli || e.mcp) && (
                <div className="text-xs text-gray-500">
                  {e.cli && <>CLI: <code>smshub-cli {e.cli}</code></>}
                  {e.cli && e.mcp && " · "}
                  {e.mcp && <>MCP: <code>{e.mcp}</code></>}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section id="cli" className="space-y-4 scroll-mt-20">
        <h2 className="text-2xl font-semibold">CLI</h2>
        <p className="text-sm text-gray-400">
          <code>{NPM_PACKAGE}</code> on npm, Node 18+, no dependencies. Every command takes <code>--json</code>;
          <code> SMSHUB_API_KEY</code> and <code>SMSHUB_URL</code> override the saved config.
        </p>
        <Code>{`npm i -g ${NPM_PACKAGE}          # or: npx ${NPM_PACKAGE} <command>
smshub-cli login --key smshub_...
smshub-cli numbers                          # your numbers
smshub-cli rent --area 415                  # rent one, prints a pay link
smshub-cli otp +14155550123 --wait 60       # print the next code, nothing else
smshub-cli send +14155551234 "On my way"    # text from your own number
smshub-cli conversations                    # the inbox
smshub-cli thread <conversation-id>         # one conversation
smshub-cli alert "backup failed on db1" --severity critical
smshub-cli tui                              # live view
smshub-cli help                             # everything else`}</Code>
      </section>

      <section id="mcp" className="space-y-4 scroll-mt-20">
        <h2 className="text-2xl font-semibold">MCP</h2>
        <p className="text-sm text-gray-400">
          Streamable HTTP at <code>{site}{MCP_URL}</code> with your key in <code>X-API-Key</code> or
          <code> Authorization: Bearer</code>. Clients that only speak stdio can run the CLI as a bridge.
        </p>
        <Code>{`# Claude Code
claude mcp add --transport http smshub ${site}${MCP_URL} --header "X-API-Key: smshub_..."`}</Code>
        <Code>{`// Claude Desktop, Cursor and other stdio clients
${mcpConfig}`}</Code>
        <div className="grid gap-2 sm:grid-cols-2">
          {MCP_TOOLS.map((t) => (
            <div key={t.name} className="rounded-lg border border-gray-800 bg-gray-900 p-3">
              <div className="font-mono text-sm text-gray-100">{t.name}</div>
              <div className="mt-1 text-xs text-gray-400">{t.description}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
