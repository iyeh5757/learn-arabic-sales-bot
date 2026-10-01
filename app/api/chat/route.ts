import { NextResponse } from "next/server";
import { assistFacts, buildGrokSystem, latestUserText, respondLocally } from "@/lib/assistant";
import { getUsdToEgp } from "@/lib/frankfurter";
import { draftWithGrok, grokCredentials } from "@/lib/grok";
import { CATALOG, POPULAR_PLAN_ID } from "@/lib/pricing";
import { PROGRAMS } from "@/lib/reps";
import type { ChatTurn, Currency, PlanId, ProgramId } from "@/lib/types";

export const dynamic = "force-dynamic";

const CURRENCIES = new Set(["USD", "GBP", "EUR", "AED", "EGP"]);
const PROGRAM_IDS = new Set<string>(PROGRAMS.map((item) => item.id));
const PLAN_IDS = new Set<string>(CATALOG.map((item) => item.id));

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
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
        const content = String(turn.content ?? "").slice(0, 8000);
        if (!content.trim()) return [];
        return [{ role: turn.role, content }];
      })
    : [];

  const userText = latestUserText(turns);
  if (!userText) return bad("A message is required.");

  const currency = String(body.currency ?? "USD");
  if (!CURRENCIES.has(currency)) return bad("Unknown currency.");
  const program = String(body.program ?? "egyptian");
  if (!PROGRAM_IDS.has(program)) return bad("Unknown program.");
  const planId = String(body.planId ?? POPULAR_PLAN_ID);
  if (!PLAN_IDS.has(planId)) return bad("Unknown plan.");

  let egpRate: number | null = null;
  let egpDate: string | null = null;
  let egpCairoDay: string | null = null;
  let egpError: string | null = null;
  try {
    const quote = await getUsdToEgp();
    egpRate = quote.rate;
    egpDate = quote.date;
    egpCairoDay = quote.cairoDay;
  } catch (error) {
    egpError = error instanceof Error ? error.message : "Frankfurter rate unavailable.";
  }

  const input = {
    userText,
    customerName: String(body.customerName ?? "").slice(0, 120),
    customerMessage: String(body.customerMessage ?? "").slice(0, 8000),
    countryCode: String(body.countryCode ?? ""),
    rep: String(body.rep ?? "").slice(0, 40),
    currency: currency as Currency,
    program: program as ProgramId,
    planId: planId as PlanId,
    egpRate,
    egpDate,
    egpCairoDay,
    egpError,
  };

  const facts = assistFacts(input);
  const payload = {
    trial: facts.trial,
    escalation: facts.escalation,
    priceLine: facts.priceLine,
    egp: facts.book.egp,
  };

  const creds = grokCredentials();
  if (creds.key) {
    try {
      const drafted = await draftWithGrok({
        system: buildGrokSystem(input, facts),
        messages: turns,
      });
      return NextResponse.json({
        message: drafted.text,
        source: "grok",
        model: drafted.model,
        ...payload,
      });
    } catch (error) {
      const local = respondLocally(input);
      return NextResponse.json({
        message: local.text,
        source: "local",
        model: null,
        grokError: error instanceof Error ? error.message : "Grok failed.",
        trial: local.facts.trial,
        escalation: local.facts.escalation,
        priceLine: local.facts.priceLine,
        egp: local.facts.book.egp,
      });
    }
  }

  const local = respondLocally(input);
  return NextResponse.json({
    message: local.text,
    source: "local",
    model: null,
    ...payload,
    trial: local.facts.trial,
    escalation: local.facts.escalation,
    priceLine: local.facts.priceLine,
    egp: local.facts.book.egp,
  });
}
