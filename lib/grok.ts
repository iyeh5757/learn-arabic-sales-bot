import type { ChatTurn } from "./types";

export function grokCredentials(): {
  key: string | null;
  source: "XAI_API_KEY" | "GROK_API_KEY" | null;
  model: string;
} {
  const model = process.env.GROK_MODEL || "grok-4.6";
  if (process.env.XAI_API_KEY) {
    return { key: process.env.XAI_API_KEY, source: "XAI_API_KEY", model };
  }
  if (process.env.GROK_API_KEY) {
    return { key: process.env.GROK_API_KEY, source: "GROK_API_KEY", model };
  }
  return { key: null, source: null, model };
}

export async function draftWithGrok(input: {
  system: string;
  messages: ChatTurn[];
}): Promise<{ text: string; model: string }> {
  const creds = grokCredentials();
  if (!creds.key) throw new Error("Grok is not configured.");

  const base = (process.env.XAI_BASE_URL || "https://api.x.ai/v1").replace(/\/$/, "");
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: creds.model,
      temperature: 0.3,
      messages: [{ role: "system", content: input.system }, ...input.messages],
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Grok ${response.status}: ${body.slice(0, 400)}`);
  }

  const data = (await response.json()) as {
    model?: string;
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content;
  if (!text || typeof text !== "string") throw new Error("Grok returned an empty draft.");
  return { text: text.trim(), model: data.model || creds.model };
}
