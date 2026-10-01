import { NextResponse } from "next/server";
import { latestUserText, replyWithoutGrok } from "@/lib/assistant";
import { applyFirstReplyGuard, replyForModel } from "@/lib/firstReply";
import { getUsdToEgp } from "@/lib/frankfurter";
import { draftWithGrok, grokCredentials, isDraftTimeout } from "@/lib/grok";
import { CATALOG } from "@/lib/pricing";
import { buildGrokSystem, type DeskContext } from "@/lib/prompt";
import { PROGRAMS } from "@/lib/reps";
import { executeDeskTool, selectDeskTools, type FxQuote } from "@/lib/tools";
import type { ChatTurn } from "@/lib/types";

export const dynamic = "force-dynamic";
/** Hobby fluid compute allows 300s. Stay under that and above the Grok budget so the handler can answer. */
export const maxDuration = 180;

const CURRENCIES = new Set(["USD", "GBP", "EUR", "AED", "EGP"]);
const PROGRAM_IDS = new Set<string>(PROGRAMS.map((item) => item.id));
const PLAN_IDS = new Set<string>(CATALOG.map((item) => item.id));

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function optionalCode(value: unknown, allowed: Set<string>, label: string): string | { error: string } {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (!allowed.has(text)) return { error: `Unknown ${label}.` };
  return text;
}

export async function POST(request: Request) {
  let body: {
    messages?: unknown;
    customerName?: unknown;
    customerMessage?: unknown;
    countryCode?: unknown;
    rep?: unknown;
    currency?: unknown;
    program?: unknown;
    planId?: unknown;
    notes?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return bad("Invalid JSON.");
  }

  const turns: ChatTurn[] = Array.isArray(body.messages)
    ? body.messages.slice(-16).flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const turn = item as { role?: unknown; content?: unknown };
        if (turn.role !== "user" && turn.role !== "assistant") return [];
        const raw = String(turn.content ?? "").slice(0, 8000);
        if (!raw.trim()) return [];
        const content = turn.role === "assistant" ? replyForModel(raw) : raw;
        return [{ role: turn.role, content }];
      })
    : [];

  const userText = latestUserText(turns);
  if (!userText) return bad("A message is required.");

  const currency = optionalCode(body.currency, CURRENCIES, "currency");
  if (typeof currency !== "string") return bad(currency.error);
  const program = optionalCode(body.program, PROGRAM_IDS, "program");
  if (typeof program !== "string") return bad(program.error);
  const planId = optionalCode(body.planId, PLAN_IDS, "plan");
  if (typeof planId !== "string") return bad(planId.error);

  const context: DeskContext = {
    customerName: String(body.customerName ?? "").slice(0, 120),
    customerMessage: String(body.customerMessage ?? "").slice(0, 8000),
    countryCode: String(body.countryCode ?? "").slice(0, 8),
    rep: String(body.rep ?? "").slice(0, 40),
    currency,
    program,
    planId,
    notes: String(body.notes ?? "").slice(0, 4000),
    followUp: turns.some((turn) => turn.role === "assistant" && /Draft to copy/i.test(turn.content)),
  };

  const toolList = selectDeskTools({
    userText,
    customerMessage: context.customerMessage,
    notes: context.notes,
  });
  context.enabledTools = toolList.map((tool) => tool.function.name);

  let fx: FxQuote = null;
  let fxError: string | null = null;
  const needsFx = toolList.some((tool) => tool.function.name === "get_pricing");
  if (needsFx) {
    try {
      const quote = await getUsdToEgp();
      fx = { rate: quote.rate, date: quote.date, cairoDay: quote.cairoDay };
    } catch (error) {
      fxError = error instanceof Error ? error.message : "Frankfurter rate unavailable.";
    }
  }

  const creds = grokCredentials();
  if (!creds.key) {
    const local = replyWithoutGrok({
      reason: "unconfigured",
      userText,
      customerMessage: context.customerMessage,
      notes: context.notes,
      countryCode: context.countryCode,
      currency: context.currency,
      planId: context.planId,
      fx,
      fxError,
    });
    return NextResponse.json({
      message: local.text,
      source: local.source,
      model: null,
      toolsUsed: local.toolsUsed,
    });
  }

  try {
    const drafted = await draftWithGrok({
      system: buildGrokSystem(context),
      messages: turns,
      tools: toolList,
      executeTool: (name, args) => executeDeskTool(name, args, fx, fxError),
    });
    const guarded = applyFirstReplyGuard({
      reply: drafted.text,
      customerMessage: context.customerMessage,
      customerName: context.customerName,
      program: context.program,
      rep: context.rep,
      notes: context.notes,
      userText,
    });
    return NextResponse.json({
      message: guarded.text,
      source: "grok",
      model: drafted.model,
      toolsUsed: drafted.toolsUsed,
      firstReplyRewritten: guarded.rewritten,
    });
  } catch (error) {
    if (isDraftTimeout(error)) {
      return NextResponse.json(
        { error: "The draft took too long. Nothing was sent. Try again.", retryable: true },
        { status: 504 },
      );
    }
    const grokError = error instanceof Error ? error.message : "Grok failed.";
    const local = replyWithoutGrok({
      reason: "unavailable",
      userText,
      customerMessage: context.customerMessage,
      notes: context.notes,
      countryCode: context.countryCode,
      currency: context.currency,
      planId: context.planId,
      grokError,
      fx,
      fxError,
    });
    return NextResponse.json({
      message: local.text,
      source: local.source,
      model: null,
      grokError,
      toolsUsed: local.toolsUsed,
    });
  }
}
