/**
 * AI Auto-Reply: c0mpute first, OpenAI (gpt-4o-mini) behind it.
 */
import { createAiProviders, type AiRouter } from "@profullstack/ai-providers";

// c0mpute takes 30 s or more, and someone is waiting on the suggestion.
const C0MPUTE_TIMEOUT_MS = 100_000;

export interface Message {
  direction: "inbound" | "outbound";
  body: string;
  created_at: string;
}

export interface SuggestReplyOptions {
  messages: Message[];
  contactName?: string | null;
  contactPhone?: string;
}

export interface SuggestReplyResult {
  suggestion: string;
}

const c0mputeOn = (): boolean =>
  Boolean(process.env.C0MPUTE_API_KEY) && !/^(1|true|yes|on)$/i.test(process.env.C0MPUTE_DISABLED ?? "");

let shared: { keys: string; router: AiRouter } | undefined;

/** One router per set of keys, so a parked provider stays parked across calls. */
function router(): AiRouter {
  const keys = `${c0mputeOn()}|${process.env.OPENAI_API_KEY ?? ""}`;
  if (shared?.keys !== keys) {
    shared = {
      keys,
      router: createAiProviders({
        env: { ...process.env, C0MPUTE_DISABLED: c0mputeOn() ? "" : "1" },
      }),
    };
  }
  return shared.router;
}

async function openaiReply(apiKey: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 150,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${error}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "";
}

/**
 * Generate a reply suggestion, c0mpute first with OpenAI as the fallback.
 */
export async function suggestReply(
  options: SuggestReplyOptions
): Promise<SuggestReplyResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey && !c0mputeOn()) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const { messages, contactName } = options;
  // Never the phone number: the model has no use for it, and c0mpute nodes are
  // run by strangers.
  const contact = contactName || "Contact";

  const conversationContext = messages
    .slice(-20) // Last 20 messages for context
    .map((m) => `${m.direction === "inbound" ? contact : "You"}: ${m.body}`)
    .join("\n");

  const systemPrompt = `You are an SMS reply assistant. Generate a brief, natural reply suggestion for an SMS conversation. Keep it concise (1-2 sentences max) and appropriate for text messaging. Do not use emojis unless the conversation style uses them. Reply with ONLY the suggested message text, nothing else.`;

  const userPrompt = `Here is the recent SMS conversation with ${contactName || "a contact"}:\n\n${conversationContext}\n\nSuggest a reply:`;

  const { value: suggestion } = await router().run(async (provider) => {
    const text =
      provider.name === "openai"
        ? await openaiReply(apiKey as string, systemPrompt, userPrompt)
        : (
            await provider.generate({
              system: systemPrompt,
              user: userPrompt,
              maxTokens: 150,
              temperature: 0.7,
              timeoutMs: C0MPUTE_TIMEOUT_MS,
            })
          ).text;
    const reply = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    if (!reply) throw new Error("No suggestion generated");
    return reply;
  });

  return { suggestion };
}
