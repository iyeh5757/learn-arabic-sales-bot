import { NextResponse } from "next/server";
import { getUsdToEgp } from "@/lib/frankfurter";
import { buildPriceBook } from "@/lib/pricing";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const quote = await getUsdToEgp();
    return NextResponse.json(buildPriceBook(quote, null));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Frankfurter rate unavailable.";
    return NextResponse.json(buildPriceBook(null, message));
  }
}
