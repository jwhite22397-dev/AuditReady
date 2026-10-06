import { NextResponse } from "next/server";
import { addPortalDocument } from "@/lib/data/portal";
import { AppError } from "@/lib/domain/errors";
import { DOCUMENT_TYPES, type DocumentType } from "@/lib/domain/types";
import { assertPortalRate, portalErrorResponse, runPortal } from "@/lib/supabase/portal-store";

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  try {
    assertPortalRate(token);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError("validation", "Choose a file to upload.");
    const requested = String(form.get("documentType") ?? "other");
    const documentType = (DOCUMENT_TYPES as readonly string[]).includes(requested) ? requested as DocumentType : "other";
    const questionId = form.get("questionId");
    const description = form.get("description");
    const document = await runPortal(token, async (db, service) => {
      const created = await addPortalDocument(db, token, {
        questionId: typeof questionId === "string" ? questionId : null,
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        documentType,
        description: typeof description === "string" ? description : "",
      }, new Date().toISOString());
      const upload = await service.storage.from("evidence").upload(created.storagePath, file, {
        contentType: created.contentType,
        upsert: false,
      });
      if (upload.error) {
        db.documents = db.documents.filter((item) => item.id !== created.id);
        for (const response of db.responses) response.documentIds = response.documentIds.filter((id) => id !== created.id);
        db.auditEvents = db.auditEvents.filter((event) => event.entityId !== created.id);
        throw new AppError("validation", "The file could not be stored.");
      }
      return { id: created.id, fileName: created.fileName, documentType: created.documentType };
    });
    return NextResponse.json(document);
  } catch (error) {
    const response = portalErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
