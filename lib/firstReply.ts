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

const SLOT_GOAL =
  /\b(goal|family|in-laws|in laws|travel(?:ling|ing)?|for work|my job|quran|qur['’]an|business|kids|children|wife|husband|spouse)\b/i;
const SLOT_LEVEL =
  /\b(beginners?|intermediate|advanced|from the beginning|already know|some arabic|no arabic|don'?t know|zero arabic)\b/i;
const SLOT_SCHEDULE = /\b(w+e+k+e+nds?|weekdays?|evenings?|mornings?|afternoons?|schedule)\b/i;

/** Goal, level, and schedule all show up in the customer's own words or the rep's notes. */
export function discoverySlotsLookFilled(...parts: Array<string | undefined>): boolean {
  const text = parts.filter(Boolean).join("\n");
  return SLOT_GOAL.test(text) && SLOT_LEVEL.test(text) && SLOT_SCHEDULE.test(text);
}

/** Pull the customer's words out of a desk turn. Desk questions contribute nothing. */
export function customerUtterance(text: string): string {
  const marked = text.match(/Customer just said:\s*([\s\S]*)$/i);
  if (marked) return marked[1].trim();
  if (/^\s*(Desk question only|Internal note only)\b/i.test(text)) return "";
  return text.trim();
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
  const hasDraft = /Draft to copy/i.test(reply);
  const hasNote = /Note to the salesperson/i.test(reply);
  if (!hasDraft && !hasNote) {
    return { note: "", draft: reply.trim(), hasDraftHeading: false };
  }

  const draft = hasDraft
    ? (reply.match(/Draft to copy\s*([\s\S]*?)(?=\n+\s*Note to the salesperson\b|$)/i)?.[1] ?? "").trim()
    : "";
  const note = hasNote
    ? (reply.match(/Note to the salesperson\s*([\s\S]*?)(?=\n+\s*Draft to copy\b|$)/i)?.[1] ?? "").trim()
    : "";

  if (!hasDraft) return { note, draft: "", hasDraftHeading: false };
  return { note, draft, hasDraftHeading: true };
}

const EMPTY_NOTE =
  /^(?:none|n\/a|nothing(?: to add)?|no note(?: needed)?|not needed|no salesperson note|—|-|\.)\.?$/i;

/** A note the rep must see. Routine "eligible / did not call a tool" status is not one of these. */
const KEEP_NOTE =
  /not eligible|ineligible|unavailable|escalat|hand (?:it |this )?off|\+201093570811|contradict|refund|discount|complaint|chargeback|unknown country|country is (?:blank|unknown|missing)|do not offer|mismatch|gulf exception|eligible even though/i;

/** Status dumps that restate the default discovery rules. */
const ROUTINE_NOTE =
  /\beligib|did not call|does not need|do not mention the trial|still unknown|checked check_trial|no note\b/i;

export function noteWorthShowing(note: string): boolean {
  const text = note.replace(/\s+/g, " ").trim();
  if (!text || EMPTY_NOTE.test(text)) return false;
  if (KEEP_NOTE.test(text)) return true;
  if (ROUTINE_NOTE.test(text)) return false;
  return true;
}

export function presentReply(reply: string): {
  note: string;
  draft: string;
  showNote: boolean;
  copyText: string;
  hasDraftHeading: boolean;
} {
  const split = splitReply(reply);
  const draft = split.hasDraftHeading ? split.draft : "";
  // A draft makes a routine status note redundant. A note-only reply is the answer the rep asked for.
  const showNote = draft ? noteWorthShowing(split.note) : Boolean(split.note.trim());
  const copyText = draft ? draft : showNote ? "" : reply.trim();
  return {
    note: showNote ? split.note.trim() : "",
    draft,
    showNote,
    copyText,
    hasDraftHeading: split.hasDraftHeading,
  };
}

/** Drop a routine status note before the next model turn so it is not copied forward. */
export function replyForModel(content: string): string {
  const presented = presentReply(content);
  if (!presented.hasDraftHeading) return content.trim();
  if (!presented.showNote) return `Draft to copy\n${presented.draft}`;
  return `Draft to copy\n${presented.draft}\n\nNote to the salesperson\n${presented.note}`;
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
  const slotsFilled = discoverySlotsLookFilled(
    input.customerMessage,
    input.notes,
    customerUtterance(input.userText ?? ""),
  );
  const violations = firstDraftViolations(split.draft).filter(
    (reason) => !(slotsFilled && reason === "trial pitch"),
  );
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
