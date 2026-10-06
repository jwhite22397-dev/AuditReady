import { AppError } from "@/lib/domain/errors";
import { createId } from "@/lib/domain/tokens";
import type { Database, Finding, FindingStatus, Session } from "@/lib/domain/types";
import { findingSchema, remediationSchema, riskAcceptanceSchema } from "@/lib/domain/validation";
import { canTransitionFinding } from "@/lib/domain/workflow";
import { assertCan, audit, notify, parseInput } from "./context";
import { getAssessmentRecord } from "./assessments";
import { getVendor, refreshVendor } from "./vendors";

export function listFindings(db: Database, session: Session, filters?: { vendorId?: string; status?: FindingStatus | "open" | "all"; risk?: Finding["risk"] | "all" }) {
  const scope = assertCan(db, session, "findings.read");
  let rows = db.findings.filter((finding) => finding.organizationId === scope.org.id && !finding.deletedAt);
  if (filters?.vendorId) rows = rows.filter((finding) => finding.vendorId === filters.vendorId);
  if (filters?.status === "open") rows = rows.filter((finding) => finding.status !== "closed");
  else if (filters?.status && filters.status !== "all") rows = rows.filter((finding) => finding.status === filters.status);
  if (filters?.risk && filters.risk !== "all") rows = rows.filter((finding) => finding.risk === filters.risk);
  return rows
    .map((finding) => ({
      ...finding,
      vendorName: db.vendors.find((vendor) => vendor.id === finding.vendorId)?.name ?? "Vendor",
      ownerName: db.users.find((user) => user.id === finding.ownerId)?.fullName ?? "Unassigned",
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getFinding(db: Database, session: Session, findingId: string): Finding {
  const scope = assertCan(db, session, "findings.read");
  const finding = db.findings.find((item) => item.id === findingId && item.organizationId === scope.org.id && !item.deletedAt);
  if (!finding) throw new AppError("not_found", "Finding not found.");
  return finding;
}

export function createFinding(db: Database, session: Session, input: unknown, now: string): Finding {
  const scope = assertCan(db, session, "findings.write");
  const parsed = parseInput(findingSchema, input);
  const vendor = getVendor(db, session, parsed.vendorId);
  if (parsed.assessmentId) getAssessmentRecord(db, session, parsed.assessmentId);
  if (parsed.assessmentQuestionId) {
    const question = db.assessmentQuestions.find(
      (item) => item.id === parsed.assessmentQuestionId && item.organizationId === scope.org.id,
    );
    if (!question || (parsed.assessmentId && question.assessmentId !== parsed.assessmentId)) {
      throw new AppError("validation", "That question is not part of this assessment.");
    }
  }
  const sequence = db.findings.filter((finding) => finding.organizationId === scope.org.id).length + 1;
  const finding: Finding = {
    id: createId(),
    organizationId: scope.org.id,
    vendorId: vendor.id,
    assessmentId: parsed.assessmentId ?? null,
    assessmentQuestionId: parsed.assessmentQuestionId ?? null,
    reference: `F-${String(sequence).padStart(3, "0")}`,
    title: parsed.title,
    description: parsed.description,
    risk: parsed.risk,
    recommendation: parsed.recommendation,
    vendorResponse: parsed.vendorResponse,
    ownerId: parsed.ownerId ?? scope.user.id,
    status: "open",
    targetDate: parsed.targetDate ?? null,
    closureDate: null,
    closureNotes: "",
    closureDocumentId: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  db.findings.push(finding);
  refreshVendor(db, vendor.id);
  audit(db, scope, {
    action: "finding.created",
    entityType: "finding",
    entityId: finding.id,
    summary: `${finding.reference} created: ${finding.title}.`,
    after: { risk: finding.risk, vendorId: vendor.id },
    now,
  });
  return finding;
}

export function updateFinding(db: Database, session: Session, findingId: string, input: unknown, now: string): Finding {
  const scope = assertCan(db, session, "findings.write");
  const finding = getFinding(db, session, findingId);
  const parsed = parseInput(findingSchema, input);
  if (parsed.vendorId !== finding.vendorId) throw new AppError("validation", "A finding stays with its vendor.");
  const before = { title: finding.title, risk: finding.risk, vendorResponse: finding.vendorResponse };
  finding.title = parsed.title;
  finding.description = parsed.description;
  finding.risk = parsed.risk;
  finding.recommendation = parsed.recommendation;
  finding.vendorResponse = parsed.vendorResponse;
  finding.ownerId = parsed.ownerId ?? finding.ownerId;
  finding.targetDate = parsed.targetDate ?? null;
  finding.updatedAt = now;
  if (parsed.vendorResponse && finding.status === "open") finding.status = "vendor_response";
  audit(db, scope, {
    action: "finding.updated",
    entityType: "finding",
    entityId: finding.id,
    summary: `${finding.reference} updated.`,
    before,
    after: { title: finding.title, risk: finding.risk },
    now,
  });
  return finding;
}

export function setFindingStatus(db: Database, session: Session, findingId: string, status: FindingStatus, now: string, closureNotes = ""): void {
  const scope = assertCan(db, session, "findings.write");
  const finding = getFinding(db, session, findingId);
  if (status === "risk_accepted") {
    throw new AppError("conflict", "Record a risk acceptance. Findings cannot be marked accepted directly.");
  }
  if (!canTransitionFinding(finding.status, status)) {
    throw new AppError("conflict", "That finding status change is not allowed.");
  }
  if (status === "closed") {
    if (closureNotes.trim().length < 8) throw new AppError("validation", "Closure notes are required.");
    const actions = db.remediations.filter((item) => item.findingId === finding.id);
    if (actions.length > 0 && !actions.some((item) => item.status === "verified")) {
      throw new AppError("conflict", "Verify remediation before closing this finding.");
    }
    finding.closureNotes = closureNotes.trim();
    finding.closureDate = now.slice(0, 10);
  }
  const before = finding.status;
  finding.status = status;
  finding.updatedAt = now;
  audit(db, scope, {
    action: status === "closed" ? "finding.closed" : "finding.status_changed",
    entityType: "finding",
    entityId: finding.id,
    summary: `${finding.reference} moved from ${before.replaceAll("_", " ")} to ${status.replaceAll("_", " ")}.`,
    before: { status: before },
    after: { status },
    now,
  });
}

export function addRemediation(db: Database, session: Session, findingId: string, input: unknown, now: string) {
  const scope = assertCan(db, session, "findings.write");
  const finding = getFinding(db, session, findingId);
  const parsed = parseInput(remediationSchema, input);
  const action = {
    id: createId(),
    organizationId: scope.org.id,
    findingId: finding.id,
    requiredAction: parsed.requiredAction,
    vendorResponse: parsed.vendorResponse,
    targetDate: parsed.targetDate ?? null,
    status: parsed.status,
    closureDocumentId: null,
    analystVerification: "",
    verifiedBy: null,
    verifiedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  db.remediations.push(action);
  if (finding.status === "open" || finding.status === "vendor_response") finding.status = "remediation";
  finding.updatedAt = now;
  const assessment = finding.assessmentId ? db.assessments.find((item) => item.id === finding.assessmentId) : undefined;
  if (assessment && (assessment.status === "in_review" || assessment.status === "vendor_responded")) {
    assessment.status = "remediation";
    assessment.updatedAt = now;
    refreshVendor(db, assessment.vendorId);
  }
  audit(db, scope, {
    action: "remediation.created",
    entityType: "remediation",
    entityId: action.id,
    summary: `Remediation recorded for ${finding.reference}.`,
    after: { requiredAction: action.requiredAction },
    now,
  });
  return action;
}

export function updateRemediation(db: Database, session: Session, remediationId: string, input: unknown, now: string) {
  const scope = assertCan(db, session, "findings.write");
  const action = db.remediations.find((item) => item.id === remediationId && item.organizationId === scope.org.id);
  if (!action) throw new AppError("not_found", "Remediation not found.");
  const parsed = parseInput(remediationSchema, input);
  const hadResponse = action.vendorResponse.trim().length > 0;
  action.requiredAction = parsed.requiredAction;
  action.vendorResponse = parsed.vendorResponse;
  action.targetDate = parsed.targetDate ?? null;
  if (action.status !== "verified") action.status = parsed.status === "verified" ? action.status : parsed.status;
  action.updatedAt = now;
  const finding = getFinding(db, session, action.findingId);
  if (!hadResponse && action.vendorResponse.trim()) {
    notify(db, {
      organizationId: scope.org.id,
      userId: finding.ownerId ?? scope.user.id,
      kind: "remediation.response",
      dedupeKey: `remediation.response:${action.id}:${action.updatedAt}`,
      title: "Remediation response received",
      body: `${finding.reference} has a vendor response.`,
      href: `/findings/${finding.id}`,
      now,
    });
    audit(db, scope, {
      action: "remediation.response_received",
      entityType: "remediation",
      entityId: action.id,
      summary: `Vendor response recorded for ${finding.reference}.`,
      now,
    });
  }
  return action;
}

export function verifyRemediation(db: Database, session: Session, remediationId: string, verification: string, now: string) {
  const scope = assertCan(db, session, "findings.write");
  const action = db.remediations.find((item) => item.id === remediationId && item.organizationId === scope.org.id);
  if (!action) throw new AppError("not_found", "Remediation not found.");
  if (verification.trim().length < 8) throw new AppError("validation", "Describe what you verified.");
  action.status = "verified";
  action.analystVerification = verification.trim();
  action.verifiedBy = scope.user.id;
  action.verifiedAt = now;
  action.updatedAt = now;
  const finding = getFinding(db, session, action.findingId);
  audit(db, scope, {
    action: "remediation.verified",
    entityType: "remediation",
    entityId: action.id,
    summary: `Remediation for ${finding.reference} verified.`,
    after: { verification: action.analystVerification },
    now,
  });
}

export function recordRiskAcceptance(db: Database, session: Session, findingId: string, input: unknown, now: string) {
  const finding = getFinding(db, session, findingId);
  const elevated = finding.risk === "high" || finding.risk === "critical";
  const scope = assertCan(db, session, elevated ? "findings.accept_high_risk" : "findings.write");
  const parsed = parseInput(riskAcceptanceSchema, input);
  if (parsed.expiresOn < now.slice(0, 10)) throw new AppError("validation", "The review date must be today or later.");
  const acceptance = {
    id: createId(),
    organizationId: scope.org.id,
    findingId: finding.id,
    risk: finding.risk,
    businessJustification: parsed.businessJustification,
    compensatingControls: parsed.compensatingControls,
    approvedBy: scope.user.id,
    approvalDate: now.slice(0, 10),
    expiresOn: parsed.expiresOn,
    createdAt: now,
  };
  db.riskAcceptances.push(acceptance);
  const before = finding.status;
  finding.status = "risk_accepted";
  finding.updatedAt = now;
  audit(db, scope, {
    action: "risk.accepted",
    entityType: "finding",
    entityId: finding.id,
    summary: `${finding.reference} risk accepted until ${parsed.expiresOn}.`,
    before: { status: before, risk: finding.risk },
    after: {
      status: finding.status,
      justification: parsed.businessJustification,
      compensatingControls: parsed.compensatingControls,
      expiresOn: parsed.expiresOn,
      approvedBy: scope.user.id,
    },
    now,
  });
  return acceptance;
}
