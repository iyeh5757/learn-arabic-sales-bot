import type { ProgramId, RepName, Stage, Weekday } from "./types";

export const REPS: RepName[] = ["Asmaa", "Rebeb", "Kamal", "Ram"];

export const ESCALATION = {
  name: "Islam Yehia",
  phone: "+201093570811",
  role: "Escalation",
} as const;

export const PROGRAMS: { id: ProgramId; label: string }[] = [
  { id: "egyptian", label: "Egyptian" },
  { id: "levantine", label: "Levantine" },
  { id: "gulf", label: "Gulf/Khaliji" },
  { id: "msa", label: "MSA" },
  { id: "quran", label: "Quran" },
];

export const STAGES: { id: Stage; label: string }[] = [
  { id: "new", label: "New" },
  { id: "qualified", label: "Qualified" },
  { id: "trial_offered", label: "Trial offered" },
  { id: "trial_booked", label: "Trial booked" },
  { id: "negotiating", label: "Negotiating" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
  { id: "escalated", label: "Escalated" },
];

export const WEEKDAYS: Weekday[] = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export const TIMEZONES = [
  "Africa/Cairo",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
];

export function programLabel(id: string): string {
  return PROGRAMS.find((program) => program.id === id)?.label ?? id;
}

export function isRep(value: string): value is RepName {
  return (REPS as string[]).includes(value);
}

export const CONFIGURATION_REQUIRED = "Configuration required";

export function shiftsStatus(count: number): "ready" | typeof CONFIGURATION_REQUIRED {
  return count === 0 ? CONFIGURATION_REQUIRED : "ready";
}
