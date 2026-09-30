import assert from "node:assert/strict";
import test from "node:test";
import { buildGrokSystem, customerDraft, respondLocally, type AssistInput } from "../lib/assistant";
import { COUNTRIES } from "../lib/countries";
import { parseFrankfurter } from "../lib/frankfurter";
import { stubResult } from "../lib/integrations";
import { aedFromUsd, buildPriceBook, egpFromUsd } from "../lib/pricing";
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

test("AED list prices use the dirham peg and EGP uses the supplied rate", () => {
  assert.equal(aedFromUsd(22), 80.8);
  assert.equal(aedFromUsd(48), 176.28);
  assert.equal(aedFromUsd(15), 55.09);
  assert.equal(aedFromUsd(88), 323.18);
  assert.equal(aedFromUsd(176), 646.36);
  assert.equal(aedFromUsd(264), 969.54);
  assert.equal(egpFromUsd(22, 52.052), 1145.14);

  const book = buildPriceBook({ rate: 52.052, date: "2026-09-30" });
  const byId = Object.fromEntries(book.plans.map((plan) => [plan.id, plan]));
  assert.equal(byId["starter"].prices.USD, (byId["private-30"].prices.USD ?? 0) * 4);
  assert.equal(byId["starter"].prices.GBP, (byId["private-30"].prices.GBP ?? 0) * 4);
  assert.equal(byId["starter"].prices.EUR, (byId["private-30"].prices.EUR ?? 0) * 4);
  assert.equal(byId["standard"].prices.USD, (byId["private-30"].prices.USD ?? 0) * 8);
  assert.equal(byId["intensive"].prices.USD, (byId["private-30"].prices.USD ?? 0) * 12);
  assert.equal(byId["private-60"].prices.USD, 48);
  assert.equal(byId["private-30"].prices.EGP, 1145.14);
  assert.equal(book.egp.formula, "EGP = USD × daily Frankfurter rate");

  const missing = buildPriceBook(null, "offline");
  assert.equal(missing.plans[0].prices.EGP, null);
  assert.equal(missing.plans[0].prices.USD, 22);
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

test("customer drafts obey trial and escalation rules", () => {
  const egypt = respondLocally(sample({
    countryCode: "EG",
    currency: "EGP",
    customerName: "Omar Hassan",
    rep: "Kamal",
    planId: "private-60",
    customerMessage: "Do you have a free trial?",
  }));
  assert.match(egypt.text, /not available/i);
  assert.doesNotMatch(egypt.text, /book a free trial/i);
  assert.match(egypt.text, /2,498\.50/);

  const uae = respondLocally(sample({
    countryCode: "AE",
    currency: "AED",
    customerName: "Fatima Al Nahyan",
    rep: "Rebeb",
    customerMessage: "Can I try a class before I pay?",
  }));
  assert.match(uae.text, /free trial lesson/i);
  assert.equal(uae.facts.trial.region, "gulf");

  const discount = respondLocally(sample({
    countryCode: "DE",
    currency: "EUR",
    customerName: "Lukas Weber",
    customerMessage: "I want a discount on the intensive plan.",
    planId: "intensive",
  }));
  assert.match(discount.text, /Islam Yehia/);
  assert.match(discount.text, /\+201093570811/);
  assert.doesNotMatch(discount.text, /book a free trial/i);
  assert.equal(discount.facts.escalation.required, true);

  const direct = customerDraft(
    sample({ countryCode: "GB", currency: "GBP", customerName: "Sarah Mitchell", rep: "Asmaa" }),
    respondLocally(sample({ countryCode: "GB", currency: "GBP", customerName: "Sarah Mitchell", rep: "Asmaa" })).facts,
  );
  assert.match(direct, /free trial lesson/i);
  assert.match(direct, /Asmaa/);
});

test("Grok prompt carries the Gulf rule and escalation contact", () => {
  const input = sample({ countryCode: "EG" });
  const facts = respondLocally(input).facts;
  const prompt = buildGrokSystem(input, facts);
  assert.match(prompt, /AE, SA, KW, QA, BH, and OM/);
  assert.match(prompt, /Islam Yehia/);
  assert.match(prompt, /\+201093570811/);
  assert.match(prompt, /do not offer a live trial/i);
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
    planId: "private-30",
    egpRate: 52.052,
    egpDate: "2026-09-30",
    egpError: null,
    ...overrides,
  };
}
