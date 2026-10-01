import { COUNTRIES } from "./countries";
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

/** List currency for a known residence. Blank or unknown stays null so the desk does not assume USD. */
export function listCurrencyForCountry(countryCode: string): Currency | null {
  const code = countryCode.trim().toUpperCase();
  if (!code || !COUNTRIES[code]) return null;
  return defaultCurrency(code);
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
