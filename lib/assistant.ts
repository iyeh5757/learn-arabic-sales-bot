import { detectEscalation } from "./escalate";
import { formatMoney } from "./money";
import { buildPriceBook, planById, type PriceBook } from "./pricing";
import { ESCALATION, programLabel } from "./reps";
import { trialEligibility } from "./trial";
import type { ChatTurn, Currency, PlanId, ProgramId, TrialDecision } from "./types";

export type AssistInput = {
  userText: string;
  customerName: string;
  customerMessage: string;
  countryCode: string;
  rep: string;
  currency: Currency;
  program: ProgramId;
  planId: PlanId;
  egpRate: number | null;
  egpDate: string | null;
  egpCairoDay?: string | null;
  egpError: string | null;
};

export type AssistFacts = {
  trial: TrialDecision;
  escalation: { required: boolean; reasons: string[] };
  book: PriceBook;
  planName: string;
  priceLine: string;
  customerTrialLine: string;
};

const SIGNED_OFF_ACADEMY = "Learn Arabic Academy";

export function assistFacts(input: AssistInput): AssistFacts {
  const trial = trialEligibility(input.countryCode);
  const blob = `${input.userText}\n${input.customerMessage}`;
  const escalation = detectEscalation(blob);
  const book = buildPriceBook(
    input.egpRate != null && input.egpDate
      ? { rate: input.egpRate, date: input.egpDate, cairoDay: input.egpCairoDay ?? undefined }
      : null,
    input.egpError,
  );
  const plan = planById(book, input.planId);
  if (!plan) throw new Error("Unknown plan.");
  const amount = plan.prices[input.currency];
  const priceLine =
    amount == null
      ? `${input.currency} is unavailable until today's Frankfurter USD→EGP rate loads. The USD package price for ${plan.name} is ${formatMoney(plan.prices.USD ?? 0, "USD")}.`
      : `The package price for ${plan.name} is ${formatMoney(amount, input.currency)}.`;

  return {
    trial,
    escalation,
    book,
    planName: plan.name,
    priceLine,
    customerTrialLine: customerTrialLine(trial),
  };
}

export function customerTrialLine(trial: TrialDecision): string {
  if (trial.eligible) {
    return "You can book a free 30-minute live trial with a native teacher. The trial does not need a card.";
  }
  if (trial.region === "unknown") {
    return "Once the residence country is confirmed, the desk can say whether a free 30-minute live trial is available.";
  }
  return "A free 30-minute live trial is not available for this residence. I can quote a paid private package.";
}

function firstName(name: string): string {
  const clean = name.trim().split(/\s+/)[0];
  return clean || "there";
}

function signoff(rep: string): string {
  const who = rep.trim() || SIGNED_OFF_ACADEMY;
  return who === SIGNED_OFF_ACADEMY ? who : `${who}\n${SIGNED_OFF_ACADEMY}`;
}

export function customerDraft(input: AssistInput, facts: AssistFacts): string {
  const hello = `Hi ${firstName(input.customerName)},`;
  if (facts.escalation.required) {
    return [
      hello,
      "",
      "Thank you for writing to Learn Arabic Academy. I am handing this to Islam Yehia so it is handled properly.",
      `You can reach him on ${ESCALATION.phone}. He will follow up with you directly.`,
      "",
      signoff(input.rep),
    ].join("\n");
  }

  const mentionsGroup = /group/i.test(`${input.userText}\n${input.customerMessage}`);
  const lines = [
    hello,
    "",
    "Thank you for writing to Learn Arabic Academy.",
    `We teach ${programLabel(input.program)} in private 1-to-1 lessons with a native teacher.`,
  ];
  if (mentionsGroup) lines.push("There is no group-class package.");
  lines.push(
    facts.customerTrialLine,
    facts.priceLine,
    "The 16-session 60-minute package is the most popular.",
    "",
    signoff(input.rep),
  );
  return lines.join("\n");
}

export function respondLocally(input: AssistInput): { text: string; facts: AssistFacts } {
  const facts = assistFacts(input);
  const ask = input.userText.trim();
  const wantsDraft = /draft|reply|respond|write back|what should i say/i.test(ask);
  const asksTrial = /trial|eligible|eligibility|residence/i.test(ask);
  const asksPrice = /price|quote|cost|how much|plan/i.test(ask);
  const asksEscalation = /escalat|islam|who (handles|should)|manager/i.test(ask);

  if (!wantsDraft && asksEscalation) {
    return {
      facts,
      text: `Escalation goes to ${ESCALATION.name} on ${ESCALATION.phone}. Reps on the desk are Asmaa, Rebeb, Kamal, and Ram. ${
        facts.escalation.required
          ? `This thread needs that handoff (${facts.escalation.reasons.join("; ")}).`
          : "This thread does not currently match an escalation rule."
      }`,
    };
  }

  if (!wantsDraft && asksTrial) {
    return {
      facts,
      text: `${facts.trial.reason} ${facts.customerTrialLine}`,
    };
  }

  if (!wantsDraft && asksPrice) {
    return {
      facts,
      text: `${facts.priceLine} USD, GBP, EUR, and AED are fixed package prices. AED is not calculated from an exchange rate. EGP is the USD package price times today's Frankfurter USD→EGP mid rate${
        facts.book.egp.rate != null
          ? ` (${facts.book.egp.rate} on ${facts.book.egp.date}${facts.book.egp.cairoDay ? `, cached for Cairo day ${facts.book.egp.cairoDay}` : ""}).`
          : ". That rate is not loaded, so no EGP figure is available."
      } Lessons are private 1-to-1. The 16-session 60-minute package is the most popular. Do not invent a discount. Pricing exceptions go to ${ESCALATION.name} on ${ESCALATION.phone}.`,
    };
  }

  if (wantsDraft || input.customerMessage.trim()) {
    const draft = customerDraft(input, facts);
    return {
      facts,
      text: `Draft for the customer:\n\n${draft}`,
    };
  }

  return {
    facts,
    text: "Ask for a draft, a trial check, a quote, or the escalation contact. Set the residence country before offering a trial lesson.",
  };
}

export function buildGrokSystem(input: AssistInput, facts: AssistFacts): string {
  const priceRows = facts.book.plans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    detail: plan.detail,
    prices: plan.prices,
  }));

  const factsJson = JSON.stringify(
    {
      academy: "Learn Arabic Academy",
      sites: ["https://www.learnarabic08.com/", "https://signup.learnarabic08.com/"],
      reps: ["Asmaa", "Rebeb", "Kamal", "Ram"],
      escalation: ESCALATION,
      customerName: input.customerName,
      customerMessage: input.customerMessage,
      rep: input.rep || "Learn Arabic Academy",
      program: programLabel(input.program),
      currency: input.currency,
      trial: facts.trial,
      escalationDetected: facts.escalation,
      selectedPlan: input.planId,
      selectedPriceLine: facts.priceLine,
      priceBook: priceRows,
      egp: facts.book.egp,
    },
    null,
    2,
  );

  return [
    "You are the sales-desk assistant for Learn Arabic Academy reps (Mode A).",
    "Speak to the rep. When they ask for a customer reply, give a sendable draft they can copy.",
    "FACTS below are the source of truth. Do not invent prices, discounts, refunds, or trial exceptions.",
    "Trial rule: one free 30-minute live trial is eligible only when residence is outside Africa and Asia, except Gulf countries AE, SA, KW, QA, BH, and OM, which are eligible.",
    "If FACTS.trial.eligible is false, do not offer a free 30-minute live trial, a free class, or a complimentary lesson. Do not mention a quiz as a substitute.",
    "If FACTS.trial.eligible is true, you may offer one free 30-minute live trial with no card.",
    "Lessons are private 1-to-1 only. Programmes are Egyptian, Levantine, Gulf/Khaliji, MSA, and Quran. Do not invent group-class packages.",
    "Quote only prices in FACTS. USD, GBP, EUR, and AED are fixed package prices. Never derive AED from an exchange rate. EGP equals the USD package price times today's Frankfurter USD→EGP mid rate in FACTS.egp. If that rate is null, do not invent an EGP figure.",
    "The 16-session 60-minute package is the most popular.",
    "If FACTS.escalationDetected.required is true, do not resolve the issue and do not offer a discount. Hand off to Islam Yehia at +201093570811.",
    "Do not quote products that are absent from FACTS.priceBook.",
    "Tone: warm, specific, and not pushy. No markdown headings. Keep a customer draft under 180 words.",
    "Match the customer's language when drafting if they wrote in Arabic or German. Otherwise use English unless the rep asks for another language.",
    "",
    "FACTS:",
    factsJson,
  ].join("\n");
}

export function latestUserText(turns: ChatTurn[]): string {
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    if (turns[i].role === "user") return turns[i].content;
  }
  return "";
}
