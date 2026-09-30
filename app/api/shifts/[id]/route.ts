import { NextResponse } from "next/server";
import { shiftsStatus } from "@/lib/reps";
import { deleteShift, listShifts } from "@/lib/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const removed = await deleteShift(id);
  if (!removed) return NextResponse.json({ error: "Shift not found." }, { status: 404 });
  const shifts = await listShifts();
  return NextResponse.json({ ok: true, status: shiftsStatus(shifts.length), shifts });
}
