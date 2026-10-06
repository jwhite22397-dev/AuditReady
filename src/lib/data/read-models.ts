import { toCsv } from "@/lib/domain/csv";
import {
  ASSESSMENT_STATUS_LABEL,
  CATEGORY_LABEL,
  DATA_ACCESS_LABEL,
  DOCUMENT_TYPE_LABEL,
  FINDING_STATUS_LABEL,
  RISK_LABEL,
  SYSTEM_ACCESS_LABEL,
} from "@/lib/domain/labels";
import { buildExecutiveSummary, type ReportFinding } from "@/lib/domain/report";
import { RISK_MODEL_SUMMARY, scoreControls } from "@/lib/domain/risk";
import { responseLabel } from "@/lib/domain/scoring";
import { daysBetween, todayUTC } from "@/lib/domain/tokens";
import type { AuditEvent, Database, Session } from "@/lib/domain/types";
import { isActiveAssessment, isOpenFinding } from "@/lib/domain/workflow";
import { effectiveInherent, effectiveResidual, getAssessmentRecord } from "./assessments";
import { assertCan, notify } from "./context";
import { getVendor } from "./vendors";

export function syncAttention(db: Database, session: Session, now: string) {
  const scope = assertCan(db, session, "assessments.read");
  const today = todayUTC(new Date(now));
  for (const assessment of db.assessments.filter((item) => item.organizationId === scope.org.id && !item.deletedAt)) {
    if (!isActiveAssessment(assessment.status)) continue;
    const delta = daysBetween(today, assessment.dueDate);
    if (delta < 0) {
      notify(db, {
        organizationId: scope.org.id,
        userId: assessment.ownerId,
        kind: "assessment.overdue",
        dedupeKey: `assessment.overdue:${assessment.id}:${assessment.dueDate}`,
        title: "Assessment overdue",
        body: `${assessment.name} was due ${assessment.dueDate}.`,
        href: `/assessments/${assessment.id}`,
        now,
      });
    } else if (delta <= 7) {
      notify(db, {
        organizationId: scope.org.id,
        userId: assessment.ownerId,
        kind: "assessment.due",
        dedupeKey: `assessment.due:${assessment.id}:${assessment.dueDate}`,
        title: "Assessment due soon",
        body: `${assessment.name} is due in ${delta} day${delta === 1 ? "" : "s"}.`,
        href: `/assessments/${assessment.id}`,
        now,
      });
    }
  }
  for (const acceptance of db.riskAcceptances.filter((item) => item.organizationId === scope.org.id)) {
    const delta = daysBetween(today, acceptance.expiresOn);
    if (delta > 14) continue;
    const finding = db.findings.find((item) => item.id === acceptance.findingId);
    if (!finding || finding.status === "closed") continue;
    notify(db, {
      organizationId: scope.org.id,
      userId: finding.ownerId ?? acceptance.approvedBy,
      kind: "risk_acceptance.expiring",
      dedupeKey: `risk_acceptance.expiring:${acceptance.id}`,
      title: delta < 0 ? "Risk acceptance expired" : "Risk acceptance expires soon",
      body: `${finding.reference} review date is ${acceptance.expiresOn}.`,
      href: `/findings/${finding.id}`,
      now,
    });
  }
}

export function getDashboard(db: Database, session: Session, now: string) {
  const scope = assertCan(db, session, "vendors.read");
  syncAttention(db, session, now);
  const today = todayUTC(new Date(now));
  const vendors = db.vendors.filter((vendor) => vendor.organizationId === scope.org.id && !vendor.deletedAt);
  const assessments = db.assessments.filter((assessment) => assessment.organizationId === scope.org.id && !assessment.deletedAt);
  const findings = db.findings.filter((finding) => finding.organizationId === scope.org.id && !finding.deletedAt);
  const active = assessments.filter((assessment) => isActiveAssessment(assessment.status));
  const due = active.filter((assessment) => daysBetween(today, assessment.dueDate) <= 14);
  const riskDistribution = { low: 0, moderate: 0, high: 0, critical: 0 };
  for (const vendor of vendors) {
    const level = vendor.overallRisk ?? "low";
    riskDistribution[level] += 1;
  }
  const statusDistribution = Object.fromEntries(Object.keys(ASSESSMENT_STATUS_LABEL).map((status) => [status, 0])) as Record<string, number>;
  for (const assessment of assessments) statusDistribution[assessment.status] = (statusDistribution[assessment.status] ?? 0) + 1;
  const attention = [
    ...active
      .filter((assessment) => assessment.dueDate < today)
      .map((assessment) => ({
        id: `overdue-${assessment.id}`,
        title: "Overdue assessment",
        detail: assessment.name,
        href: `/assessments/${assessment.id}`,
        tone: "critical" as const,
      })),
    ...assessments
      .filter((assessment) => assessment.status === "vendor_responded")
      .map((assessment) => ({
        id: `response-${assessment.id}`,
        title: "Vendor response waiting",
        detail: assessment.name,
        href: `/assessments/${assessment.id}`,
        tone: "warning" as const,
      })),
    ...findings
      .filter((finding) => (finding.risk === "high" || finding.risk === "critical") && isOpenFinding(finding.status))
      .map((finding) => ({
        id: `finding-${finding.id}`,
        title: `${RISK_LABEL[finding.risk]} finding open`,
        detail: `${finding.reference} ${finding.title}`,
        href: `/findings/${finding.id}`,
        tone: finding.risk,
      })),
  ].slice(0, 8);
  const recentActivity = db.auditEvents
    .filter((event) => event.organizationId === scope.org.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8);
  return {
    totalVendors: vendors.length,
    activeAssessments: active.length,
    highRiskVendors: vendors.filter((vendor) => vendor.overallRisk === "high" || vendor.overallRisk === "critical").length,
    openFindings: findings.filter((finding) => isOpenFinding(finding.status)).length,
    assessmentsDue: due.length,
    riskDistribution,
    statusDistribution,
    attention,
    recentActivity,
    dueItems: due
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 5)
      .map((assessment) => ({
        id: assessment.id,
        name: assessment.name,
        dueDate: assessment.dueDate,
        vendorName: db.vendors.find((vendor) => vendor.id === assessment.vendorId)?.name ?? "",
      })),
  };
}

export function getMyWork(db: Database, session: Session, now: string) {
  const scope = assertCan(db, session, "assessments.read");
  const today = todayUTC(new Date(now));
  const mine = db.assessments.filter(
    (assessment) => assessment.organizationId === scope.org.id && !assessment.deletedAt && assessment.ownerId === scope.user.id,
  );
  const decorate = (assessment: (typeof mine)[number]) => ({
    ...assessment,
    vendorName: db.vendors.find((vendor) => vendor.id === assessment.vendorId)?.name ?? "Vendor",
    residual: effectiveResidual(assessment),
  });
  const findings = db.findings.filter(
    (finding) => finding.organizationId === scope.org.id && !finding.deletedAt && finding.ownerId === scope.user.id && isOpenFinding(finding.status),
  );
  const remediation = db.remediations.filter((action) => {
    if (action.organizationId !== scope.org.id || action.status !== "ready_for_verification") return false;
    const finding = db.findings.find((item) => item.id === action.findingId);
    return finding?.ownerId === scope.user.id;
  });
  return {
    awaitingReview: mine.filter((assessment) => assessment.status === "in_review" || assessment.status === "vendor_responded").map(decorate),
    overdue: mine.filter((assessment) => isActiveAssessment(assessment.status) && assessment.dueDate < today).map(decorate),
    responsesReceived: mine.filter((assessment) => assessment.status === "vendor_responded").map(decorate),
    openFindings: findings.map((finding) => ({
      ...finding,
      vendorName: db.vendors.find((vendor) => vendor.id === finding.vendorId)?.name ?? "Vendor",
    })),
    remediationToVerify: remediation.map((action) => {
      const finding = db.findings.find((item) => item.id === action.findingId);
      return { ...action, findingReference: finding?.reference ?? "", findingTitle: finding?.title ?? "", findingId: action.findingId };
    }),
  };
}

export function listAudit(db: Database, session: Session): AuditEvent[] {
  const scope = assertCan(db, session, "audit.read");
  return db.auditEvents
    .filter((event) => event.organizationId === scope.org.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function timelineForAssessment(db: Database, session: Session, assessmentId: string): AuditEvent[] {
  const assessment = getAssessmentRecord(db, session, assessmentId);
  const related = new Set<string>([assessment.id, assessment.vendorId]);
  for (const finding of db.findings) if (finding.assessmentId === assessment.id) related.add(finding.id);
  for (const document of db.documents) if (document.assessmentId === assessment.id) related.add(document.id);
  for (const response of db.responses) if (response.assessmentId === assessment.id) related.add(response.id);
  return db.auditEvents
    .filter((event) => event.organizationId === assessment.organizationId && related.has(event.entityId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function listNotifications(db: Database, session: Session) {
  const scope = assertCan(db, session, "org.read");
  return db.notifications
    .filter((notification) => notification.organizationId === scope.org.id && notification.userId === scope.user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function markNotificationRead(db: Database, session: Session, notificationId: string, now: string) {
  const scope = assertCan(db, session, "org.read");
  const notification = db.notifications.find(
    (item) => item.id === notificationId && item.organizationId === scope.org.id && item.userId === scope.user.id,
  );
  if (!notification || notification.readAt) return;
  notification.readAt = now;
}

export function markAllNotificationsRead(db: Database, session: Session, now: string) {
  const scope = assertCan(db, session, "org.read");
  for (const notification of db.notifications) {
    if (notification.organizationId === scope.org.id && notification.userId === scope.user.id && !notification.readAt) {
      notification.readAt = now;
    }
  }
}

export function buildReport(db: Database, session: Session, assessmentId: string, now: string) {
  const scope = assertCan(db, session, "reports.read");
  const assessment = getAssessmentRecord(db, session, assessmentId);
  const vendor = getVendor(db, session, assessment.vendorId);
  const owner = db.users.find((user) => user.id === assessment.ownerId);
  const questions = db.assessmentQuestions
    .filter((question) => question.assessmentId === assessment.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const responses = db.responses.filter((response) => response.assessmentId === assessment.id);
  const control = scoreControls(
    questions.map((question) => ({
      weight: question.riskWeight,
      result: responses.find((response) => response.assessmentQuestionId === question.id)?.analystResult ?? "not_reviewed",
    })),
  );
  const sectionMap = new Map<string, { title: string; pass: number; partial: number; fail: number; na: number; notReviewed: number }>();
  for (const question of questions) {
    const bucket = sectionMap.get(question.sectionTitle) ?? {
      title: question.sectionTitle,
      pass: 0,
      partial: 0,
      fail: 0,
      na: 0,
      notReviewed: 0,
    };
    const result = responses.find((response) => response.assessmentQuestionId === question.id)?.analystResult ?? "not_reviewed";
    if (result === "not_reviewed") bucket.notReviewed += 1;
    else bucket[result] += 1;
    sectionMap.set(question.sectionTitle, bucket);
  }
  const findings = db.findings.filter((finding) => finding.assessmentId === assessment.id && !finding.deletedAt);
  const reportFindings: ReportFinding[] = findings.map((finding) => ({
    reference: finding.reference,
    title: finding.title,
    risk: finding.risk,
    status: finding.status,
    description: finding.description,
    recommendation: finding.recommendation,
  }));
  const decision = db.decisions
    .filter((item) => item.assessmentId === assessment.id)
    .sort((a, b) => b.decidedAt.localeCompare(a.decidedAt))[0];
  const generated = buildExecutiveSummary({
    vendorName: vendor.name,
    criticality: vendor.criticality,
    service: vendor.service,
    dataAccessLabel: DATA_ACCESS_LABEL[vendor.dataAccess].toLowerCase(),
    systemAccessLabel: SYSTEM_ACCESS_LABEL[vendor.systemAccess].toLowerCase(),
    findings: reportFindings,
    decision: decision && !decision.pending ? decision.decision : null,
    pendingApproval: Boolean(decision?.pending),
    residual: effectiveResidual(assessment),
  });
  return {
    generatedAt: now,
    organizationName: scope.org.name,
    vendor: {
      name: vendor.name,
      service: vendor.service,
      website: vendor.website,
      category: CATEGORY_LABEL[vendor.category],
      criticality: vendor.criticality,
      dataAccess: DATA_ACCESS_LABEL[vendor.dataAccess],
      systemAccess: SYSTEM_ACCESS_LABEL[vendor.systemAccess],
      businessOwner: vendor.businessOwner,
      securityOwner: vendor.securityOwner,
    },
    assessment: {
      id: assessment.id,
      name: assessment.name,
      type: assessment.type,
      status: assessment.status,
      dueDate: assessment.dueDate,
      createdAt: assessment.createdAt,
      submittedAt: assessment.submittedAt,
      ownerName: owner?.fullName ?? "Unassigned",
    },
    inherent: {
      level: effectiveInherent(assessment),
      calculated: assessment.inherentRisk,
      score: assessment.inherentScore,
      override: assessment.inherentOverride,
      justification: assessment.inherentJustification,
    },
    control,
    residual: {
      level: effectiveResidual(assessment),
      calculated: assessment.residualRisk,
      override: assessment.residualOverride,
      justification: assessment.residualJustification,
    },
    documents: db.documents
      .filter((document) => document.vendorId === vendor.id && !document.deletedAt && (!document.assessmentId || document.assessmentId === assessment.id))
      .map((document) => ({
        fileName: document.fileName,
        documentType: DOCUMENT_TYPE_LABEL[document.documentType],
        reviewStatus: document.reviewStatus,
        uploadedAt: document.uploadedAt,
        description: document.description,
      })),
    sections: [...sectionMap.values()],
    questionnaireRows: questions.map((question) => {
      const response = responses.find((item) => item.assessmentQuestionId === question.id);
      return {
        section: question.sectionTitle,
        prompt: question.prompt,
        controlRef: question.controlRef,
        answer: response ? responseLabel(question, response) : "No answer",
        result: response?.analystResult ?? "not_reviewed",
        notes: response?.analystNotes ?? "",
      };
    }),
    findings: findings.map((finding) => ({
      ...finding,
      remediations: db.remediations.filter((action) => action.findingId === finding.id),
      acceptance: db.riskAcceptances.filter((item) => item.findingId === finding.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null,
    })),
    decision: decision
      ? {
          ...decision,
          reviewerName: db.users.find((user) => user.id === decision.reviewerId)?.fullName ?? "Reviewer",
          approverName: decision.secondaryApproverId
            ? db.users.find((user) => user.id === decision.secondaryApproverId)?.fullName ?? "Approver"
            : null,
        }
      : null,
    executiveSummary: assessment.executiveSummary.trim() || generated,
    summaryIsEdited: assessment.executiveSummary.trim().length > 0,
    generatedSummary: generated,
    analystNotes: assessment.analystNotes,
    modelSummary: RISK_MODEL_SUMMARY,
  };
}

export function exportVendorsCsv(db: Database, session: Session): string {
  const scope = assertCan(db, session, "vendors.read");
  const rows = db.vendors
    .filter((vendor) => vendor.organizationId === scope.org.id && !vendor.deletedAt)
    .map((vendor) => [
      vendor.name,
      vendor.website,
      vendor.service,
      vendor.category,
      vendor.businessOwner,
      vendor.securityOwner,
      vendor.criticality,
      vendor.dataAccess,
      vendor.systemAccess,
      vendor.riskTier ?? "",
      vendor.overallRisk ?? "",
      vendor.assessmentStatus,
      vendor.lastAssessmentAt ?? "",
      vendor.nextReviewAt ?? "",
      vendor.notes,
    ]);
  return toCsv(
    ["name", "website", "service", "category", "business_owner", "security_owner", "criticality", "data_access", "system_access", "inherent_risk", "residual_risk", "assessment_status", "last_assessment", "next_review", "notes"],
    rows,
  );
}

export function exportFindingsCsv(db: Database, session: Session): string {
  const scope = assertCan(db, session, "findings.read");
  const rows = db.findings
    .filter((finding) => finding.organizationId === scope.org.id && !finding.deletedAt)
    .map((finding) => [
      finding.reference,
      db.vendors.find((vendor) => vendor.id === finding.vendorId)?.name ?? "",
      finding.title,
      finding.risk,
      FINDING_STATUS_LABEL[finding.status],
      finding.ownerId ? db.users.find((user) => user.id === finding.ownerId)?.fullName ?? "" : "",
      finding.targetDate ?? "",
      finding.closureDate ?? "",
      finding.description,
      finding.recommendation,
    ]);
  return toCsv(
    ["reference", "vendor", "title", "risk", "status", "owner", "target_date", "closure_date", "description", "recommendation"],
    rows,
  );
}

export function exportAssessmentCsv(db: Database, session: Session, assessmentId: string, now: string): string {
  const report = buildReport(db, session, assessmentId, now);
  return toCsv(
    ["section", "control_ref", "question", "answer", "result", "notes"],
    report.questionnaireRows.map((row) => [row.section, row.controlRef, row.prompt, row.answer, row.result, row.notes]),
  );
}
