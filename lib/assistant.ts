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
      ? { rate: input.egpRate, date: input.egpDate }
      : null,
    input.egpError,
  );
  const plan = planById(book, input.planId);
  if (!plan) throw new Error("Unknown plan.");
  const amount = plan.prices[input.currency];
  const priceLine =
    amount == null
      ? `${input.currency} is unavailable until today's Frankfurter USD rate loads. The USD list price for ${plan.name} is ${formatMoney(plan.prices.USD ?? 0, "USD")}.`
      : `The list price for ${plan.name} is ${formatMoney(amount, input.currency)}.`;

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
    return "You can book a free trial lesson with a native teacher. The trial does not need a card.";
  }
  if (trial.region === "unknown") {
    return "Once the residence country is confirmed, the desk can say whether a live trial lesson is available. The free 10-minute level quiz is open either way.";
  }
  return "A live trial lesson is not available for this residence. The free 10-minute level quiz is still open, and a paid plan can be quoted.";
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

  return [
    hello,
    "",
    "Thank you for writing to Learn Arabic Academy.",
    `We can start you in ${programLabel(input.program)} with a native teacher. Lessons are in English or German, and you can ask for a male or female teacher.`,
    facts.customerTrialLine,
    facts.priceLine,
    "The free 10-minute level quiz is on learnarabic08.com and does not need a card.",
    "Tell me which days suit you and I will suggest a plan from the list prices.",
    "",
    signoff(input.rep),
  ].join("\n");
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
      text: `${facts.trial.reason} ${facts.customerTrialLine} The free 10-minute quiz stays available either way.`,
    };
  }

  if (!wantsDraft && asksPrice) {
    return {
      facts,
      text: `${facts.priceLine} GBP, EUR, and AED are list prices. EGP is USD times the daily Frankfurter rate${
        facts.book.egp.rate != null
          ? ` (${facts.book.egp.rate} on ${facts.book.egp.date}).`
          : ". That rate is not loaded yet."
      } Do not invent a discount. Pricing exceptions go to ${ESCALATION.name} on ${ESCALATION.phone}.`,
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
    "Trial rule: a live trial lesson is eligible only when residence is outside Africa and Asia, except Gulf countries AE, SA, KW, QA, BH, and OM, which are eligible.",
    "If FACTS.trial.eligible is false, do not offer a live trial lesson, a free class, or a complimentary lesson. The free 10-minute level quiz may still be mentioned.",
    "If FACTS.trial.eligible is true, you may offer one free trial lesson with no card.",
    "Quote only prices in FACTS. GBP, EUR, and AED are list prices. EGP equals USD times the daily Frankfurter rate in FACTS.egp. If that rate is null, do not invent an EGP figure.",
    "If FACTS.escalationDetected.required is true, do not resolve the issue and do not offer a discount. Hand off to Islam Yehia at +201093570811.",
    "Recorded courses and books have no price in this desk. Send those price questions to Islam Yehia.",
    "Lessons can be in English or German. Students may request a male or female teacher. Learners from age 6 are welcome.",
    "Programs: Egyptian Arabic, Modern Standard Arabic, Quranic Arabic, Gulf Arabic, Levantine Arabic.",
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
