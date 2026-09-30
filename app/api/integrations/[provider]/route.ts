import { NextResponse } from "next/server";
import { isProvider, stubResult } from "@/lib/integrations";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ provider: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const { provider } = await ctx.params;
  if (!isProvider(provider)) {
    return NextResponse.json({ error: "Unknown integration." }, { status: 404 });
  }
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  return NextResponse.json(stubResult(provider, body), { status: 501 });
}
