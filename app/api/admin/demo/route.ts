import { NextResponse } from "next/server";
import { loadDemoLeads } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST() {
  const result = await loadDemoLeads();
  return NextResponse.json({
    added: result.added,
    total: result.leads.length,
    notice: "Sample leads loaded. They are not real customers.",
  });
}
