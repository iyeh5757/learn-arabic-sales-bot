import assert from "node:assert/strict";
import test from "node:test";
import { buildGrokSystem, customerDraft, respondLocally, type AssistInput } from "../lib/assistant";
import { COUNTRIES } from "../lib/countries";
import { stubResult } from "../lib/integrations";
import { cairoCalendarDay, clearFxCache, getUsdToEgp, parseFrankfurter } from "../lib/frankfurter";
import { buildPriceBook, CATALOG, egpFromUsd, EGP_FORMULA } from "../lib/pricing";
import { CONFIGURATION_REQUIRED, shiftsStatus } from "../lib/reps";
import { GULF_COUNTRIES, trialEligibility } from "../lib/trial";
import { grokCredentials } from "../lib/grok";

const GULF = new Set<string>(GULF_COUNTRIES);

test("trial eligibility follows continent with a Gulf exception", () => {
  for (const [code, country] of Object.entries(COUNTRIES)) {
    const decision = trialEligibility(code);
    assert.equal(decision.countryCode, code);
    assert.equal(decision.continent, country.continent);
    if (country.continent === "Africa") {
      assert.equal(decision.eligible, false);
      assert.equal(decision.region, "africa");
    } else if (country.continent === "Asia") {
      assert.equal(decision.eligible, GULF.has(code));
      assert.equal(decision.region, GULF.has(code) ? "gulf" : "asia");
    } else {
      assert.equal(decision.eligible, true);
      assert.equal(decision.region, "other");
    }
  }
});

test("Gulf codes are Asia and still eligible", () => {
  for (const code of GULF_COUNTRIES) {
    assert.equal(COUNTRIES[code].continent, "Asia");
    const decision = trialEligibility(` ${code.toLowerCase()} `);
    assert.equal(decision.eligible, true);
    assert.equal(decision.region, "gulf");
  }
  assert.equal(trialEligibility("EG").eligible, false);
  assert.equal(trialEligibility("IN").eligible, false);
  assert.equal(trialEligibility("YE").eligible, false);
  assert.equal(trialEligibility("GB").eligible, true);
  assert.equal(trialEligibility("US").eligible, true);
  assert.equal(trialEligibility("").eligible, false);
  assert.equal(trialEligibility("ZZ").region, "unknown");
});

test("package prices match the owner tables and EGP uses the USD price", () => {
  const expected = {
    "60x4": { usd: 48, gbp: 44, eur: 44, aed: 176 },
    "60x8": { usd: 88, gbp: 80, eur: 80, aed: 323 },
    "60x12": { usd: 120, gbp: 108, eur: 108, aed: 441 },
    "60x16": { usd: 144, gbp: 128, eur: 128, aed: 529 },
    "60x20": { usd: 160, gbp: 140, eur: 140, aed: 587 },
    "30x4": { usd: 28, gbp: 28, eur: 28, aed: 103 },
    "30x8": { usd: 52, gbp: 52, eur: 52, aed: 191 },
    "30x12": { usd: 72, gbp: 72, eur: 72, aed: 264 },
    "30x16": { usd: 88, gbp: 88, eur: 88, aed: 323 },
    "30x20": { usd: 100, gbp: 100, eur: 100, aed: 367 },
  } as const;

  assert.equal(CATALOG.length, 10);
  assert.equal(CATALOG.some((plan) => plan.id.includes("group")), false);
  const book = buildPriceBook({ rate: 52.052, date: "2026-09-30", cairoDay: "2026-09-30" });
  assert.equal(book.plans.length, 10);
  for (const plan of book.plans) {
    const row = expected[plan.id];
    assert.equal(plan.prices.USD, row.usd);
    assert.equal(plan.prices.GBP, row.gbp);
    assert.equal(plan.prices.EUR, row.eur);
    assert.equal(plan.prices.AED, row.aed);
    assert.equal(plan.prices.EGP, egpFromUsd(row.usd, 52.052));
    assert.notEqual(plan.prices.AED, Math.round(row.usd * 3.6725 * 100) / 100);
  }
  assert.equal(book.plans.find((plan) => plan.popular)?.id, "60x16");
  assert.equal(book.plans.find((plan) => plan.id === "60x16")?.prices.USD, 144);
  assert.equal(book.plans.find((plan) => plan.id === "60x16")?.prices.AED, 529);
  assert.equal(book.plans.find((plan) => plan.id === "60x16")?.prices.EGP, 7495.49);
  assert.equal(book.egp.formula, EGP_FORMULA);

  const missing = buildPriceBook(null, "offline");
  assert.equal(missing.plans.find((plan) => plan.id === "60x16")?.prices.EGP, null);
  assert.equal(missing.plans.find((plan) => plan.id === "60x16")?.prices.AED, 529);
  assert.equal(missing.egp.error, "offline");
});

test("Frankfurter parser accepts v2 rows and a rates object", () => {
  assert.deepEqual(
    parseFrankfurter([
      { date: "2026-09-29", base: "USD", quote: "EGP", rate: 50 },
      { date: "2026-09-30", base: "USD", quote: "EGP", rate: 52.052 },
      { date: "2026-09-30", base: "EUR", quote: "EGP", rate: 59 },
    ]),
    { rate: 52.052, date: "2026-09-30" },
  );
  assert.deepEqual(parseFrankfurter({ date: "2026-09-30", rates: { EGP: 52.052 } }), {
    rate: 52.052,
    date: "2026-09-30",
  });
  assert.throws(() => parseFrankfurter({ date: "2026-09-30", rates: { GBP: 0.75 } }));
});

test("the USD to EGP rate is cached for the Cairo day", async () => {
  const beforeMidnight = cairoCalendarDay(new Date("2026-03-01T20:00:00.000Z"));
  const afterMidnight = cairoCalendarDay(new Date("2026-03-01T23:00:00.000Z"));
  assert.equal(beforeMidnight, "2026-03-01");
  assert.equal(afterMidnight, "2026-03-02");

  clearFxCache();
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return new Response(
      JSON.stringify([{ date: "2026-09-30", base: "USD", quote: "EGP", rate: 52.052 }]),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  const first = await getUsdToEgp(fetchImpl);
  const second = await getUsdToEgp(fetchImpl);
  assert.equal(calls, 1);
  assert.equal(first.rate, 52.052);
  assert.equal(second.cairoDay, cairoCalendarDay());
  clearFxCache();
});

test("customer drafts obey trial and escalation rules", () => {
  const egypt = respondLocally(sample({
    countryCode: "EG",
    currency: "EGP",
    customerName: "Omar Hassan",
    rep: "Kamal",
    planId: "60x16",
    customerMessage: "Do you have a free trial?",
  }));
  assert.match(egypt.text, /not available/i);
  assert.doesNotMatch(egypt.text, /book a free 30-minute/i);
  assert.doesNotMatch(egypt.text, /quiz/i);
  assert.match(egypt.text, /7,495\.49/);
  assert.match(egypt.text, /private 1-to-1/i);

  const uae = respondLocally(sample({
    countryCode: "AE",
    currency: "AED",
    customerName: "Fatima Al Nahyan",
    rep: "Rebeb",
    customerMessage: "Can I try a class before I pay?",
  }));
  assert.match(uae.text, /free 30-minute live trial/i);
  assert.match(uae.text, /529\.00/);
  assert.doesNotMatch(uae.text, /quiz/i);
  assert.equal(uae.facts.trial.region, "gulf");

  const discount = respondLocally(sample({
    countryCode: "DE",
    currency: "EUR",
    customerName: "Lukas Weber",
    customerMessage: "I want a discount on the 16-session package.",
    planId: "60x16",
  }));
  assert.match(discount.text, /Islam Yehia/);
  assert.match(discount.text, /\+201093570811/);
  assert.doesNotMatch(discount.text, /book a free 30-minute/i);
  assert.equal(discount.facts.escalation.required, true);

  const direct = customerDraft(
    sample({ countryCode: "GB", currency: "GBP", customerName: "Sarah Mitchell", rep: "Asmaa" }),
    respondLocally(sample({ countryCode: "GB", currency: "GBP", customerName: "Sarah Mitchell", rep: "Asmaa" })).facts,
  );
  assert.match(direct, /free 30-minute live trial/i);
  assert.match(direct, /Asmaa/);
  assert.match(direct, /most popular/i);
  assert.doesNotMatch(direct, /quiz/i);
});

test("Grok prompt carries the Gulf rule and escalation contact", () => {
  const input = sample({ countryCode: "EG" });
  const facts = respondLocally(input).facts;
  const prompt = buildGrokSystem(input, facts);
  assert.match(prompt, /AE, SA, KW, QA, BH, and OM/);
  assert.match(prompt, /Islam Yehia/);
  assert.match(prompt, /\+201093570811/);
  assert.match(prompt, /do not offer a free 30-minute live trial/i);
  assert.match(prompt, /do not mention a quiz/i);
  assert.match(prompt, /private 1-to-1/i);
  assert.match(prompt, /Do not invent group-class packages/);
  assert.match(prompt, /"AED": 529/);
  assert.match(prompt, /"eligible": false/);
});

test("empty shifts are configuration required and integrations stay stubs", () => {
  assert.equal(shiftsStatus(0), CONFIGURATION_REQUIRED);
  assert.equal(shiftsStatus(2), "ready");
  const stub = stubResult("evolution", { to: "+971500000003", text: "hello" });
  assert.equal(stub.ok, false);
  assert.equal(stub.stub, true);
  assert.match(stub.message, /Nothing was sent/);
  assert.equal(stubResult("payments", { amount: 22 }).provider, "payments");
});

test("XAI_API_KEY takes precedence over GROK_API_KEY", () => {
  const previousXai = process.env.XAI_API_KEY;
  const previousGrok = process.env.GROK_API_KEY;
  process.env.XAI_API_KEY = "xai-test";
  process.env.GROK_API_KEY = "grok-test";
  assert.equal(grokCredentials().source, "XAI_API_KEY");
  delete process.env.XAI_API_KEY;
  assert.equal(grokCredentials().source, "GROK_API_KEY");
  delete process.env.GROK_API_KEY;
  assert.equal(grokCredentials().key, null);
  if (previousXai === undefined) delete process.env.XAI_API_KEY;
  else process.env.XAI_API_KEY = previousXai;
  if (previousGrok === undefined) delete process.env.GROK_API_KEY;
  else process.env.GROK_API_KEY = previousGrok;
});

function sample(overrides: Partial<AssistInput>): AssistInput {
  return {
    userText: "Draft a reply to the customer.",
    customerName: "Sarah Mitchell",
    customerMessage: "Can I book a trial?",
    countryCode: "GB",
    rep: "Asmaa",
    currency: "USD",
    program: "egyptian",
    planId: "60x16",
    egpRate: 52.052,
    egpDate: "2026-09-30",
    egpError: null,
    ...overrides,
  };
}
