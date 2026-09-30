import type { Currency, PlanId } from "./types";

/** Official USD/AED peg used for the AED column. 1 USD = 3.6725 AED. */
export const AED_PER_USD_NUMERATOR = 36725;
export const AED_PER_USD_DENOMINATOR = 10000;

export type CatalogPlan = {
  id: PlanId;
  name: string;
  detail: string;
  sessions: number;
  minutes: number | null;
  usd: number;
  gbp: number;
  eur: number;
};

/**
 * Live-lesson price book.
 * USD figures follow the public floors on signup.learnarabic08.com
 * (private 30 min from $22, private 60 min from $48, group from $15).
 * Monthly plans are that 30-minute list price times 4, 8, or 12 sessions.
 * GBP and EUR are fixed list prices. AED is the USD amount at the dirham peg.
 * EGP is not stored here.
 */
export const CATALOG: CatalogPlan[] = [
  {
    id: "private-30",
    name: "Private 30-minute session",
    detail: "Live 1-on-1. Public floor is $22.",
    sessions: 1,
    minutes: 30,
    usd: 22,
    gbp: 17,
    eur: 20,
  },
  {
    id: "private-60",
    name: "Private 60-minute session",
    detail: "Live 1-on-1. Public floor is $48.",
    sessions: 1,
    minutes: 60,
    usd: 48,
    gbp: 36,
    eur: 44,
  },
  {
    id: "group",
    name: "Group class",
    detail: "Shared class. Public floor is $15.",
    sessions: 1,
    minutes: null,
    usd: 15,
    gbp: 12,
    eur: 14,
  },
  {
    id: "starter",
    name: "Starter month",
    detail: "4 private 30-minute sessions.",
    sessions: 4,
    minutes: 30,
    usd: 88,
    gbp: 68,
    eur: 80,
  },
  {
    id: "standard",
    name: "Standard month",
    detail: "8 private 30-minute sessions.",
    sessions: 8,
    minutes: 30,
    usd: 176,
    gbp: 136,
    eur: 160,
  },
  {
    id: "intensive",
    name: "Intensive month",
    detail: "12 private 30-minute sessions.",
    sessions: 12,
    minutes: 30,
    usd: 264,
    gbp: 204,
    eur: 240,
  },
];

export function aedFromUsd(usd: number): number {
  const fils = Math.round((usd * AED_PER_USD_NUMERATOR) / 100);
  return fils / 100;
}

export function egpFromUsd(usd: number, usdToEgp: number): number {
  return Math.round(usd * usdToEgp * 100) / 100;
}

export type PricedPlan = {
  id: PlanId;
  name: string;
  detail: string;
  sessions: number;
  minutes: number | null;
  prices: Record<Currency, number | null>;
};

export type PriceBook = {
  plans: PricedPlan[];
  egp: {
    rate: number | null;
    date: string | null;
    source: string;
    formula: "EGP = USD × daily Frankfurter rate";
    error: string | null;
  };
};

export function frankfurterSource(): string {
  return (
    process.env.FRANKFURTER_URL ||
    "https://api.frankfurter.dev/v2/rates?base=USD&quotes=EGP"
  );
}

export function buildPriceBook(
  fx: { rate: number; date: string } | null,
  error: string | null = null,
): PriceBook {
  return {
    plans: CATALOG.map((plan) => ({
      id: plan.id,
      name: plan.name,
      detail: plan.detail,
      sessions: plan.sessions,
      minutes: plan.minutes,
      prices: {
        USD: plan.usd,
        GBP: plan.gbp,
        EUR: plan.eur,
        AED: aedFromUsd(plan.usd),
        EGP: fx ? egpFromUsd(plan.usd, fx.rate) : null,
      },
    })),
    egp: {
      rate: fx?.rate ?? null,
      date: fx?.date ?? null,
      source: frankfurterSource(),
      formula: "EGP = USD × daily Frankfurter rate",
      error,
    },
  };
}

export function planById(book: PriceBook, id: string): PricedPlan | undefined {
  return book.plans.find((plan) => plan.id === id);
}
