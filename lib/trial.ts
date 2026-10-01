import { COUNTRIES } from "./countries";
import type { TrialDecision } from "./types";

/** Gulf exception. These codes are in Asia and are still trial-eligible. */
export const GULF_COUNTRIES = ["AE", "SA", "KW", "QA", "BH", "OM"] as const;

const GULF = new Set<string>(GULF_COUNTRIES);

export function trialEligibility(countryCode: string): TrialDecision {
  const code = countryCode.trim().toUpperCase();
  if (!code) {
    return {
      eligible: false,
      region: "unknown",
      countryCode: "",
      countryName: "",
      continent: null,
      reason: "Residence country is required before a free 30-minute live trial can be offered.",
    };
  }

  const country = COUNTRIES[code];
  if (!country) {
    return {
      eligible: false,
      region: "unknown",
      countryCode: code,
      countryName: "",
      continent: null,
      reason: `${code} is not in the residence list, so a free 30-minute live trial cannot be offered.`,
    };
  }

  if (GULF.has(code)) {
    return {
      eligible: true,
      region: "gulf",
      countryCode: code,
      countryName: country.name,
      continent: country.continent,
      reason: `${country.name} is a Gulf residence (${code}). AE, SA, KW, QA, BH, and OM stay eligible for a free 30-minute live trial.`,
    };
  }

  if (country.continent === "Africa" || country.continent === "Asia") {
    return {
      eligible: false,
      region: country.continent === "Africa" ? "africa" : "asia",
      countryCode: code,
      countryName: country.name,
      continent: country.continent,
      reason: `${country.name} is in ${country.continent}. A free 30-minute live trial is not offered for residences in Africa or Asia, except Gulf countries AE, SA, KW, QA, BH, and OM.`,
    };
  }

  return {
    eligible: true,
    region: "other",
    countryCode: code,
    countryName: country.name,
    continent: country.continent,
      reason: `${country.name} is in ${country.continent}. Residences outside Africa and Asia are eligible for a free 30-minute live trial.`,
  };
}

export function isTrialStage(stage: string): boolean {
  return stage === "trial_offered" || stage === "trial_booked";
}
