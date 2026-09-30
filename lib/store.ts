import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { seedLeads } from "./seed";
import { isTrialStage, trialEligibility } from "./trial";
import { isRep, TIMEZONES, WEEKDAYS } from "./reps";
import type {
  Channel,
  Currency,
  Lead,
  LeadMessage,
  PlanId,
  ProgramId,
  RepName,
  Shift,
  Stage,
  Weekday,
} from "./types";

type DeskData = { leads: Lead[]; shifts: Shift[] };

const FILE = path.join(process.cwd(), "data", "desk.json");

let cache: DeskData | null = null;
let queue: Promise<void> = Promise.resolve();

const CURRENCIES = new Set(["USD", "GBP", "EUR", "AED", "EGP"]);
const PROGRAMS = new Set(["egyptian", "msa", "quranic", "gulf", "levantine", "unsure"]);
const PLANS = new Set(["private-30", "private-60", "group", "starter", "standard", "intensive"]);
const STAGES = new Set([
  "new",
  "qualified",
  "trial_offered",
  "trial_booked",
  "negotiating",
  "won",
  "lost",
  "escalated",
]);
const CHANNELS = new Set(["whatsapp", "email", "site", "other"]);
const WEEKDAY_SET = new Set(WEEKDAYS);
const TZ_SET = new Set(TIMEZONES);

function emptyDesk(): DeskData {
  return { leads: seedLeads(), shifts: [] };
}

async function load(): Promise<DeskData> {
  if (cache) return cache;
  try {
    const raw = await readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as DeskData;
    if (!parsed || !Array.isArray(parsed.leads) || !Array.isArray(parsed.shifts)) {
      throw new Error("Desk file is invalid.");
    }
    cache = parsed;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    if (code && code !== "ENOENT") throw error;
    cache = emptyDesk();
  }
  return cache;
}

async function persist(data: DeskData): Promise<void> {
  cache = data;
  try {
    await mkdir(path.dirname(FILE), { recursive: true });
    await writeFile(FILE, JSON.stringify(data, null, 2));
  } catch {
    // Serverless disks are often read-only. The in-memory desk still works.
  }
}

function updateDesk(mutator: (data: DeskData) => void): Promise<DeskData> {
  const job = queue.then(async () => {
    const current = await load();
    const draft = structuredClone(current);
    mutator(draft);
    await persist(draft);
    return draft;
  });
  queue = job.then(
    () => undefined,
    () => undefined,
  );
  return job;
}

export async function listLeads(): Promise<Lead[]> {
  const data = await load();
  return structuredClone(data.leads).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function getLead(id: string): Promise<Lead | null> {
  const data = await load();
  const lead = data.leads.find((item) => item.id === id);
  return lead ? structuredClone(lead) : null;
}

export async function listShifts(): Promise<Shift[]> {
  const data = await load();
  return structuredClone(data.shifts);
}

function assertCountry(code: string): void {
  const decision = trialEligibility(code);
  if (!decision.countryName) throw new Error("Choose a residence country from the list.");
}

function assertTrialStage(stage: Stage, countryCode: string): void {
  if (isTrialStage(stage) && !trialEligibility(countryCode).eligible) {
    throw new Error("Trial stages are only available when the residence is eligible.");
  }
}

export type LeadInput = {
  name?: string;
  email?: string;
  phone?: string;
  countryCode?: string;
  channel?: string;
  program?: string;
  planId?: string;
  stage?: string;
  rep?: string;
  currency?: string;
  notes?: string;
  customerMessage?: string;
};

function cleanLead(input: LeadInput, base?: Lead): Omit<Lead, "id" | "messages" | "createdAt" | "updatedAt"> {
  const name = (input.name ?? base?.name ?? "").trim();
  if (!name) throw new Error("Name is required.");
  if (name.length > 120) throw new Error("Name is too long.");

  const countryCode = (input.countryCode ?? base?.countryCode ?? "").trim().toUpperCase();
  assertCountry(countryCode);

  const stage = (input.stage ?? base?.stage ?? "new") as Stage;
  if (!STAGES.has(stage)) throw new Error("Unknown stage.");
  assertTrialStage(stage, countryCode);

  const program = (input.program ?? base?.program ?? "unsure") as ProgramId;
  if (!PROGRAMS.has(program)) throw new Error("Unknown program.");

  const planId = (input.planId ?? base?.planId ?? "private-30") as PlanId;
  if (!PLANS.has(planId)) throw new Error("Unknown plan.");

  const currency = (input.currency ?? base?.currency ?? "USD") as Currency;
  if (!CURRENCIES.has(currency)) throw new Error("Unknown currency.");

  const channel = (input.channel ?? base?.channel ?? "whatsapp") as Channel;
  if (!CHANNELS.has(channel)) throw new Error("Unknown channel.");

  const repRaw = (input.rep ?? base?.rep ?? "").trim();
  if (repRaw && !isRep(repRaw)) throw new Error("Rep must be Asmaa, Rebeb, Kamal, or Ram.");

  const email = (input.email ?? base?.email ?? "").trim();
  const phone = (input.phone ?? base?.phone ?? "").trim();
  const notes = (input.notes ?? base?.notes ?? "").trim();
  if (email.length > 200 || phone.length > 40 || notes.length > 4000) {
    throw new Error("A field is too long.");
  }

  return {
    name,
    email,
    phone,
    countryCode,
    channel,
    program,
    planId,
    stage,
    rep: (repRaw || "") as RepName | "",
    currency,
    notes,
  };
}

export async function createLead(input: LeadInput): Promise<Lead> {
  const now = new Date().toISOString();
  const fields = cleanLead(input);
  const lead: Lead = {
    id: `lead-${randomUUID()}`,
    ...fields,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
  const opening = input.customerMessage?.trim();
  if (opening) {
    if (opening.length > 8000) throw new Error("Message is too long.");
    lead.messages.push({
      id: `msg-${randomUUID()}`,
      role: "customer",
      text: opening,
      at: now,
    });
  }
  await updateDesk((data) => {
    data.leads.push(lead);
  });
  return lead;
}

export async function patchLead(
  id: string,
  input: LeadInput & { appendMessage?: { role?: string; text?: string } },
): Promise<Lead | null> {
  let updated: Lead | null = null;
  await updateDesk((data) => {
    const index = data.leads.findIndex((item) => item.id === id);
    if (index === -1) return;
    const current = data.leads[index];
    const fields = cleanLead(input, current);
    const messages = current.messages.map((message) => ({ ...message }));
    if (input.appendMessage) {
      const role = input.appendMessage.role;
      const text = input.appendMessage.text?.trim() ?? "";
      if (role !== "customer" && role !== "rep" && role !== "assistant") {
        throw new Error("Unknown message role.");
      }
      if (!text) throw new Error("Message text is required.");
      if (text.length > 8000) throw new Error("Message is too long.");
      const entry: LeadMessage = {
        id: `msg-${randomUUID()}`,
        role,
        text,
        at: new Date().toISOString(),
      };
      messages.push(entry);
    }
    const next: Lead = {
      ...current,
      ...fields,
      messages,
      updatedAt: new Date().toISOString(),
    };
    data.leads[index] = next;
    updated = next;
  });
  return updated ? structuredClone(updated) : null;
}

export async function deleteLead(id: string): Promise<boolean> {
  let removed = false;
  await updateDesk((data) => {
    const before = data.leads.length;
    data.leads = data.leads.filter((item) => item.id !== id);
    removed = data.leads.length !== before;
  });
  return removed;
}

export type ShiftInput = {
  rep?: string;
  weekday?: string;
  start?: string;
  end?: string;
  timezone?: string;
};

export async function createShift(input: ShiftInput): Promise<Shift> {
  const rep = input.rep?.trim() ?? "";
  if (!isRep(rep)) throw new Error("Rep must be Asmaa, Rebeb, Kamal, or Ram.");
  const weekday = input.weekday as Weekday;
  if (!WEEKDAY_SET.has(weekday)) throw new Error("Choose a weekday.");
  const start = input.start?.trim() ?? "";
  const end = input.end?.trim() ?? "";
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) {
    throw new Error("Use HH:MM for start and end.");
  }
  if (start >= end) throw new Error("Shift end must be after the start.");
  const timezone = input.timezone?.trim() || "Africa/Cairo";
  if (!TZ_SET.has(timezone)) throw new Error("Choose a timezone from the list.");

  const shift: Shift = {
    id: `shift-${randomUUID()}`,
    rep,
    weekday,
    start,
    end,
    timezone,
  };
  await updateDesk((data) => {
    data.shifts.push(shift);
  });
  return shift;
}

export async function deleteShift(id: string): Promise<boolean> {
  let removed = false;
  await updateDesk((data) => {
    const before = data.shifts.length;
    data.shifts = data.shifts.filter((item) => item.id !== id);
    removed = data.shifts.length !== before;
  });
  return removed;
}
