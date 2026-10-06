import { AppError } from "@/lib/domain/errors";
import { sanitizeFileName, validateUpload } from "@/lib/domain/filenames";
import { isAnswered } from "@/lib/domain/scoring";
import { addDays, createId, generateToken, hashToken } from "@/lib/domain/tokens";
import type { Database, DocumentType, EvidenceDocument, Invitation, Session } from "@/lib/domain/types";
import { emptySoc2Review } from "@/lib/domain/types";
import { canTransitionAssessment } from "@/lib/domain/workflow";
import { assertCan, audit, auditExternal, notify } from "./context";
import { getAssessmentRecord, recalculateAssessment } from "./assessments";
import { refreshVendor } from "./vendors";

const OPEN_FOR_VENDOR = new Set(["draft", "questionnaire_sent"]);

export async function createInvitation(db: Database, session: Session, assessmentId: string, email: string, now: string, token?: string) {
  const scope = assertCan(db, session, "assessments.write");
  const assessment = getAssessmentRecord(db, session, assessmentId);
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new AppError("validation", "Enter the vendor contact's email.");
  if (assessment.status === "draft" && canTransitionAssessment("draft", "questionnaire_sent")) {
    assessment.status = "questionnaire_sent";
  }
  const raw = token ?? generateToken(32);
  const invitation: Invitation = {
    id: createId(),
    organizationId: scope.org.id,
    assessmentId: assessment.id,
    email: normalized,
    tokenHash: await hashToken(raw),
    expiresAt: addDays(now, 30),
    revokedAt: null,
    createdBy: scope.user.id,
    createdAt: now,
    lastAccessAt: null,
  };
  db.invitations.push(invitation);
  assessment.updatedAt = now;
  refreshVendor(db, assessment.vendorId);
  audit(db, scope, {
    action: "questionnaire.sent",
    entityType: "assessment",
    entityId: assessment.id,
    summary: `Questionnaire invitation created for ${normalized}.`,
    after: { expiresAt: invitation.expiresAt },
    now,
  });
  return { invitationId: invitation.id, token: raw, expiresAt: invitation.expiresAt, email: normalized };
}

export function revokeInvitation(db: Database, session: Session, invitationId: string, now: string) {
  const scope = assertCan(db, session, "assessments.write");
  const invitation = db.invitations.find((item) => item.id === invitationId && item.organizationId === scope.org.id);
  if (!invitation) throw new AppError("not_found", "Invitation not found.");
  invitation.revokedAt = now;
  audit(db, scope, {
    action: "questionnaire.revoked",
    entityType: "invitation",
    entityId: invitation.id,
    summary: `Invitation for ${invitation.email} revoked.`,
    now,
  });
}

export async function requireInvitation(db: Database, token: string, now: string): Promise<Invitation> {
  const hash = await hashToken(token);
  const invitation = db.invitations.find((item) => item.tokenHash === hash);
  if (!invitation) throw new AppError("not_found", "This invitation link is not valid.");
  if (invitation.revokedAt) throw new AppError("expired", "This invitation has been revoked.");
  if (Date.parse(invitation.expiresAt) < Date.parse(now)) throw new AppError("expired", "This invitation has expired.");
  const org = db.organizations.find((item) => item.id === invitation.organizationId && !item.deletedAt);
  if (!org) throw new AppError("not_found", "This invitation is no longer available.");
  return invitation;
}

export interface PortalAnswerInput {
  questionId: string;
  answerBoolean: boolean | null;
  answerNa: boolean;
  answerText: string;
  answerChoice: string;
}

export async function getPortal(db: Database, token: string, now: string) {
  const invitation = await requireInvitation(db, token, now);
  invitation.lastAccessAt = now;
  const assessment = db.assessments.find((item) => item.id === invitation.assessmentId && !item.deletedAt);
  const vendor = assessment ? db.vendors.find((item) => item.id === assessment.vendorId) : undefined;
  const org = db.organizations.find((item) => item.id === invitation.organizationId);
  if (!assessment || !vendor || !org) throw new AppError("not_found", "This invitation is no longer available.");
  const questions = db.assessmentQuestions
    .filter((question) => question.assessmentId === assessment.id && question.organizationId === invitation.organizationId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((question) => {
      const response = db.responses.find((item) => item.assessmentQuestionId === question.id);
      return {
        id: question.id,
        sectionTitle: question.sectionTitle,
        prompt: question.prompt,
        helpText: question.helpText,
        type: question.type,
        options: question.options,
        evidenceRequired: question.evidenceRequired,
        response: response
          ? {
              id: response.id,
              answerBoolean: response.answerBoolean,
              answerNa: response.answerNa,
              answerText: response.answerText,
              answerChoice: response.answerChoice,
              documentIds: response.documentIds,
            }
          : null,
      };
    });
  const documents = db.documents
    .filter((document) => document.assessmentId === assessment.id && document.organizationId === invitation.organizationId && !document.deletedAt)
    .map((document) => ({
      id: document.id,
      fileName: document.fileName,
      documentType: document.documentType,
      assessmentQuestionId: document.assessmentQuestionId,
      sizeBytes: document.sizeBytes,
    }));
  return {
    vendorName: vendor.name,
    assessmentName: assessment.name,
    organizationName: org.name,
    dueDate: assessment.dueDate,
    status: assessment.status,
    submittedAt: assessment.submittedAt,
    locked: !OPEN_FOR_VENDOR.has(assessment.status),
    questions,
    documents,
  };
}

export async function savePortalAnswers(db: Database, token: string, answers: PortalAnswerInput[], now: string) {
  const invitation = await requireInvitation(db, token, now);
  const assessment = db.assessments.find((item) => item.id === invitation.assessmentId && item.organizationId === invitation.organizationId);
  if (!assessment || !OPEN_FOR_VENDOR.has(assessment.status)) {
    throw new AppError("conflict", "This questionnaire is locked. Ask the assessment owner to reopen it.");
  }
  let changed = 0;
  for (const answer of answers) {
    const question = db.assessmentQuestions.find(
      (item) => item.id === answer.questionId && item.assessmentId === assessment.id && item.organizationId === invitation.organizationId,
    );
    const response = question ? db.responses.find((item) => item.assessmentQuestionId === question.id) : undefined;
    if (!question || !response) throw new AppError("validation", "One of the answers does not belong to this assessment.");
    response.answerBoolean = answer.answerNa ? null : answer.answerBoolean;
    response.answerNa = question.type === "yes_no_na" ? answer.answerNa : false;
    response.answerText = answer.answerText.slice(0, 8000);
    response.answerChoice = question.options.includes(answer.answerChoice) ? answer.answerChoice : "";
    response.updatedAt = now;
    changed += 1;
  }
  auditExternal(db, {
    organizationId: invitation.organizationId,
    actorLabel: `Vendor (${invitation.email})`,
    action: "response.changed",
    entityType: "assessment",
    entityId: assessment.id,
    summary: `Vendor saved ${changed} answer${changed === 1 ? "" : "s"}.`,
    now,
  });
}

export async function submitPortal(db: Database, token: string, now: string) {
  const invitation = await requireInvitation(db, token, now);
  const assessment = db.assessments.find((item) => item.id === invitation.assessmentId && item.organizationId === invitation.organizationId);
  if (!assessment || !OPEN_FOR_VENDOR.has(assessment.status)) {
    throw new AppError("conflict", "This questionnaire is locked.");
  }
  const missing = db.assessmentQuestions.filter((question) => {
    if (question.assessmentId !== assessment.id) return false;
    const response = db.responses.find((item) => item.assessmentQuestionId === question.id);
    if (!response) return true;
    return !isAnswered(question, response);
  });
  if (missing.length > 0) {
    throw new AppError("validation", `${missing.length} question${missing.length === 1 ? "" : "s"} still need an answer before submission.`);
  }
  if (!canTransitionAssessment(assessment.status, "vendor_responded")) {
    throw new AppError("conflict", "This assessment cannot accept a submission right now.");
  }
  assessment.status = "vendor_responded";
  assessment.submittedAt = now;
  assessment.updatedAt = now;
  refreshVendor(db, assessment.vendorId);
  recalculateAssessment(db, assessment.id);
  notify(db, {
    organizationId: invitation.organizationId,
    userId: assessment.ownerId,
    kind: "questionnaire.submitted",
    dedupeKey: `questionnaire.submitted:${assessment.id}:${now}`,
    title: "Vendor submitted the questionnaire",
    body: `${assessment.name} is ready for review.`,
    href: `/assessments/${assessment.id}`,
    now,
  });
  auditExternal(db, {
    organizationId: invitation.organizationId,
    actorLabel: `Vendor (${invitation.email})`,
    action: "questionnaire.submitted",
    entityType: "assessment",
    entityId: assessment.id,
    summary: "Vendor submitted the questionnaire.",
    now,
  });
}

export async function addPortalDocument(
  db: Database,
  token: string,
  draft: { questionId?: string | null; fileName: string; contentType: string; sizeBytes: number; documentType: DocumentType; description?: string },
  now: string,
): Promise<EvidenceDocument> {
  const invitation = await requireInvitation(db, token, now);
  const assessment = db.assessments.find((item) => item.id === invitation.assessmentId && item.organizationId === invitation.organizationId);
  if (!assessment || !OPEN_FOR_VENDOR.has(assessment.status)) throw new AppError("conflict", "This questionnaire is locked.");
  const problem = validateUpload(draft.fileName, draft.contentType, draft.sizeBytes);
  if (problem) throw new AppError("validation", problem);
  if (draft.questionId) {
    const question = db.assessmentQuestions.find(
      (item) => item.id === draft.questionId && item.assessmentId === assessment.id && item.organizationId === invitation.organizationId,
    );
    if (!question) throw new AppError("validation", "That question is not part of this assessment.");
  }
  const id = createId();
  const fileName = sanitizeFileName(draft.fileName);
  const soc = draft.documentType === "soc2_type_i" || draft.documentType === "soc2_type_ii";
  const document: EvidenceDocument = {
    id,
    organizationId: invitation.organizationId,
    vendorId: assessment.vendorId,
    assessmentId: assessment.id,
    assessmentQuestionId: draft.questionId ?? null,
    findingId: null,
    fileName,
    storagePath: `${invitation.organizationId}/${assessment.vendorId}/${id}/${fileName}`,
    contentType: draft.contentType,
    sizeBytes: draft.sizeBytes,
    documentType: draft.documentType,
    description: (draft.description ?? "").slice(0, 2000),
    reviewStatus: "pending",
    uploadedById: null,
    uploadedByLabel: `Vendor (${invitation.email})`,
    uploadedAt: now,
    soc2: soc ? emptySoc2Review() : null,
    deletedAt: null,
  };
  db.documents.push(document);
  if (draft.questionId) {
    const response = db.responses.find((item) => item.assessmentQuestionId === draft.questionId && item.assessmentId === assessment.id);
    if (response && !response.documentIds.includes(document.id)) response.documentIds.push(document.id);
  }
  auditExternal(db, {
    organizationId: invitation.organizationId,
    actorLabel: `Vendor (${invitation.email})`,
    action: "evidence.uploaded",
    entityType: "document",
    entityId: document.id,
    summary: `Vendor uploaded ${fileName}.`,
    now,
  });
  return document;
}

export async function assertPortalDocument(db: Database, token: string, documentId: string, now: string): Promise<EvidenceDocument> {
  const invitation = await requireInvitation(db, token, now);
  const document = db.documents.find((item) => item.id === documentId && !item.deletedAt);
  if (!document || document.organizationId !== invitation.organizationId || document.assessmentId !== invitation.assessmentId) {
    throw new AppError("not_found", "Document not found.");
  }
  return document;
}
