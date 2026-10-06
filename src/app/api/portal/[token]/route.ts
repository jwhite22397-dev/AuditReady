import { NextResponse } from "next/server";
import { getPortal, savePortalAnswers, type PortalAnswerInput } from "@/lib/data/portal";
import { assertPortalRate, portalErrorResponse, runPortal } from "@/lib/supabase/portal-store";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  try {
    assertPortalRate(token);
    const view = await runPortal(token, (db) => getPortal(db, token, new Date().toISOString()));
    return NextResponse.json(view);
  } catch (error) {
    const response = portalErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function PUT(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  try {
    assertPortalRate(token);
    const body = await request.json();
    const answers = Array.isArray(body?.answers) ? body.answers as PortalAnswerInput[] : [];
    await runPortal(token, (db) => savePortalAnswers(db, token, answers, new Date().toISOString()));
    return NextResponse.json({ ok: true });
  } catch (error) {
    const response = portalErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
