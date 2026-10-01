import assert from "node:assert/strict";
import test from "node:test";
import { replyWithoutGrok } from "../lib/assistant";
import { applyFirstReplyGuard, customerUtterance, discoverySlotsLookFilled, firstDraftViolations, noteWorthShowing, presentReply, replyForModel, splitReply } from "../lib/firstReply";
import { COUNTRIES } from "../lib/countries";
import { stubResult } from "../lib/integrations";
import { cairoCalendarDay, clearFxCache, getUsdToEgp, parseFrankfurter } from "../lib/frankfurter";
import { buildPriceBook, CATALOG, egpFromUsd, EGP_FORMULA } from "../lib/pricing";
import { buildGrokSystem, MASTER_PROMPT, readMasterOperatingSpec } from "../lib/prompt";
import { CONFIGURATION_REQUIRED, shiftsStatus } from "../lib/reps";
import { freshDesk, mergeDemoLeads } from "../lib/store";
import { seedLeads } from "../lib/seed";
import { executeDeskTool, selectDeskTools, type CurrencyToolResult, type PricingToolResult } from "../lib/tools";
import { GULF_COUNTRIES, trialEligibility } from "../lib/trial";
import { grokCredentials, isDraftTimeout, GROK_BUDGET_MS, GROK_ROUND_TIMEOUT_MS } from "../lib/grok";
import type { TrialDecision } from "../lib/types";

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

test("a fresh desk has no leads until demo data is loaded", () => {
  const fresh = freshDesk();
  assert.deepEqual(fresh.leads, []);
  assert.deepEqual(fresh.shifts, []);
  const once = mergeDemoLeads(fresh.leads);
  assert.equal(once.added, seedLeads().length);
  assert.equal(once.leads[0]?.name, "Sarah Mitchell");
  const twice = mergeDemoLeads(once.leads);
  assert.equal(twice.added, 0);
  assert.equal(twice.leads.length, once.leads.length);
});

test("desk tools return owner facts and a blank currency stays null", () => {
  const fx = { rate: 52.052, date: "2026-09-30", cairoDay: "2026-10-01" };
  const ae = executeDeskTool("check_trial_eligibility", { country_code: "ae" }, fx, null) as TrialDecision;
  assert.equal(ae.eligible, true);
  assert.equal(ae.region, "gulf");
  const eg = executeDeskTool("check_trial_eligibility", { country_code: "EG" }, null, "offline") as TrialDecision;
  assert.equal(eg.eligible, false);
  assert.equal(eg.region, "africa");

  const aed = executeDeskTool("get_customer_currency", { country_code: "AE" }, null, null) as CurrencyToolResult;
  assert.equal(aed.currency, "AED");
  const blank = executeDeskTool("get_customer_currency", { country_code: " " }, null, null) as CurrencyToolResult;
  assert.equal(blank.currency, null);
  const unknown = executeDeskTool("get_customer_currency", { country_code: "ZZ" }, null, null) as CurrencyToolResult;
  assert.equal(unknown.currency, null);

  const priced = executeDeskTool("get_pricing", { plan_id: "60x16", currency: "AED" }, fx, null) as PricingToolResult;
  assert.equal(priced.plans.length, 1);
  assert.equal(priced.plans[0]?.prices.USD, 144);
  assert.equal(priced.plans[0]?.prices.AED, 529);
  assert.equal(priced.plans[0]?.prices.EGP, 7495.49);

  const missing = executeDeskTool("get_pricing", { plan_id: "60x16", currency: "EGP" }, null, "offline") as PricingToolResult;
  assert.equal(missing.plans[0]?.prices.USD, 144);
  assert.equal(missing.plans[0]?.prices.AED, 529);
  assert.equal(missing.plans[0]?.prices.EGP, null);
});

test("a missing Grok key does not invent a customer draft", () => {
  const draftOnly = replyWithoutGrok({
    reason: "unconfigured",
    userText: "Draft a customer reply for me to copy. Do not send it.",
    customerMessage: "Hello, I will think about it.",
    countryCode: "EG",
    currency: "EGP",
    planId: "60x16",
    fx: { rate: 52.052, date: "2026-09-30" },
    fxError: null,
  });
  assert.match(draftOnly.text, /Grok is not connected/);
  assert.equal(draftOnly.source, "unconfigured");
  assert.doesNotMatch(draftOnly.text, /Draft to copy/);
  assert.doesNotMatch(draftOnly.text, /Hi /);
  assert.doesNotMatch(draftOnly.text, /7,495/);
  assert.doesNotMatch(draftOnly.text, /Verified tool facts/);

  const trialAsk = replyWithoutGrok({
    reason: "unconfigured",
    userText: "Check trial eligibility",
    customerMessage: "Do you have a free trial?",
    countryCode: "EG",
    fx: null,
    fxError: "offline",
  });
  assert.match(trialAsk.text, /Grok is not connected/);
  assert.match(trialAsk.text, /Verified tool facts/);
  assert.match(trialAsk.text, /Africa/);
  assert.match(trialAsk.text, /Eligible: no/);
  assert.doesNotMatch(trialAsk.text, /Draft to copy/);
  assert.doesNotMatch(trialAsk.text, /Hi /);

  const priceAsk = replyWithoutGrok({
    reason: "unconfigured",
    userText: "What is the price of 16 sessions?",
    planId: "60x16",
    currency: "AED",
    fx: null,
    fxError: "offline",
  });
  assert.match(priceAsk.text, /529\.00/);
  assert.match(priceAsk.text, /EGP is unavailable/);
  assert.match(priceAsk.text, /Grok is not connected/);
  assert.doesNotMatch(priceAsk.text, /Draft to copy/);

  const failed = replyWithoutGrok({
    reason: "unavailable",
    userText: "Draft a customer reply for me to copy.",
    grokError: "socket hang up",
    fx: null,
    fxError: null,
  });
  assert.equal(failed.source, "unavailable");
  assert.match(failed.text, /did not respond/);
  assert.match(failed.text, /socket hang up/);
  assert.doesNotMatch(failed.text, /Draft to copy/);
  assert.doesNotMatch(failed.text, /Verified tool facts/);

  const timedOut = replyWithoutGrok({
    reason: "unavailable",
    userText: "Draft a customer reply for me to copy.",
    grokError: "The operation was aborted due to timeout",
    fx: null,
    fxError: null,
  });
  assert.match(timedOut.text, /took too long/);
  assert.match(timedOut.text, /Try again/);
  assert.doesNotMatch(timedOut.text, /aborted due to timeout/);
  assert.doesNotMatch(timedOut.text, /Draft to copy/);
});

test("Grok prompt carries the production rules and stays blank without context", () => {
  const prompt = buildGrokSystem({});
  assert.match(prompt, /Mode A/);
  assert.match(prompt, /creative language \/ strict facts/i);
  assert.match(prompt, /conversation intelligence/i);
  assert.match(prompt, /Answer the customer's actual question first/);
  assert.match(prompt, /ONE QUESTION AT A TIME/);
  assert.match(prompt, /get_pricing/);
  assert.match(prompt, /check_trial_eligibility/);
  assert.match(prompt, /get_customer_currency/);
  assert.match(prompt, /AE, SA, KW, QA, BH, and OM/);
  assert.match(prompt, /Islam Yehia/);
  assert.match(prompt, /\+201093570811/);
  assert.match(prompt, /Do not mention a quiz/);
  assert.match(prompt, /private 1-to-1/);
  assert.match(prompt, /no group-class package/i);
  assert.match(prompt, /Do not invent an EGP figure/);
  assert.match(prompt, /Never derive AED/);
  assert.match(prompt, /do not pretend the customer uses USD/i);
  assert.match(prompt, /Note to the salesperson/);
  assert.match(prompt, /Draft to copy/);
  assert.match(prompt, /OPTIONAL CONTEXT is blank/);
  assert.doesNotMatch(prompt, /Sarah Mitchell/);

  const filled = buildGrokSystem({
    customerName: "Nora",
    countryCode: "ae",
    program: "gulf",
    notes: "Wants evenings",
  });
  assert.match(filled, /Nora/);
  assert.match(filled, /"countryCode": "AE"/);
  assert.match(filled, /Gulf\/Khaliji/);
  assert.match(filled, /Wants evenings/);
  assert.doesNotMatch(filled, /OPTIONAL CONTEXT is blank/);

  const ahmed = buildGrokSystem({
    customerName: "Ahmed",
    countryCode: "DE",
    program: "egyptian",
    rep: "Asmaa",
    customerMessage: "hey i want to start online sessions",
  });
  assert.match(ahmed, /UNDERSTAND → BUILD TRUST → QUALIFY → PERSONALIZE/);
  assert.match(ahmed, /Do not open with a trial/);
  assert.match(ahmed, /one discovery question/i);
  assert.match(ahmed, /THIS MESSAGE IS EARLY/);
  assert.match(ahmed, /Hey Ahmed, good to hear from you/);
  assert.match(ahmed, /Do not call check_trial_eligibility on this turn/);
  assert.match(ahmed, /Omit the salesperson note/);
  assert.doesNotMatch(ahmed, /Call check_trial_eligibility only so the note/);

  const gated = buildGrokSystem({
    customerName: "Adam",
    countryCode: "DE",
    program: "egyptian",
    rep: "Kamal",
    customerMessage: "I want to speak with my wife's family. I don't know any Arabic.",
    enabledTools: [],
  });
  assert.match(gated, /TOOLS THIS TURN: none/);

  const follow = buildGrokSystem({
    customerName: "Adam",
    countryCode: "DE",
    program: "egyptian",
    rep: "Kamal",
    notes: "Complete beginner. Goal is talking with Egyptian in-laws.",
    customerMessage: "I want to speak with my wife's family. I don't know any Arabic.",
    followUp: true,
    enabledTools: [],
  });
  assert.match(follow, /THIS IS A FOLLOW-UP/);
  assert.match(follow, /still missing/);
  assert.doesNotMatch(follow, /THIS MESSAGE IS EARLY/);
  assert.doesNotMatch(follow, /DISCOVERY SLOTS ARE FILLED/);
  assert.ok(follow.lastIndexOf("VOICE —") > follow.lastIndexOf("TOOLS THIS TURN"));
  assert.match(follow, /Weekends — noted, Adam/);
  assert.match(follow, /Weekends works, Adam/);
  assert.match(follow, /Sign this draft with Kamal/);

  const unsigned = buildGrokSystem({
    customerName: "Adam",
    customerMessage: "weekends",
    notes: "Complete beginner. Goal is family.",
    followUp: true,
    enabledTools: ["check_trial_eligibility"],
  });
  assert.match(unsigned, /DISCOVERY SLOTS ARE FILLED/);
  assert.match(unsigned, /do not summarize/i);
  assert.match(unsigned, /No rep is selected/);
  assert.match(unsigned, /Do not write Learn Arabic Academy as a signature/);
  assert.doesNotMatch(unsigned, /THIS IS A FOLLOW-UP/);
  assert.ok(unsigned.endsWith("Do not write Learn Arabic Academy as a signature."));
});

test("owner master spec is the draft brain and section 16 matches the catalogue", () => {
  const spec = readMasterOperatingSpec();
  assert.equal(spec, MASTER_PROMPT);
  assert.doesNotMatch(spec, /full operating specification is missing/);
  assert.match(spec, /MASTER AI SALES & CUSTOMER OPERATIONS AGENT/);
  assert.match(spec, /136\. ABSOLUTE FINAL RULE/);
  assert.match(spec, /END OF MASTER INSTRUCTION/);
  assert.match(spec, /https:\/\/www\.learnarabic08\.com\//);
  assert.match(spec, /CREATIVE WITH LANGUAGE/);
  assert.match(spec, /ASK ONE MAIN QUESTION AT A TIME/);

  const prompt = buildGrokSystem({});
  assert.ok(prompt.includes(spec));
  assert.ok(prompt.indexOf("END OF MASTER INSTRUCTION") < prompt.indexOf("MODE A — THIS DESK"));
  assert.ok(prompt.indexOf("MODE A — THIS DESK") < prompt.lastIndexOf("VOICE —"));
  assert.match(prompt, /get_pricing is the configured pricing backend/);
  assert.match(prompt, /check_trial_eligibility is the configured trial-location backend/);
  assert.match(prompt, /Do not copy a price out of the master/);
  assert.match(prompt, /no book or pay tools/i);
  assert.match(prompt, /If EGP is null or the tool is unavailable/);

  const sixty = spec.split("30-MINUTE PACKAGES:")[0].split("60-MINUTE PACKAGES:")[1];
  const thirty = spec.split("30-MINUTE PACKAGES:")[1].split("EGP PRICING:")[0];
  assert.ok(sixty && thirty);
  for (const plan of CATALOG) {
    const block = plan.minutes === 60 ? sixty : thirty;
    const chunk = block.split(`${plan.sessions} sessions:`)[1]?.split(/^\d+ sessions:/m)[0] ?? "";
    assert.match(chunk, new RegExp(`USD ${plan.usd}\\b`));
    assert.match(chunk, new RegExp(`GBP ${plan.gbp}\\b`));
    assert.match(chunk, new RegExp(`EUR ${plan.eur}\\b`));
    assert.match(chunk, new RegExp(`AED ${plan.aed}\\b`));
  }
  assert.match(spec, /EGP PRICING:[\s\S]{0,200}NOT CONFIGURED/);
  assert.deepEqual(
    CATALOG.filter((plan) => plan.popular).map((plan) => plan.id),
    ["60x16"],
  );
});

test("Ahmed in Germany gets a welcome, not a trial or a price list", () => {
  const bad = [
    "Note to the salesperson",
    "Germany is eligible for a free 30-minute live trial. Keep that internal.",
    "",
    "Draft to copy",
    "Hey Ahmed! You can start with a free trial.",
    "Our most popular 16 × 60-minute package is £128.",
    "Sign up at https://signup.learnarabic08.com/",
  ].join("\n");

  const guarded = applyFirstReplyGuard({
    reply: bad,
    customerName: "Ahmed",
    customerMessage: "hey i want to start online sessions",
    program: "egyptian",
    rep: "Asmaa",
    userText: "what should I reply?",
  });

  assert.equal(guarded.rewritten, true);
  assert.equal(firstDraftViolations(guarded.customerDraft).length, 0);
  assert.match(guarded.customerDraft, /Ahmed/);
  assert.match(guarded.customerDraft, /Egyptian Arabic/);
  assert.match(guarded.customerDraft, /one-to-one/);
  assert.match(guarded.customerDraft, /Asmaa/);
  assert.equal((guarded.customerDraft.match(/\?/g) ?? []).length, 1);
  assert.doesNotMatch(guarded.customerDraft, /trial/i);
  assert.doesNotMatch(guarded.customerDraft, /most popular/i);
  assert.doesNotMatch(guarded.customerDraft, /16\s*[×x]\s*60/i);
  assert.doesNotMatch(guarded.customerDraft, /£|€|\$|\bGBP\b|\b128\b/);
  assert.doesNotMatch(guarded.customerDraft, /signup\.learnarabic|https?:\/\//i);
  assert.match(guarded.note, /Germany is eligible/);
  assert.doesNotMatch(guarded.customerDraft, /eligible/i);

  const unheaded = "Hi Ahmed, book a free 30-minute trial. The most popular 16×60 is £128.";
  const fromDump = applyFirstReplyGuard({
    reply: unheaded,
    customerName: "Ahmed",
    customerMessage: "hey i want to start online sessions",
    program: "egyptian",
    rep: "Asmaa",
    userText: "Draft a short WhatsApp reply for me to copy.",
  });
  assert.equal(fromDump.rewritten, true);
  assert.equal(firstDraftViolations(fromDump.customerDraft).length, 0);
  assert.doesNotMatch(fromDump.customerDraft, /trial|most popular|£/i);

  const unconfigured = replyWithoutGrok({
    reason: "unconfigured",
    userText: [
      "Draft a short WhatsApp reply for me to copy. Do not send it.",
      "If they only said they want to start, welcome them and ask one question about their level or their goal.",
      "",
      "Customer message:",
      "hey i want to start online sessions",
    ].join("\n"),
    customerMessage: "hey i want to start online sessions",
    customerName: "Ahmed",
    countryCode: "DE",
    program: "egyptian",
    planId: "60x16",
    currency: "GBP",
    fx: { rate: 51.973, date: "2026-10-01" },
    fxError: null,
  });
  assert.match(unconfigured.text, /Grok is not connected/);
  assert.doesNotMatch(unconfigured.text, /Verified tool facts/);
  assert.doesNotMatch(unconfigured.text, /most popular/i);
  assert.doesNotMatch(unconfigured.text, /£128|\$144|16 × 60/);
  assert.doesNotMatch(unconfigured.text, /Draft to copy/);
  assert.doesNotMatch(unconfigured.text, /free 30-minute live trial/i);

  const priceAsk = applyFirstReplyGuard({
    reply: "Draft to copy\nThe 16 × 60-minute package is £128.",
    customerMessage: "how much is the 16 session package?",
    customerName: "Ahmed",
    program: "egyptian",
    rep: "Asmaa",
  });
  assert.equal(priceAsk.rewritten, false);
  assert.match(priceAsk.customerDraft, /£128/);

  const nextStep = applyFirstReplyGuard({
    reply: "Draft to copy\nWeekends works, Adam. Want to try a free 30-minute lesson with a teacher?\nKamal",
    customerMessage: "weekends",
    notes: "Complete beginner. Goal is family.",
    customerName: "Adam",
    rep: "Kamal",
  });
  assert.equal(nextStep.rewritten, false);
  assert.match(nextStep.customerDraft, /30-minute/);

  const priced = applyFirstReplyGuard({
    reply: "Draft to copy\nThe 16 × 60-minute package is £128.",
    customerMessage: "weekends",
    notes: "Complete beginner. Goal is family.",
    customerName: "Adam",
    rep: "Kamal",
  });
  assert.equal(priced.rewritten, true);
  assert.doesNotMatch(priced.customerDraft, /£128/);
});

test("a discovery draft drops routine notes and keeps the customer text", () => {
  const screenshot = [
    "Note to the salesperson",
    "Checked check_trial_eligibility for DE (Germany): eligible. Do not mention the trial, eligibility, a package, or any price — they still have not asked, and the salesperson has not said discovery is done. Did not call get_pricing. Known: Egyptian, complete beginner, goal is talking with Egyptian in-laws. Still unknown: schedule. Islam Yehia does not need this thread.",
    "",
    "Draft to copy",
    "That makes a lot of sense, Adam — being able to speak with your in-laws in Egyptian Arabic is a really good reason to start from the beginning.",
    "When are you usually free for lessons — weekdays, evenings, or weekends?",
    "Kamal",
  ].join("\n");

  const presented = presentReply(screenshot);
  assert.equal(presented.showNote, false);
  assert.equal(presented.note, "");
  assert.match(presented.draft, /Adam/);
  assert.match(presented.draft, /Kamal/);
  assert.equal(presented.copyText, presented.draft);
  assert.doesNotMatch(presented.copyText, /Note to the salesperson|eligible|Islam/);

  const trailing = [
    "Draft to copy",
    "Hey Adam, weekday evenings work.",
    "Kamal",
    "",
    "Note to the salesperson",
    "Egypt is not eligible. Do not offer a trial.",
  ].join("\n");
  const gotcha = presentReply(trailing);
  assert.equal(gotcha.showNote, true);
  assert.match(gotcha.note, /not eligible/);
  assert.doesNotMatch(gotcha.draft, /not eligible/);
  assert.equal(splitReply(trailing).hasDraftHeading, true);

  assert.equal(noteWorthShowing("None"), false);
  assert.equal(noteWorthShowing("Escalate to Islam Yehia on +201093570811."), true);
  assert.equal(noteWorthShowing(""), false);

  const plain = presentReply("Hey Adam, when are you free?\nKamal");
  assert.equal(plain.hasDraftHeading, false);
  assert.equal(plain.copyText, "Hey Adam, when are you free?\nKamal");

  const asked = presentReply("Note to the salesperson\nGermany is eligible for the free 30-minute trial.");
  assert.equal(asked.showNote, true);
  assert.match(asked.note, /eligible/);
  assert.equal(asked.copyText, "");

  const forwarded = replyForModel(screenshot);
  assert.match(forwarded, /^Draft to copy/);
  assert.doesNotMatch(forwarded, /check_trial_eligibility|Islam Yehia/);
  assert.match(forwarded, /Kamal/);
});

test("discovery turns do not receive trial or price tools", () => {
  const draft = selectDeskTools({
    userText: [
      "Draft a short WhatsApp reply for me to copy. Do not send it.",
      "Customer message:",
      "hey i want to start online sessions",
    ].join("\n"),
    customerMessage: "hey i want to start online sessions",
    notes: "Complete beginner. Goal is talking with Egyptian in-laws.",
  }).map((tool) => tool.function.name);
  assert.deepEqual(draft, []);

  const price = selectDeskTools({
    userText: "What should I reply?",
    customerMessage: "how much is the 16 session package?",
  }).map((tool) => tool.function.name);
  assert.deepEqual(price, ["get_pricing", "get_customer_currency"]);

  const trial = selectDeskTools({
    userText: "Internal note only for me, not a customer draft. Is a trial allowed for this residence?",
    customerMessage: "hey i want to start online sessions",
  }).map((tool) => tool.function.name);
  assert.deepEqual(trial, ["check_trial_eligibility"]);

  const ready = selectDeskTools({
    userText: "Draft a reply",
    customerMessage: "Sounds good",
    notes: "discovery is done",
  }).map((tool) => tool.function.name);
  assert.deepEqual(ready, ["get_pricing", "check_trial_eligibility", "get_customer_currency"]);

  const closing = selectDeskTools({
    userText: "The customer just said this. Write the next WhatsApp reply.\n\nCustomer just said:\nweeekends",
    customerMessage: "weeekends",
    notes: "Complete beginner. Goal is family.",
  }).map((tool) => tool.function.name);
  assert.deepEqual(closing, ["check_trial_eligibility"]);

  const deskAsk = selectDeskTools({
    userText: "Desk question only. This is not the customer speaking. Do not add it to their goal, level, or schedule.\n\nWho is on shift?",
    customerMessage: "hey i want to start online sessions",
  }).map((tool) => tool.function.name);
  assert.deepEqual(deskAsk, []);
  assert.equal(
    customerUtterance(
      "Desk question only. This is not the customer speaking. Do not add it to their goal, level, or schedule.\n\nWho is on shift?",
    ),
    "",
  );
  assert.equal(discoverySlotsLookFilled("weeekends", "Complete beginner. Goal is family."), true);
  assert.equal(discoverySlotsLookFilled("family"), false);
});

test("draft timeouts are retryable and longer than the old 30 second abort", () => {
  assert.equal(isDraftTimeout(Object.assign(new Error("aborted"), { name: "TimeoutError" })), true);
  assert.equal(isDraftTimeout(new Error("The operation was aborted due to timeout")), true);
  assert.equal(isDraftTimeout(new Error("socket hang up")), false);
  assert.ok(GROK_ROUND_TIMEOUT_MS >= 90_000);
  assert.ok(GROK_BUDGET_MS >= 150_000);
  assert.ok(GROK_BUDGET_MS > GROK_ROUND_TIMEOUT_MS);
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

