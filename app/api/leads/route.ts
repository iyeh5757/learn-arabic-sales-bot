import { NextResponse } from "next/server";
import { createLead, listLeads, type LeadInput } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const leads = await listLeads();
  return NextResponse.json({ leads });
}

export async function POST(request: Request) {
  let body: LeadInput;
  try {
    body = (await request.json()) as LeadInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  try {
    const lead = await createLead(body);
    return NextResponse.json({ lead }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save the lead.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
