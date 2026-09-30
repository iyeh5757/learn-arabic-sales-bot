import { NextResponse } from "next/server";
import { integrationStatus } from "@/lib/integrations";
import { grokCredentials } from "@/lib/grok";
import { ESCALATION, REPS, shiftsStatus } from "@/lib/reps";
import { listShifts } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const shifts = await listShifts();
  const grok = grokCredentials();
  return NextResponse.json({
    grok: {
      configured: Boolean(grok.key),
      source: grok.source,
      model: grok.model,
    },
    escalation: ESCALATION,
    reps: REPS,
    shifts,
    shiftsStatus: shiftsStatus(shifts.length),
    integrations: integrationStatus(),
  });
}
