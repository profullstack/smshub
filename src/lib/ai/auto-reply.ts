/**
 * AI Auto-Reply using OpenAI API (gpt-4o-mini)
 */

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

/**
 * Generate a reply suggestion using OpenAI's gpt-4o-mini model.
 */
export async function suggestReply(
  options: SuggestReplyOptions
): Promise<SuggestReplyResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const { messages, contactName, contactPhone } = options;

  const conversationContext = messages
    .slice(-20) // Last 20 messages for context
    .map(
      (m) =>
        `${m.direction === "inbound" ? (contactName || contactPhone || "Contact") : "You"}: ${m.body}`
    )
    .join("\n");

  const systemPrompt = `You are an SMS reply assistant. Generate a brief, natural reply suggestion for an SMS conversation. Keep it concise (1-2 sentences max) and appropriate for text messaging. Do not use emojis unless the conversation style uses them. Reply with ONLY the suggested message text, nothing else.`;

  const userPrompt = `Here is the recent SMS conversation with ${contactName || contactPhone || "a contact"}:\n\n${conversationContext}\n\nSuggest a reply:`;

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
  const suggestion = data.choices?.[0]?.message?.content?.trim();

  if (!suggestion) {
    throw new Error("No suggestion generated");
  }

  return { suggestion };
}
