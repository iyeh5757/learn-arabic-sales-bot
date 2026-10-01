import type { ChatTurn } from "./types";
import { GROK_TOOLS } from "./tools";

/** One model completion. Tool rounds share the budget below. */
export const GROK_ROUND_TIMEOUT_MS = 90_000;
/** Stay under the chat route maxDuration so a slow draft returns JSON instead of a platform 504. */
export const GROK_BUDGET_MS = 150_000;

export class GrokTimeoutError extends Error {
  readonly retryable = true;
  constructor() {
    super("The draft took too long. Nothing was sent. Try again.");
    this.name = "GrokTimeoutError";
  }
}

export function isDraftTimeout(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "TimeoutError" || error.name === "AbortError" || error.name === "GrokTimeoutError") {
    return true;
  }
  return /timeout|timed out|aborted/i.test(error.message);
}

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

type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type ApiMessage = {
  role?: string;
  content?: string | null;
  tool_calls?: ToolCall[];
};

export async function draftWithGrok(input: {
  system: string;
  messages: ChatTurn[];
  executeTool: (name: string, args: Record<string, unknown>) => unknown;
  tools?: typeof GROK_TOOLS;
}): Promise<{ text: string; model: string; toolsUsed: string[] }> {
  const creds = grokCredentials();
  if (!creds.key) throw new Error("Grok is not configured.");

  const tools = input.tools ?? GROK_TOOLS;
  const base = (process.env.XAI_BASE_URL || "https://api.x.ai/v1").replace(/\/$/, "");
  const messages: unknown[] = [{ role: "system", content: input.system }, ...input.messages];
  const toolsUsed: string[] = [];
  let model = creds.model;
  const started = Date.now();

  for (let round = 0; round < 4; round += 1) {
    const remaining = GROK_BUDGET_MS - (Date.now() - started);
    if (remaining < 5_000) throw new GrokTimeoutError();

    const payload: Record<string, unknown> = {
      model: creds.model,
      temperature: 0.4,
      messages,
    };
    if (tools.length > 0) {
      payload.tools = tools;
      payload.tool_choice = "auto";
    }

    let response: Response;
    try {
      response = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(Math.min(GROK_ROUND_TIMEOUT_MS, remaining)),
      });
    } catch (error) {
      if (isDraftTimeout(error)) throw new GrokTimeoutError();
      throw error;
    }

    if (!response.ok) {
      const body = await response.text();
      const failed = new Error(`Grok ${response.status}: ${body.slice(0, 400)}`);
      if (response.status === 408 || response.status === 504 || response.status === 524) {
        failed.name = "GrokTimeoutError";
      }
      throw failed;
    }

    const data = (await response.json()) as {
      model?: string;
      choices?: { message?: ApiMessage }[];
    };
    if (data.model) model = data.model;
    const message = data.choices?.[0]?.message;
    if (!message) throw new Error("Grok returned an empty draft.");

    const toolCalls = message.tool_calls ?? [];
    if (toolCalls.length > 0) {
      messages.push({
        role: "assistant",
        content: message.content ?? "",
        tool_calls: toolCalls,
      });
      for (const [index, call] of toolCalls.entries()) {
        const name = call.function?.name || "";
        toolsUsed.push(name);
        const result = input.executeTool(name, parseArgs(call.function?.arguments));
        messages.push({
          role: "tool",
          tool_call_id: call.id || `call-${round}-${index}`,
          content: JSON.stringify(result),
        });
      }
      continue;
    }

    const text = message.content;
    if (!text || typeof text !== "string" || !text.trim()) {
      throw new Error("Grok returned an empty draft.");
    }
    return { text: text.trim(), model, toolsUsed };
  }

  throw new Error("Grok did not finish after tool calls.");
}

function parseArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }
  return {};
}
