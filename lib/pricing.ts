import type { Currency, PlanId } from "./types";

export type CatalogPlan = {
  id: PlanId;
  name: string;
  detail: string;
  sessions: 4 | 8 | 12 | 16 | 20;
  minutes: 30 | 60;
  popular: boolean;
  usd: number;
  gbp: number;
  eur: number;
  aed: number;
};

/** 16 × 60 minutes is the owner's most popular private package. */
export const POPULAR_PLAN_ID: PlanId = "60x16";

export const EGP_FORMULA =
  "EGP = USD package price × today's Frankfurter USD→EGP mid rate" as const;

/**
 * Owner package book. USD, GBP, EUR, and AED are fixed list prices.
 * AED is not derived from a peg or from a live rate. EGP is applied later.
 */
export const CATALOG: CatalogPlan[] = [
  pack("60x4", 60, 4, 48, 44, 44, 176),
  pack("60x8", 60, 8, 88, 80, 80, 323),
  pack("60x12", 60, 12, 120, 108, 108, 441),
  pack("60x16", 60, 16, 144, 128, 128, 529),
  pack("60x20", 60, 20, 160, 140, 140, 587),
  pack("30x4", 30, 4, 28, 28, 28, 103),
  pack("30x8", 30, 8, 52, 52, 52, 191),
  pack("30x12", 30, 12, 72, 72, 72, 264),
  pack("30x16", 30, 16, 88, 88, 88, 323),
  pack("30x20", 30, 20, 100, 100, 100, 367),
];

function pack(
  id: PlanId,
  minutes: 30 | 60,
  sessions: 4 | 8 | 12 | 16 | 20,
  usd: number,
  gbp: number,
  eur: number,
  aed: number,
): CatalogPlan {
  const popular = id === POPULAR_PLAN_ID;
  return {
    id,
    name: `${sessions} × ${minutes}-minute private lessons`,
    detail: popular
      ? "Private 1-to-1. Most popular package."
      : "Private 1-to-1.",
    sessions,
    minutes,
    popular,
    usd,
    gbp,
    eur,
    aed,
  };
}

export function egpFromUsd(usd: number, usdToEgp: number): number {
  return Math.round(usd * usdToEgp * 100) / 100;
}

export type PricedPlan = {
  id: PlanId;
  name: string;
  detail: string;
  sessions: number;
  minutes: 30 | 60;
  popular: boolean;
  prices: Record<Currency, number | null>;
};

export type PriceBook = {
  plans: PricedPlan[];
  egp: {
    rate: number | null;
    date: string | null;
    cairoDay: string | null;
    source: string;
    formula: typeof EGP_FORMULA;
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
  fx: { rate: number; date: string; cairoDay?: string } | null,
  error: string | null = null,
): PriceBook {
  return {
    plans: CATALOG.map((plan) => ({
      id: plan.id,
      name: plan.name,
      detail: plan.detail,
      sessions: plan.sessions,
      minutes: plan.minutes,
      popular: plan.popular,
      prices: {
        USD: plan.usd,
        GBP: plan.gbp,
        EUR: plan.eur,
        AED: plan.aed,
        EGP: fx ? egpFromUsd(plan.usd, fx.rate) : null,
      },
    })),
    egp: {
      rate: fx?.rate ?? null,
      date: fx?.date ?? null,
      cairoDay: fx?.cairoDay ?? null,
      source: frankfurterSource(),
      formula: EGP_FORMULA,
      error,
    },
  };
}

export function planById(book: PriceBook, id: string): PricedPlan | undefined {
  return book.plans.find((plan) => plan.id === id);
}
