import { COUNTRIES } from "./countries";
import { customerAskedPrice, customerAskedTrial, discoveryDone } from "./firstReply";
import { listCurrencyForCountry } from "./money";
import { buildPriceBook, CATALOG, planById, type PriceBook } from "./pricing";
import { trialEligibility } from "./trial";
import type { Currency, TrialDecision } from "./types";

const CURRENCIES: Currency[] = ["USD", "GBP", "EUR", "AED", "EGP"];
const PLAN_IDS = CATALOG.map((plan) => plan.id);

export type FxQuote = { rate: number; date: string; cairoDay?: string } | null;

export type PricingToolResult = {
  requestedPlanId: string | null;
  requestedCurrency: string | null;
  plans: {
    id: string;
    name: string;
    detail: string;
    popular: boolean;
    prices: Record<Currency, number | null>;
  }[];
  egp: PriceBook["egp"];
  error?: string;
  rule: string;
};

export type CurrencyToolResult = {
  countryCode: string;
  knownCountry: boolean;
  currency: Currency | null;
  note: string;
};

const PRICE_RULE =
  "USD, GBP, EUR, and AED are owner list prices. AED is not derived from an exchange rate. EGP is null when today's Frankfurter USD→EGP rate is unavailable. Do not invent a number.";

export const GROK_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "get_pricing",
      description:
        "Owner package prices for private 1-to-1 lessons. Call this before quoting any price. Do not call it during discovery when no price will be quoted. Returns USD, GBP, EUR, and AED list prices, and EGP only when today's Frankfurter rate is loaded. AED is not calculated from USD.",
      parameters: {
        type: "object",
        properties: {
          plan_id: {
            type: "string",
            enum: PLAN_IDS,
            description: "Package id such as 60x16. Omit to return the full book.",
          },
          currency: {
            type: "string",
            enum: CURRENCIES,
            description: "List currency to highlight. Omit to return every list currency.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "check_trial_eligibility",
      description:
        "Decide whether a residence can have one free 30-minute live trial. Call only when the customer asked about a trial, the salesperson asked for an internal eligibility check, or discovery is done and a trial will be offered. Do not call it during discovery just to record that a country is eligible. Eligible outside Africa and Asia, with Gulf exceptions AE, SA, KW, QA, BH, and OM. Blank or unknown country is not a yes and not a denial of a known residence.",
      parameters: {
        type: "object",
        properties: {
          country_code: {
            type: "string",
            description: "ISO 3166-1 alpha-2 residence code, for example AE or EG.",
          },
        },
        required: ["country_code"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_customer_currency",
      description:
        "Choose the list currency for a known residence. Returns null when the country is blank or unknown. Null does not mean USD.",
      parameters: {
        type: "object",
        properties: {
          country_code: {
            type: "string",
            description: "ISO 3166-1 alpha-2 residence code.",
          },
        },
        required: ["country_code"],
        additionalProperties: false,
      },
    },
  },
];

const INTERNAL_NOTE = /\binternal note only\b|\brep note\b/i;

/**
 * Discovery drafts do not get price or trial tools. Those calls only add a
 * round trip and a note the customer message will not use.
 */
export function selectDeskTools(input: {
  userText: string;
  customerMessage?: string;
  notes?: string;
}): typeof GROK_TOOLS {
  const user = input.userText;
  const customer = input.customerMessage ?? "";
  const internal = INTERNAL_NOTE.test(user);
  const askedTrial = customerAskedTrial(customer) || customerAskedTrial(user);
  const askedPrice = customerAskedPrice(customer) || customerAskedPrice(user);
  const askedCurrency = /\bcurrency\b/i.test(`${user}\n${customer}`);
  const done = discoveryDone(input.notes, user);

  const names = new Set<string>();
  if (done) {
    names.add("check_trial_eligibility");
    names.add("get_pricing");
    names.add("get_customer_currency");
  }
  if (askedTrial || (internal && /\btrial\b|\beligib/i.test(user))) {
    names.add("check_trial_eligibility");
  }
  if (askedPrice || (internal && /\bprice|pricing|package/i.test(user))) {
    names.add("get_pricing");
    names.add("get_customer_currency");
  }
  if (askedCurrency) names.add("get_customer_currency");

  return GROK_TOOLS.filter((tool) => names.has(tool.function.name));
}

export function executeDeskTool(
  name: string,
  args: Record<string, unknown>,
  fx: FxQuote,
  fxError: string | null = null,
): PricingToolResult | TrialDecision | CurrencyToolResult | { error: string } {
  if (name === "get_pricing") return pricingTool(args, fx, fxError);
  if (name === "check_trial_eligibility") {
    return trialEligibility(typeof args.country_code === "string" ? args.country_code : "");
  }
  if (name === "get_customer_currency") return currencyTool(args);
  return { error: `Unknown tool ${name}.` };
}

function pricingTool(args: Record<string, unknown>, fx: FxQuote, fxError: string | null): PricingToolResult {
  const book = buildPriceBook(fx, fxError);
  const requestedPlanId = typeof args.plan_id === "string" ? args.plan_id.trim() : "";
  const requestedCurrency = typeof args.currency === "string" ? args.currency.trim().toUpperCase() : "";

  if (requestedCurrency && !CURRENCIES.includes(requestedCurrency as Currency)) {
    return {
      requestedPlanId: requestedPlanId || null,
      requestedCurrency,
      plans: [],
      egp: book.egp,
      error: "Unknown currency.",
      rule: PRICE_RULE,
    };
  }

  if (requestedPlanId) {
    const plan = planById(book, requestedPlanId);
    if (!plan) {
      return {
        requestedPlanId,
        requestedCurrency: requestedCurrency || null,
        plans: [],
        egp: book.egp,
        error: "Unknown plan.",
        rule: PRICE_RULE,
      };
    }
    return {
      requestedPlanId,
      requestedCurrency: requestedCurrency || null,
      plans: [plan],
      egp: book.egp,
      rule: PRICE_RULE,
    };
  }

  return {
    requestedPlanId: null,
    requestedCurrency: requestedCurrency || null,
    plans: book.plans,
    egp: book.egp,
    rule: PRICE_RULE,
  };
}

function currencyTool(args: Record<string, unknown>): CurrencyToolResult {
  const countryCode = typeof args.country_code === "string" ? args.country_code.trim().toUpperCase() : "";
  const knownCountry = Boolean(countryCode && COUNTRIES[countryCode]);
  const currency = listCurrencyForCountry(countryCode);
  return {
    countryCode,
    knownCountry,
    currency,
    note: currency
      ? "Use this list currency when you call get_pricing. The number still has to come from get_pricing."
      : "Residence is blank or unknown. Do not assume USD.",
  };
}
