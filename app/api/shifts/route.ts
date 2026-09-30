import { NextResponse } from "next/server";
import { shiftsStatus } from "@/lib/reps";
import { createShift, listShifts, type ShiftInput } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const shifts = await listShifts();
  return NextResponse.json({ status: shiftsStatus(shifts.length), shifts });
}

export async function POST(request: Request) {
  let body: ShiftInput;
  try {
    body = (await request.json()) as ShiftInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  try {
    const shift = await createShift(body);
    const shifts = await listShifts();
    return NextResponse.json({ shift, status: shiftsStatus(shifts.length), shifts }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save the shift.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
