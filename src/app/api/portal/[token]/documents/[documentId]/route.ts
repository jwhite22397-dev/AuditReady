import { NextResponse } from "next/server";
import { assertPortalDocument } from "@/lib/data/portal";
import { AppError } from "@/lib/domain/errors";
import { assertPortalRate, portalErrorResponse, runPortal } from "@/lib/supabase/portal-store";

export async function GET(_request: Request, context: { params: Promise<{ token: string; documentId: string }> }) {
  const { token, documentId } = await context.params;
  try {
    assertPortalRate(token);
    const file = await runPortal(token, async (db, service) => {
      const document = await assertPortalDocument(db, token, documentId, new Date().toISOString());
      const signed = await service.storage.from("evidence").createSignedUrl(document.storagePath, 60);
      if (signed.error || !signed.data?.signedUrl) throw new AppError("not_found", "Document not found.");
      const response = await fetch(signed.data.signedUrl);
      if (!response.ok) throw new AppError("not_found", "Document not found.");
      return {
        fileName: document.fileName,
        contentType: document.contentType,
        bytes: await response.arrayBuffer(),
      };
    });
    return new NextResponse(file.bytes, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${file.fileName.replaceAll('"', "")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const response = portalErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
