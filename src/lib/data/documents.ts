import { AppError } from "@/lib/domain/errors";
import { sanitizeFileName, validateUpload } from "@/lib/domain/filenames";
import { createId } from "@/lib/domain/tokens";
import type { Database, DocumentType, EvidenceDocument, Session } from "@/lib/domain/types";
import { emptySoc2Review } from "@/lib/domain/types";
import { documentMetaSchema, soc2Schema } from "@/lib/domain/validation";
import { assertCan, audit, parseInput } from "./context";
import { getVendor } from "./vendors";

export interface DocumentDraft {
  vendorId: string;
  assessmentId?: string | null;
  assessmentQuestionId?: string | null;
  findingId?: string | null;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  documentType: DocumentType;
  description?: string;
  uploadedByLabel?: string;
}

export function addDocument(db: Database, session: Session, draft: DocumentDraft, now: string): EvidenceDocument {
  const scope = assertCan(db, session, "documents.write");
  const vendor = getVendor(db, session, draft.vendorId);
  const problem = validateUpload(draft.fileName, draft.contentType, draft.sizeBytes);
  if (problem) throw new AppError("validation", problem);
  if (draft.assessmentId) {
    const assessment = db.assessments.find(
      (item) => item.id === draft.assessmentId && item.organizationId === scope.org.id && item.vendorId === vendor.id && !item.deletedAt,
    );
    if (!assessment) throw new AppError("validation", "That assessment does not belong to this vendor.");
  }
  const meta = parseInput(documentMetaSchema, {
    documentType: draft.documentType,
    description: draft.description ?? "",
    reviewStatus: "pending",
  });
  const id = createId();
  const fileName = sanitizeFileName(draft.fileName);
  const soc = meta.documentType === "soc2_type_i" || meta.documentType === "soc2_type_ii";
  const document: EvidenceDocument = {
    id,
    organizationId: scope.org.id,
    vendorId: vendor.id,
    assessmentId: draft.assessmentId ?? null,
    assessmentQuestionId: draft.assessmentQuestionId ?? null,
    findingId: draft.findingId ?? null,
    fileName,
    storagePath: `${scope.org.id}/${vendor.id}/${id}/${fileName}`,
    contentType: draft.contentType,
    sizeBytes: draft.sizeBytes,
    documentType: meta.documentType,
    description: meta.description,
    reviewStatus: "pending",
    uploadedById: scope.user.id,
    uploadedByLabel: draft.uploadedByLabel ?? scope.user.fullName,
    uploadedAt: now,
    soc2: soc ? emptySoc2Review() : null,
    deletedAt: null,
  };
  db.documents.push(document);
  if (draft.assessmentQuestionId) {
    const response = db.responses.find(
      (item) => item.assessmentQuestionId === draft.assessmentQuestionId && item.organizationId === scope.org.id,
    );
    if (response && !response.documentIds.includes(document.id)) response.documentIds.push(document.id);
  }
  audit(db, scope, {
    action: "evidence.uploaded",
    entityType: "document",
    entityId: document.id,
    summary: `${fileName} uploaded.`,
    after: { documentType: document.documentType, vendorId: vendor.id },
    now,
  });
  return document;
}

export function assertDocumentAccess(db: Database, session: Session, documentId: string): EvidenceDocument {
  const scope = assertCan(db, session, "documents.read");
  const document = db.documents.find((item) => item.id === documentId && item.organizationId === scope.org.id && !item.deletedAt);
  if (!document) throw new AppError("not_found", "Document not found.");
  return document;
}

export function updateDocument(db: Database, session: Session, documentId: string, input: unknown, now: string) {
  const scope = assertCan(db, session, "documents.write");
  const document = assertDocumentAccess(db, session, documentId);
  const source = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const parsed = parseInput(documentMetaSchema, {
    documentType: (source.documentType as DocumentType | undefined) ?? document.documentType,
    description: typeof source.description === "string" ? source.description : document.description,
    reviewStatus: source.reviewStatus ?? document.reviewStatus,
  });
  document.documentType = parsed.documentType;
  document.description = parsed.description;
  if (parsed.reviewStatus) document.reviewStatus = parsed.reviewStatus;
  if ((parsed.documentType === "soc2_type_i" || parsed.documentType === "soc2_type_ii") && !document.soc2) {
    document.soc2 = emptySoc2Review();
  }
  audit(db, scope, {
    action: "evidence.updated",
    entityType: "document",
    entityId: document.id,
    summary: `Evidence ${document.fileName} updated.`,
    now,
  });
  return document;
}

export function saveSoc2Review(db: Database, session: Session, documentId: string, input: unknown, now: string) {
  const scope = assertCan(db, session, "documents.write");
  const document = assertDocumentAccess(db, session, documentId);
  if (document.documentType !== "soc2_type_i" && document.documentType !== "soc2_type_ii") {
    throw new AppError("validation", "SOC 2 review fields apply to SOC 2 reports.");
  }
  const parsed = parseInput(soc2Schema, input);
  document.soc2 = parsed;
  if (parsed.reviewStatus === "complete") document.reviewStatus = "accepted";
  else if (parsed.reviewStatus === "in_review") document.reviewStatus = "pending";
  audit(db, scope, {
    action: "evidence.soc2_reviewed",
    entityType: "document",
    entityId: document.id,
    summary: `SOC 2 review ${parsed.reviewStatus.replaceAll("_", " ")} for ${document.fileName}.`,
    after: { opinion: parsed.opinion, periodEnd: parsed.periodEnd, exceptionsNoted: parsed.exceptionsNoted },
    now,
  });
  return document;
}
