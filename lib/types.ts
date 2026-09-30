export type Continent =
  | "Africa"
  | "Asia"
  | "Europe"
  | "North America"
  | "South America"
  | "Oceania";

export type Currency = "USD" | "GBP" | "EUR" | "AED" | "EGP";

export type ProgramId =
  | "egyptian"
  | "msa"
  | "quranic"
  | "gulf"
  | "levantine"
  | "unsure";

export type PlanId =
  | "private-30"
  | "private-60"
  | "group"
  | "starter"
  | "standard"
  | "intensive";

export type Stage =
  | "new"
  | "qualified"
  | "trial_offered"
  | "trial_booked"
  | "negotiating"
  | "won"
  | "lost"
  | "escalated";

export type Channel = "whatsapp" | "email" | "site" | "other";

export type RepName = "Asmaa" | "Rebeb" | "Kamal" | "Ram";

export type LeadMessage = {
  id: string;
  role: "customer" | "rep" | "assistant";
  text: string;
  at: string;
};

export type Lead = {
  id: string;
  name: string;
  email: string;
  phone: string;
  countryCode: string;
  channel: Channel;
  program: ProgramId;
  planId: PlanId;
  stage: Stage;
  rep: RepName | "";
  currency: Currency;
  notes: string;
  messages: LeadMessage[];
  createdAt: string;
  updatedAt: string;
};

export type Weekday =
  | "Sunday"
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday";

export type Shift = {
  id: string;
  rep: RepName;
  weekday: Weekday;
  start: string;
  end: string;
  timezone: string;
};

export type TrialRegion = "africa" | "asia" | "gulf" | "other" | "unknown";

export type TrialDecision = {
  eligible: boolean;
  region: TrialRegion;
  countryCode: string;
  countryName: string;
  continent: Continent | null;
  reason: string;
};

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};
