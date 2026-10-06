import { NextResponse } from "next/server";
import { submitPortal } from "@/lib/data/portal";
import { assertPortalRate, portalErrorResponse, runPortal } from "@/lib/supabase/portal-store";

export async function POST(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  try {
    assertPortalRate(token);
    await runPortal(token, (db) => submitPortal(db, token, new Date().toISOString()));
    return NextResponse.json({ ok: true });
  } catch (error) {
    const response = portalErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
