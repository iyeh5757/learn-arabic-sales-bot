import { programLabel } from "./reps";

const PRICE_ASK = /\b(price|prices|pricing|quote|cost|how much)\b/i;
const TRIAL_ASK = /\b(trial|free class|free lesson|free session)\b/i;
const DISCOVERY_DONE =
  /\b(discovery (is )?done|already qualified|ready to (quote|offer|book)|offer the trial|quote the customer)\b/i;

const TRIAL_PITCH = /\btrial\b|free\s+(?:30|class|lesson|session)|30[-\s]?minute|complimentary/i;
const MOST_POPULAR = /most popular/i;
const PACK_16 = /16\s*[×x]\s*60|60\s*[×x]\s*16|16\s*sessions/i;
const MONEY = /[£$€]|\b(?:USD|GBP|EUR|AED|EGP)\b/i;
const LINK = /https?:\/\/|signup\.learnarabic/i;

export function customerAskedPrice(text: string): boolean {
  return PRICE_ASK.test(text);
}

export function customerAskedTrial(text: string): boolean {
  return TRIAL_ASK.test(text);
}

export function discoveryDone(...parts: Array<string | undefined>): boolean {
  return DISCOVERY_DONE.test(parts.filter(Boolean).join("\n"));
}

/** Reasons a customer-facing first draft jumped ahead of discovery. */
export function firstDraftViolations(draft: string): string[] {
  const reasons: string[] = [];
  if (TRIAL_PITCH.test(draft)) reasons.push("trial pitch");
  if (MOST_POPULAR.test(draft)) reasons.push("most popular");
  if (PACK_16.test(draft)) reasons.push("16×60 package");
  if (MONEY.test(draft)) reasons.push("price");
  if (LINK.test(draft)) reasons.push("signup link");
  return reasons;
}

export function spokenProgramme(program?: string): string {
  const raw = program?.trim() ?? "";
  if (!raw) return "";
  const label = programLabel(raw);
  if (raw === "egyptian" || label === "Egyptian") return "Egyptian Arabic";
  return label;
}

/** Short WhatsApp welcome. One question. No trial and no price. */
export function discoveryDraft(input: {
  customerName?: string;
  program?: string;
  rep?: string;
  customerMessage?: string;
}): string {
  const name = input.customerName?.trim().split(/\s+/)[0] ?? "";
  const hello = name ? `Hey ${name}, good to hear from you.` : "Hey, good to hear from you.";
  const programme = spokenProgramme(input.program);
  const wantsOnline = /\bonline\b/i.test(input.customerMessage ?? "");
  const lines = [hello, ""];
  if (programme && wantsOnline) {
    lines.push(`${programme}, online and one-to-one — happy to help with that.`, "");
  } else if (programme) {
    lines.push(`${programme}, one-to-one — happy to help with that.`, "");
  } else if (wantsOnline) {
    lines.push("Online one-to-one lessons — happy to help with that.", "");
  }
  lines.push("Are you starting from the beginning, or do you already know some Arabic?");
  const rep = input.rep?.trim();
  if (rep) lines.push("", rep);
  return lines.join("\n");
}

export function splitReply(reply: string): { note: string; draft: string; hasDraftHeading: boolean } {
  const marked = reply.match(/([\s\S]*?)Draft to copy\s*([\s\S]*)$/i);
  if (marked) {
    const note = marked[1].replace(/^\s*Note to the salesperson\s*/i, "").trim();
    return { note, draft: marked[2].trim(), hasDraftHeading: true };
  }
  return { note: "", draft: reply.trim(), hasDraftHeading: false };
}

export function holdsCommercialPitch(input: {
  customerMessage?: string;
  notes?: string;
  userText?: string;
}): boolean {
  if (discoveryDone(input.notes, input.userText)) return false;
  const customer = input.customerMessage?.trim() ?? "";
  const source = customer || input.userText || "";
  if (customerAskedPrice(source) || customerAskedTrial(source)) return false;
  return true;
}

/**
 * If Grok opens a first reply with a trial or a price, keep those facts in the
 * salesperson note and replace the customer draft with a welcome plus one question.
 */
export function applyFirstReplyGuard(input: {
  reply: string;
  customerMessage?: string;
  customerName?: string;
  program?: string;
  rep?: string;
  notes?: string;
  userText?: string;
}): { text: string; customerDraft: string; note: string; rewritten: boolean } {
  const split = splitReply(input.reply);
  const internalOnly =
    !split.hasDraftHeading && /\binternal note only\b|\brep note\b/i.test(input.userText ?? "");
  const violations = firstDraftViolations(split.draft);
  if (!holdsCommercialPitch(input) || violations.length === 0 || internalOnly) {
    return {
      text: input.reply,
      customerDraft: split.draft,
      note: split.note,
      rewritten: false,
    };
  }

  const draft = discoveryDraft(input);
  const extra =
    "Eligibility and package prices stay in this note. The customer did not ask, so they are not in the draft.";
  const note = split.note ? `${split.note}\n\n${extra}` : extra;
  const text = `Note to the salesperson\n${note}\n\nDraft to copy\n${draft}`;
  return { text, customerDraft: draft, note, rewritten: true };
}
