import type { Currency } from "./types";

export const CURRENCIES: Currency[] = ["USD", "GBP", "EUR", "AED", "EGP"];

const EURO = new Set([
  "AT", "BE", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT", "LV", "LT",
  "LU", "MT", "NL", "PT", "SK", "SI", "ES", "AD", "MC", "SM", "VA", "ME", "XK",
]);

export function defaultCurrency(countryCode: string): Currency {
  const code = countryCode.trim().toUpperCase();
  if (code === "EG") return "EGP";
  if (code === "GB") return "GBP";
  if (code === "AE") return "AED";
  if (EURO.has(code)) return "EUR";
  return "USD";
}

export function formatMoney(amount: number, currency: Currency): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatStamp(iso: string): string {
  if (!iso) return "";
  return iso.slice(0, 16).replace("T", " ") + " UTC";
}
