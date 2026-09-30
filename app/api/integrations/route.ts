import { NextResponse } from "next/server";
import { integrationStatus } from "@/lib/integrations";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ integrations: integrationStatus() });
}
