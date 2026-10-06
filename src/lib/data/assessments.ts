import { AppError } from "@/lib/domain/errors";
import { entitlementsFor, withinLimit } from "@/lib/domain/entitlements";
import { effectiveLevel, residualRisk, scoreControls } from "@/lib/domain/risk";
import { isAnswered } from "@/lib/domain/scoring";
import { createId, daysBetween, nextReviewDate, todayUTC } from "@/lib/domain/tokens";
import type {
  Assessment,
  AssessmentQuestion,
  AssessmentStatus,
  Database,
  DecisionOutcome,
  ResponseRecord,
  Session,
} from "@/lib/domain/types";
import { assessmentSchema, decisionSchema, overrideSchema, reviewSchema } from "@/lib/domain/validation";
import { canTransitionAssessment, decisionToStatus, isActiveAssessment } from "@/lib/domain/workflow";
import { assertCan, audit, notify, parseInput, type EngineCtx } from "./context";
import { requireTemplate } from "./templates";
import { getVendor, refreshVendor } from "./vendors";

export function listAssessments(db: Database, session: Session, filters?: AssessmentFilters) {
  const scope = assertCan(db, session, "assessments.read");
  const today = todayUTC();
  let rows = db.assessments.filter((assessment) => assessment.organizationId === scope.org.id && !assessment.deletedAt);
  if (filters?.status && filters.status !== "all") rows = rows.filter((assessment) => assessment.status === filters.status);
  if (filters?.ownerId && filters.ownerId !== "all") rows = rows.filter((assessment) => assessment.ownerId === filters.ownerId);
  if (filters?.risk && filters.risk !== "all") {
    rows = rows.filter((assessment) => effectiveResidual(assessment) === filters.risk);
  }
  if (filters?.due === "overdue") {
    rows = rows.filter((assessment) => isActiveAssessment(assessment.status) && assessment.dueDate < today);
  }
  if (filters?.due === "due_30") {
    rows = rows.filter((assessment) => isActiveAssessment(assessment.status) && daysBetween(today, assessment.dueDate) <= 30);
  }
  const search = filters?.search?.trim().toLowerCase();
  const items = rows.map((assessment) => {
    const vendor = db.vendors.find((item) => item.id === assessment.vendorId);
    const owner = db.users.find((item) => item.id === assessment.ownerId);
    return {
      ...assessment,
      vendorName: vendor?.name ?? "Vendor",
      ownerName: owner?.fullName ?? "Unassigned",
      residual: effectiveResidual(assessment),
      inherent: effectiveInherent(assessment),
    };
  });
  const filtered = search
    ? items.filter((item) => item.name.toLowerCase().includes(search) || item.vendorName.toLowerCase().includes(search))
    : items;
  return filtered.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export interface AssessmentFilters {
  search?: string;
  status?: AssessmentStatus | "all";
  ownerId?: string | "all";
  risk?: Assessment["residualRisk"] | "all";
  due?: "all" | "overdue" | "due_30";
}

export function getAssessmentRecord(db: Database, session: Session, assessmentId: string): Assessment {
  const scope = assertCan(db, session, "assessments.read");
  const assessment = db.assessments.find(
    (item) => item.id === assessmentId && item.organizationId === scope.org.id && !item.deletedAt,
  );
  if (!assessment) throw new AppError("not_found", "Assessment not found.");
  return assessment;
}

export function createAssessment(db: Database, session: Session, input: unknown, now: string, mode: EngineCtx["mode"]): Assessment {
  const scope = assertCan(db, session, "assessments.write");
  const limits = entitlementsFor(scope.org.plan, mode);
  const active = db.assessments.filter(
    (assessment) => assessment.organizationId === scope.org.id && !assessment.deletedAt && isActiveAssessment(assessment.status),
  ).length;
  if (!withinLimit(active, limits.activeAssessments)) {
    throw new AppError("conflict", "The plan assessment limit has been reached.");
  }
  const parsed = parseInput(assessmentSchema, input);
  const vendor = getVendor(db, session, parsed.vendorId);
  const template = requireTemplate(db, scope.org.id, parsed.templateId);
  const owner = db.members.find((member) => member.organizationId === scope.org.id && member.userId === parsed.ownerId && !member.deletedAt);
  if (!owner) throw new AppError("validation", "Choose an owner in this workspace.");
  const inherent = vendor.riskTier ?? "moderate";
  const assessment: Assessment = {
    id: createId(),
    organizationId: scope.org.id,
    vendorId: vendor.id,
    name: parsed.name,
    type: parsed.type,
    ownerId: parsed.ownerId,
    templateId: template.id,
    previousAssessmentId: null,
    status: "draft",
    dueDate: parsed.dueDate,
    inherentRisk: vendor.inherent?.recommended ?? inherent,
    inherentScore: vendor.inherent?.score ?? 0,
    inherentOverride: vendor.inherent?.override ?? null,
    inherentJustification: vendor.inherent?.overrideJustification ?? "",
    controlRisk: "moderate",
    controlScore: 0,
    controlPreliminary: true,
    residualRisk: inherent,
    residualOverride: null,
    residualJustification: "",
    executiveSummary: "",
    analystNotes: "",
    submittedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  db.assessments.push(assessment);
  snapshotQuestions(db, scope.org.id, assessment.id, template.id, now);
  recalculateAssessment(db, assessment.id);
  refreshVendor(db, vendor.id);
  audit(db, scope, {
    action: "assessment.created",
    entityType: "assessment",
    entityId: assessment.id,
    summary: `Assessment ${assessment.name} created for ${vendor.name}.`,
    after: { status: assessment.status, vendorId: vendor.id },
    now,
  });
  return assessment;
}

export function setAssessmentStatus(
  db: Database,
  session: Session,
  assessmentId: string,
  status: AssessmentStatus,
  now: string,
  reason = "status.changed",
): Assessment {
  const scope = assertCan(db, session, "assessments.write");
  const assessment = getAssessmentRecord(db, session, assessmentId);
  if (!canTransitionAssessment(assessment.status, status)) {
    throw new AppError("conflict", `Cannot move this assessment from ${assessment.status.replaceAll("_", " ")} to ${status.replaceAll("_", " ")}.`);
  }
  const before = assessment.status;
  assessment.status = status;
  assessment.updatedAt = now;
  refreshVendor(db, assessment.vendorId);
  audit(db, scope, {
    action: reason,
    entityType: "assessment",
    entityId: assessment.id,
    summary: `Assessment status changed from ${before.replaceAll("_", " ")} to ${status.replaceAll("_", " ")}.`,
    before: { status: before },
    after: { status },
    now,
  });
  return assessment;
}

export function startReassessment(db: Database, session: Session, assessmentId: string, now: string, mode: EngineCtx["mode"]): Assessment {
  const previous = getAssessmentRecord(db, session, assessmentId);
  const vendor = getVendor(db, session, previous.vendorId);
  const due = new Date(now);
  due.setUTCDate(due.getUTCDate() + 30);
  const created = createAssessment(
    db,
    session,
    {
      vendorId: vendor.id,
      name: `${vendor.name} reassessment`,
      type: "reassessment",
      ownerId: session.userId,
      templateId: previous.templateId,
      dueDate: due.toISOString().slice(0, 10),
    },
    now,
    mode,
  );
  created.previousAssessmentId = previous.id;
  const scope = assertCan(db, session, "assessments.write");
  void scope;
  audit(db, scope, {
    action: "assessment.reassessment_started",
    entityType: "assessment",
    entityId: created.id,
    summary: `Reassessment started. Previous answers were not copied.`,
    after: { previousAssessmentId: previous.id },
    now,
  });
  return created;
}

export function saveReview(
  db: Database,
  session: Session,
  responseId: string,
  input: unknown,
  now: string,
): ResponseRecord {
  const scope = assertCan(db, session, "assessments.write");
  const parsed = parseInput(reviewSchema, input);
  const response = db.responses.find((item) => item.id === responseId && item.organizationId === scope.org.id);
  if (!response) throw new AppError("not_found", "Response not found.");
  const before = response.analystResult;
  response.analystResult = parsed.result;
  response.analystNotes = parsed.notes;
  response.reviewedBy = scope.user.id;
  response.reviewedAt = now;
  response.updatedAt = now;
  recalculateAssessment(db, response.assessmentId);
  const assessment = db.assessments.find((item) => item.id === response.assessmentId);
  if (assessment) assessment.updatedAt = now;
  audit(db, scope, {
    action: "response.reviewed",
    entityType: "response",
    entityId: response.id,
    summary: `Control marked ${parsed.result.replaceAll("_", " ")}.`,
    before: { result: before },
    after: { result: parsed.result },
    now,
  });
  return response;
}

export function setInherentOverride(db: Database, session: Session, assessmentId: string, input: unknown, now: string): void {
  const scope = assertCan(db, session, "assessments.write");
  const assessment = getAssessmentRecord(db, session, assessmentId);
  const parsed = parseInput(overrideSchema, input);
  if (parsed.level && parsed.justification.trim().length < 8) {
    throw new AppError("validation", "A justification is required to override inherent risk.");
  }
  const before = effectiveInherent(assessment);
  assessment.inherentOverride = parsed.level;
  assessment.inherentJustification = parsed.level ? parsed.justification : "";
  assessment.updatedAt = now;
  recalculateAssessment(db, assessment.id);
  audit(db, scope, {
    action: "risk.changed",
    entityType: "assessment",
    entityId: assessment.id,
    summary: `Inherent risk override ${parsed.level ? `set to ${parsed.level}` : "cleared"}.`,
    before: { inherent: before },
    after: { inherent: effectiveInherent(assessment), justification: assessment.inherentJustification },
    now,
  });
}

export function setResidualOverride(db: Database, session: Session, assessmentId: string, input: unknown, now: string): void {
  const scope = assertCan(db, session, "assessments.write");
  const assessment = getAssessmentRecord(db, session, assessmentId);
  const parsed = parseInput(overrideSchema, input);
  if (parsed.level && parsed.justification.trim().length < 8) {
    throw new AppError("validation", "A justification is required to override residual risk.");
  }
  const before = effectiveResidual(assessment);
  assessment.residualOverride = parsed.level;
  assessment.residualJustification = parsed.level ? parsed.justification : "";
  assessment.updatedAt = now;
  refreshVendor(db, assessment.vendorId);
  audit(db, scope, {
    action: "risk.changed",
    entityType: "assessment",
    entityId: assessment.id,
    summary: `Residual risk ${parsed.level ? `overridden to ${parsed.level}` : "override cleared"}.`,
    before: { residual: before },
    after: { residual: effectiveResidual(assessment), justification: assessment.residualJustification },
    now,
  });
}

export function setExecutiveSummary(db: Database, session: Session, assessmentId: string, summary: string, now: string): void {
  const scope = assertCan(db, session, "reports.write");
  const assessment = getAssessmentRecord(db, session, assessmentId);
  assessment.executiveSummary = summary.trim().slice(0, 4000);
  assessment.updatedAt = now;
  audit(db, scope, {
    action: "report.summary_edited",
    entityType: "assessment",
    entityId: assessment.id,
    summary: "Executive summary edited.",
    now,
  });
}

export function setAnalystNotes(db: Database, session: Session, assessmentId: string, notes: string, now: string): void {
  assertCan(db, session, "assessments.write");
  const assessment = getAssessmentRecord(db, session, assessmentId);
  assessment.analystNotes = notes.trim().slice(0, 8000);
  assessment.updatedAt = now;
}

export function recordDecision(db: Database, session: Session, assessmentId: string, input: unknown, now: string) {
  const scope = assertCan(db, session, "decisions.write");
  const assessment = getAssessmentRecord(db, session, assessmentId);
  const parsed = parseInput(decisionSchema, input);
  const residual = effectiveResidual(assessment);
  const elevated = residual === "high" || residual === "critical";
  if (parsed.requiresSecondaryApproval && !elevated) {
    throw new AppError("validation", "Additional approval is used for high or critical residual risk.");
  }
  const pending = parsed.requiresSecondaryApproval;
  const nextStatus = pending ? assessment.status : decisionToStatus(parsed.decision);
  if (!pending && !canTransitionAssessment(assessment.status, nextStatus)) {
    throw new AppError("conflict", "Record the decision from review or remediation.");
  }
  const decision = {
    id: createId(),
    organizationId: scope.org.id,
    assessmentId: assessment.id,
    decision: parsed.decision,
    notes: parsed.notes,
    reviewerId: scope.user.id,
    decidedAt: now,
    requiresSecondaryApproval: parsed.requiresSecondaryApproval,
    secondaryApproverId: null,
    secondaryApprovedAt: null,
    pending,
  };
  db.decisions.push(decision);
  if (!pending) applyDecision(db, assessment, parsed.decision, now);
  else {
    notify(db, {
      organizationId: scope.org.id,
      userId: ownerIds(db, scope.org.id)[0] ?? assessment.ownerId,
      kind: "decision.pending",
      dedupeKey: `decision.pending:${decision.id}`,
      title: "Decision needs approval",
      body: `${assessment.name} is waiting for owner or admin approval.`,
      href: `/assessments/${assessment.id}`,
      now,
    });
  }
  audit(db, scope, {
    action: "decision.made",
    entityType: "assessment",
    entityId: assessment.id,
    summary: pending
      ? `Decision ${parsed.decision.replaceAll("_", " ")} recorded and waiting for approval.`
      : `Decision recorded: ${parsed.decision.replaceAll("_", " ")}.`,
    after: { decision: parsed.decision, pending, notes: parsed.notes },
    now,
  });
  return decision;
}

export function confirmDecision(db: Database, session: Session, decisionId: string, now: string) {
  const scope = assertCan(db, session, "decisions.approve_high");
  const decision = db.decisions.find((item) => item.id === decisionId && item.organizationId === scope.org.id);
  if (!decision) throw new AppError("not_found", "Decision not found.");
  if (!decision.pending) throw new AppError("conflict", "This decision is already final.");
  const assessment = getAssessmentRecord(db, session, decision.assessmentId);
  decision.pending = false;
  decision.secondaryApproverId = scope.user.id;
  decision.secondaryApprovedAt = now;
  applyDecision(db, assessment, decision.decision, now);
  audit(db, scope, {
    action: "decision.approved",
    entityType: "assessment",
    entityId: assessment.id,
    summary: `Additional approval recorded for ${decision.decision.replaceAll("_", " ")}.`,
    now,
  });
}

export function recalculateAssessment(db: Database, assessmentId: string): void {
  const assessment = db.assessments.find((item) => item.id === assessmentId);
  if (!assessment) return;
  const questions = db.assessmentQuestions.filter((question) => question.assessmentId === assessmentId);
  const responses = db.responses.filter((response) => response.assessmentId === assessmentId);
  const score = scoreControls(
    questions.map((question) => ({
      weight: question.riskWeight,
      result: responses.find((response) => response.assessmentQuestionId === question.id)?.analystResult ?? "not_reviewed",
    })),
  );
  assessment.controlRisk = score.level;
  assessment.controlScore = score.ratio;
  assessment.controlPreliminary = score.preliminary;
  const inherent = effectiveInherent(assessment);
  assessment.residualRisk = residualRisk(inherent, score.level);
  refreshVendor(db, assessment.vendorId);
}

export function effectiveInherent(assessment: Assessment) {
  return effectiveLevel(assessment.inherentRisk, assessment.inherentOverride);
}

export function effectiveResidual(assessment: Assessment) {
  return effectiveLevel(assessment.residualRisk, assessment.residualOverride);
}

export function snapshotQuestions(db: Database, organizationId: string, assessmentId: string, templateId: string, now: string) {
  const sections = db.sections.filter((section) => section.templateId === templateId).sort((a, b) => a.sortOrder - b.sortOrder);
  let order = 0;
  for (const section of sections) {
    const questions = db.questions
      .filter((question) => question.sectionId === section.id && !question.archivedAt)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    for (const question of questions) {
      const assessmentQuestion: AssessmentQuestion = {
        id: createId(),
        organizationId,
        assessmentId,
        sourceQuestionId: question.id,
        sectionTitle: section.title,
        prompt: question.prompt,
        helpText: question.helpText,
        type: question.type,
        options: [...question.options],
        riskWeight: question.riskWeight,
        evidenceRequired: question.evidenceRequired,
        guidance: question.guidance,
        controlRef: question.controlRef,
        mappings: question.mappings.map((mapping) => ({ ...mapping })),
        sortOrder: order,
      };
      order += 1;
      db.assessmentQuestions.push(assessmentQuestion);
      const response: ResponseRecord = {
        id: createId(),
        organizationId,
        assessmentId,
        assessmentQuestionId: assessmentQuestion.id,
        answerBoolean: null,
        answerNa: false,
        answerText: "",
        answerChoice: "",
        documentIds: [],
        analystResult: "not_reviewed",
        analystNotes: "",
        reviewedBy: null,
        reviewedAt: null,
        updatedAt: now,
      };
      db.responses.push(response);
    }
  }
}

export function unansweredCount(db: Database, assessmentId: string): number {
  const questions = db.assessmentQuestions.filter((question) => question.assessmentId === assessmentId);
  return questions.filter((question) => {
    const response = db.responses.find((item) => item.assessmentQuestionId === question.id);
    if (!response) return true;
    return !isAnswered(question, response);
  }).length;
}

function applyDecision(db: Database, assessment: Assessment, decision: DecisionOutcome, now: string) {
  const status = decisionToStatus(decision);
  assessment.status = status;
  assessment.updatedAt = now;
  if (decision === "approved" || decision === "approved_with_conditions") {
    const vendor = db.vendors.find((item) => item.id === assessment.vendorId);
    if (vendor) vendor.nextReviewAt = nextReviewDate(now, vendor.reviewFrequency);
  }
  refreshVendor(db, assessment.vendorId);
}

function ownerIds(db: Database, organizationId: string): string[] {
  return db.members
    .filter((member) => member.organizationId === organizationId && !member.deletedAt && (member.role === "owner" || member.role === "admin"))
    .map((member) => member.userId);
}

export function devForceStatus(db: Database, session: Session, assessmentId: string, status: AssessmentStatus, now: string) {
  const scope = assertCan(db, session, "assessments.write");
  const assessment = getAssessmentRecord(db, session, assessmentId);
  const before = assessment.status;
  assessment.status = status;
  assessment.updatedAt = now;
  refreshVendor(db, assessment.vendorId);
  audit(db, scope, {
    action: "dev.status_override",
    entityType: "assessment",
    entityId: assessment.id,
    summary: `Development override changed status from ${before} to ${status}.`,
    before: { status: before },
    after: { status },
    now,
  });
}
