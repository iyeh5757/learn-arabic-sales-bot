import { NextResponse } from "next/server";
import { trialEligibility } from "@/lib/trial";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const country = new URL(request.url).searchParams.get("country") ?? "";
  return NextResponse.json(trialEligibility(country));
}
