export type FxQuote = { rate: number; date: string };

type FxRow = { date?: string; base?: string; quote?: string; rate?: number };

/**
 * Accept Frankfurter v2 rows, or the older `{ rates: { EGP } }` shape
 * when a deployment points FRANKFURTER_URL at a payload that includes EGP.
 */
export function parseFrankfurter(payload: unknown): FxQuote {
  if (Array.isArray(payload)) {
    const rows = payload.filter((row): row is FxRow & { rate: number; date: string } => {
      if (!row || typeof row !== "object") return false;
      const item = row as FxRow;
      return (
        item.base === "USD" &&
        item.quote === "EGP" &&
        typeof item.rate === "number" &&
        Number.isFinite(item.rate) &&
        typeof item.date === "string"
      );
    });
    if (rows.length === 0) {
      throw new Error("Frankfurter response did not include a USD to EGP rate.");
    }
    rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return { rate: rows[0].rate, date: rows[0].date };
  }

  if (payload && typeof payload === "object" && "rates" in payload) {
    const record = payload as { date?: string; rates?: { EGP?: unknown } };
    const rate = record.rates?.EGP;
    if (typeof rate === "number" && Number.isFinite(rate) && record.date) {
      return { rate, date: record.date };
    }
  }

  throw new Error("Unrecognised Frankfurter payload.");
}

let cache: { at: number; quote: FxQuote } | null = null;
const TTL_MS = 60 * 60 * 1000;

export async function getUsdToEgp(fetchImpl: typeof fetch = fetch): Promise<FxQuote> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.quote;

  const url =
    process.env.FRANKFURTER_URL ||
    "https://api.frankfurter.dev/v2/rates?base=USD&quotes=EGP";

  const response = await fetchImpl(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Frankfurter responded ${response.status}.`);
  }
  const quote = parseFrankfurter(await response.json());
  cache = { at: Date.now(), quote };
  return quote;
}

export function clearFxCache(): void {
  cache = null;
}
