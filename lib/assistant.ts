import { detectEscalation } from "./escalate";
import { formatMoney } from "./money";
import { ESCALATION } from "./reps";
import { executeDeskTool, type CurrencyToolResult, type FxQuote, type PricingToolResult } from "./tools";
import type { ChatTurn, Currency, TrialDecision } from "./types";

export type UnconfiguredReply = {
  text: string;
  source: "unconfigured" | "unavailable";
  toolsUsed: string[];
};

const PRICE_ASK = /\b(price|prices|pricing|quote|cost|how much)\b/i;
const TRIAL_ASK = /\b(trial|eligible|eligibility)\b/i;
const CURRENCY_ASK = /\bcurrency\b/i;
const ESCALATION_ASK = /\b(escalat\w*|islam)\b|\bwho (handles|should)\b/i;

export function replyWithoutGrok(input: {
  reason: "unconfigured" | "unavailable";
  userText: string;
  customerMessage?: string;
  notes?: string;
  countryCode?: string;
  currency?: string;
  planId?: string;
  grokError?: string;
  fx: FxQuote;
  fxError: string | null;
}): UnconfiguredReply {
  const headline =
    input.reason === "unconfigured"
      ? "Grok is not connected. Set XAI_API_KEY (or GROK_API_KEY) on the server before Assist can write a customer draft. No sales reply was written."
      : `Grok did not respond${input.grokError ? ` (${input.grokError})` : ""}. No sales reply was written. Check XAI_API_KEY on the server and try again.`;

  const blob = [input.userText, input.customerMessage ?? "", input.notes ?? ""].join("\n");
  const parts = [headline];
  const toolsUsed: string[] = [];
  const factLines: string[] = [];

  if (TRIAL_ASK.test(blob)) {
    toolsUsed.push("check_trial_eligibility");
    const decision = executeDeskTool(
      "check_trial_eligibility",
      { country_code: input.countryCode ?? "" },
      input.fx,
      input.fxError,
    ) as TrialDecision;
    factLines.push(`Trial: ${decision.reason} Eligible: ${decision.eligible ? "yes" : "no"}.`);
  }

  if (PRICE_ASK.test(blob)) {
    toolsUsed.push("get_pricing");
    const priced = executeDeskTool(
      "get_pricing",
      {
        ...(input.planId ? { plan_id: input.planId } : {}),
        ...(input.currency ? { currency: input.currency } : {}),
      },
      input.fx,
      input.fxError,
    ) as PricingToolResult;
    factLines.push(formatPricing(priced));
  }

  if (CURRENCY_ASK.test(blob)) {
    toolsUsed.push("get_customer_currency");
    const currency = executeDeskTool(
      "get_customer_currency",
      { country_code: input.countryCode ?? "" },
      input.fx,
      input.fxError,
    ) as CurrencyToolResult;
    factLines.push(
      currency.currency
        ? `Currency: ${currency.countryCode} uses ${currency.currency}. ${currency.note}`
        : `Currency: ${currency.note}`,
    );
  }

  if (ESCALATION_ASK.test(blob) || detectEscalation(blob).required) {
    const detected = detectEscalation(blob);
    factLines.push(
      `Escalation: ${ESCALATION.name} on ${ESCALATION.phone}.${
        detected.required ? ` This thread matches: ${detected.reasons.join("; ")}.` : ""
      }`,
    );
  }

  if (factLines.length > 0) {
    parts.push("", "Verified tool facts", ...factLines);
  }

  return { text: parts.join("\n"), source: input.reason, toolsUsed };
}

function formatPricing(priced: PricingToolResult): string {
  if (priced.error) return `Pricing: ${priced.error} ${priced.rule}`;
  const lines = priced.plans.map((plan) => {
    const amounts = (Object.keys(plan.prices) as Currency[]).map((code) => {
      const amount = plan.prices[code];
      return amount == null ? `${code} unavailable` : formatMoney(amount, code);
    });
    return `${plan.name}${plan.popular ? " (most popular)" : ""}: ${amounts.join(", ")}.`;
  });
  const egp =
    priced.egp.rate == null
      ? "EGP is unavailable because today's Frankfurter USD→EGP rate did not load. No EGP figure is shown."
      : `EGP uses Frankfurter USD→EGP ${priced.egp.rate} dated ${priced.egp.date}.`;
  return ["Pricing:", ...lines, egp, priced.rule].join("\n");
}

export function latestUserText(turns: ChatTurn[]): string {
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    if (turns[i].role === "user") return turns[i].content;
  }
  return "";
}
