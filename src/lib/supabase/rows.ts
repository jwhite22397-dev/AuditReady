import type {
  AppNotification,
  Assessment,
  AssessmentDecision,
  AssessmentQuestion,
  AuditEvent,
  Database,
  EvidenceDocument,
  Finding,
  Invitation,
  Membership,
  Organization,
  OrgInvite,
  Question,
  QuestionnaireSection,
  QuestionnaireTemplate,
  RemediationAction,
  ResponseRecord,
  RiskAcceptance,
  User,
  Vendor,
  VendorContact,
} from "@/lib/domain/types";

type Row = Record<string, unknown>;

function text(row: Row, key: string): string {
  const value = row[key];
  return typeof value === "string" ? value : "";
}

function textOrNull(row: Row, key: string): string | null {
  const value = row[key];
  if (value == null) return null;
  return typeof value === "string" ? value : null;
}

function bool(row: Row, key: string): boolean {
  return row[key] === true;
}

function num(row: Row, key: string): number {
  const value = row[key];
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return 0;
}

function iso(row: Row, key: string): string {
  const value = text(row, key);
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
}

function isoOrNull(row: Row, key: string): string | null {
  const value = textOrNull(row, key);
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
}

function dateOnly(row: Row, key: string): string | null {
  const value = textOrNull(row, key);
  return value ? value.slice(0, 10) : null;
}

function json<T>(row: Row, key: string, fallback: T): T {
  const value = row[key];
  if (value == null) return fallback;
  return value as T;
}

export function userToRow(user: User): Row {
  return {
    id: user.id,
    email: user.email,
    full_name: user.fullName,
    job_title: user.jobTitle,
    created_at: user.createdAt,
  };
}

export function userFromRow(row: Row): User {
  return {
    id: text(row, "id"),
    email: text(row, "email"),
    fullName: text(row, "full_name"),
    jobTitle: text(row, "job_title"),
    passwordHash: null,
    passwordSalt: null,
    createdAt: iso(row, "created_at"),
  };
}

export function organizationToRow(org: Organization): Row {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    plan: org.plan,
    created_at: org.createdAt,
    deleted_at: org.deletedAt,
  };
}

export function organizationFromRow(row: Row): Organization {
  return {
    id: text(row, "id"),
    name: text(row, "name"),
    slug: text(row, "slug"),
    plan: text(row, "plan") as Organization["plan"],
    createdAt: iso(row, "created_at"),
    deletedAt: isoOrNull(row, "deleted_at"),
  };
}

export function membershipToRow(member: Membership): Row {
  return {
    id: member.id,
    organization_id: member.organizationId,
    user_id: member.userId,
    role: member.role,
    created_at: member.createdAt,
    deleted_at: member.deletedAt,
  };
}

export function membershipFromRow(row: Row): Membership {
  return {
    id: text(row, "id"),
    organizationId: text(row, "organization_id"),
    userId: text(row, "user_id"),
    role: text(row, "role") as Membership["role"],
    createdAt: iso(row, "created_at"),
    deletedAt: isoOrNull(row, "deleted_at"),
  };
}

export function inviteToRow(invite: OrgInvite): Row {
  return {
    id: invite.id,
    organization_id: invite.organizationId,
    email: invite.email,
    role: invite.role,
    code_hash: invite.codeHash,
    created_by: invite.createdBy,
    created_at: invite.createdAt,
    accepted_at: invite.acceptedAt,
    expires_at: invite.expiresAt,
  };
}

export function inviteFromRow(row: Row): OrgInvite {
  return {
    id: text(row, "id"),
    organizationId: text(row, "organization_id"),
    email: text(row, "email"),
    role: text(row, "role") as OrgInvite["role"],
    codeHash: text(row, "code_hash"),
    createdBy: text(row, "created_by"),
    createdAt: iso(row, "created_at"),
    acceptedAt: isoOrNull(row, "accepted_at"),
    expiresAt: iso(row, "expires_at"),
  };
}

export function vendorToRow(vendor: Vendor): Row {
  return {
    id: vendor.id,
    organization_id: vendor.organizationId,
    name: vendor.name,
    website: vendor.website,
    service: vendor.service,
    category: vendor.category,
    business_owner: vendor.businessOwner,
    security_owner: vendor.securityOwner,
    criticality: vendor.criticality,
    criticality_justification: vendor.criticalityJustification,
    criticality_factors: vendor.criticalityFactors,
    data_access: vendor.dataAccess,
    system_access: vendor.systemAccess,
    risk_tier: vendor.riskTier,
    inherent: vendor.inherent,
    assessment_status: vendor.assessmentStatus,
    last_assessment_at: vendor.lastAssessmentAt,
    next_review_at: vendor.nextReviewAt,
    review_frequency: vendor.reviewFrequency,
    overall_risk: vendor.overallRisk,
    notes: vendor.notes,
    created_at: vendor.createdAt,
    updated_at: vendor.updatedAt,
    deleted_at: vendor.deletedAt,
  };
}

export function vendorFromRow(row: Row): Vendor {
  return {
    id: text(row, "id"),
    organizationId: text(row, "organization_id"),
    name: text(row, "name"),
    website: text(row, "website"),
    service: text(row, "service"),
    category: text(row, "category") as Vendor["category"],
    businessOwner: text(row, "business_owner"),
    securityOwner: text(row, "security_owner"),
    criticality: text(row, "criticality") as Vendor["criticality"],
    criticalityJustification: text(row, "criticality_justification"),
    criticalityFactors: json(row, "criticality_factors", {
      sensitiveData: false,
      productionAccess: false,
      businessDependency: false,
      privilegedAccess: false,
      customerData: false,
      financialImpact: false,
    }),
    dataAccess: text(row, "data_access") as Vendor["dataAccess"],
    systemAccess: text(row, "system_access") as Vendor["systemAccess"],
    riskTier: (textOrNull(row, "risk_tier") as Vendor["riskTier"]) ?? null,
    inherent: json<Vendor["inherent"]>(row, "inherent", null),
    assessmentStatus: text(row, "assessment_status") as Vendor["assessmentStatus"],
    lastAssessmentAt: dateOnly(row, "last_assessment_at"),
    nextReviewAt: dateOnly(row, "next_review_at"),
    reviewFrequency: text(row, "review_frequency") as Vendor["reviewFrequency"],
    overallRisk: (textOrNull(row, "overall_risk") as Vendor["overallRisk"]) ?? null,
    notes: text(row, "notes"),
    createdAt: iso(row, "created_at"),
    updatedAt: iso(row, "updated_at"),
    deletedAt: isoOrNull(row, "deleted_at"),
  };
}

export function contactToRow(contact: VendorContact): Row {
  return {
    id: contact.id,
    organization_id: contact.organizationId,
    vendor_id: contact.vendorId,
    name: contact.name,
    title: contact.title,
    email: contact.email,
    contact_role: contact.contactRole,
    created_at: contact.createdAt,
    deleted_at: contact.deletedAt,
  };
}

export function contactFromRow(row: Row): VendorContact {
  return {
    id: text(row, "id"),
    organizationId: text(row, "organization_id"),
    vendorId: text(row, "vendor_id"),
    name: text(row, "name"),
    title: text(row, "title"),
    email: text(row, "email"),
    contactRole: text(row, "contact_role"),
    createdAt: iso(row, "created_at"),
    deletedAt: isoOrNull(row, "deleted_at"),
  };
}

export function assessmentToRow(assessment: Assessment): Row {
  return {
    id: assessment.id,
    organization_id: assessment.organizationId,
    vendor_id: assessment.vendorId,
    name: assessment.name,
    type: assessment.type,
    owner_id: assessment.ownerId,
    template_id: assessment.templateId,
    previous_assessment_id: assessment.previousAssessmentId,
    status: assessment.status,
    due_date: assessment.dueDate,
    inherent_risk: assessment.inherentRisk,
    inherent_score: assessment.inherentScore,
    inherent_override: assessment.inherentOverride,
    inherent_justification: assessment.inherentJustification,
    control_risk: assessment.controlRisk,
    control_score: assessment.controlScore,
    control_preliminary: assessment.controlPreliminary,
    residual_risk: assessment.residualRisk,
    residual_override: assessment.residualOverride,
    residual_justification: assessment.residualJustification,
    executive_summary: assessment.executiveSummary,
    analyst_notes: assessment.analystNotes,
    submitted_at: assessment.submittedAt,
    created_at: assessment.createdAt,
    updated_at: assessment.updatedAt,
    deleted_at: assessment.deletedAt,
  };
}

export function assessmentFromRow(row: Row): Assessment {
  return {
    id: text(row, "id"),
    organizationId: text(row, "organization_id"),
    vendorId: text(row, "vendor_id"),
    name: text(row, "name"),
    type: text(row, "type") as Assessment["type"],
    ownerId: text(row, "owner_id"),
    templateId: text(row, "template_id"),
    previousAssessmentId: textOrNull(row, "previous_assessment_id"),
    status: text(row, "status") as Assessment["status"],
    dueDate: text(row, "due_date").slice(0, 10),
    inherentRisk: text(row, "inherent_risk") as Assessment["inherentRisk"],
    inherentScore: num(row, "inherent_score"),
    inherentOverride: (textOrNull(row, "inherent_override") as Assessment["inherentOverride"]) ?? null,
    inherentJustification: text(row, "inherent_justification"),
    controlRisk: text(row, "control_risk") as Assessment["controlRisk"],
    controlScore: num(row, "control_score"),
    controlPreliminary: bool(row, "control_preliminary"),
    residualRisk: text(row, "residual_risk") as Assessment["residualRisk"],
    residualOverride: (textOrNull(row, "residual_override") as Assessment["residualOverride"]) ?? null,
    residualJustification: text(row, "residual_justification"),
    executiveSummary: text(row, "executive_summary"),
    analystNotes: text(row, "analyst_notes"),
    submittedAt: isoOrNull(row, "submitted_at"),
    createdAt: iso(row, "created_at"),
    updatedAt: iso(row, "updated_at"),
    deletedAt: isoOrNull(row, "deleted_at"),
  };
}

export function templateToRow(template: QuestionnaireTemplate): Row {
  return {
    id: template.id,
    organization_id: template.organizationId,
    name: template.name,
    description: template.description,
    builtin_key: template.builtinKey,
    archived_at: template.archivedAt,
    created_at: template.createdAt,
    updated_at: template.updatedAt,
  };
}

export function templateFromRow(row: Row): QuestionnaireTemplate {
  return {
    id: text(row, "id"),
    organizationId: text(row, "organization_id"),
    name: text(row, "name"),
    description: text(row, "description"),
    builtinKey: textOrNull(row, "builtin_key"),
    archivedAt: isoOrNull(row, "archived_at"),
    createdAt: iso(row, "created_at"),
    updatedAt: iso(row, "updated_at"),
  };
}

export function sectionToRow(section: QuestionnaireSection): Row {
  return {
    id: section.id,
    organization_id: section.organizationId,
    template_id: section.templateId,
    title: section.title,
    sort_order: section.sortOrder,
  };
}

export function sectionFromRow(row: Row): QuestionnaireSection {
  return {
    id: text(row, "id"),
    organizationId: text(row, "organization_id"),
    templateId: text(row, "template_id"),
    title: text(row, "title"),
    sortOrder: num(row, "sort_order"),
  };
}

export function questionToRow(question: Question): Row {
  return {
    id: question.id,
    organization_id: question.organizationId,
    template_id: question.templateId,
    section_id: question.sectionId,
    prompt: question.prompt,
    help_text: question.helpText,
    type: question.type,
    options: question.options,
    risk_weight: question.riskWeight,
    evidence_required: question.evidenceRequired,
    guidance: question.guidance,
    control_ref: question.controlRef,
    mappings: question.mappings,
    sort_order: question.sortOrder,
    archived_at: question.archivedAt,
  };
}

export function questionFromRow(row: Row): Question {
  return {
    id: text(row, "id"),
    organizationId: text(row, "organization_id"),
    templateId: text(row, "template_id"),
    sectionId: text(row, "section_id"),
    prompt: text(row, "prompt"),
    helpText: text(row, "help_text"),
    type: text(row, "type") as Question["type"],
    options: json<string[]>(row, "options", []),
    riskWeight: num(row, "risk_weight"),
    evidenceRequired: bool(row, "evidence_required"),
    guidance: text(row, "guidance"),
    controlRef: text(row, "control_ref"),
    mappings: json(row, "mappings", []),
    sortOrder: num(row, "sort_order"),
    archivedAt: isoOrNull(row, "archived_at"),
  };
}

export function assessmentQuestionToRow(question: AssessmentQuestion): Row {
  return {
    id: question.id,
    organization_id: question.organizationId,
    assessment_id: question.assessmentId,
    source_question_id: question.sourceQuestionId,
    section_title: question.sectionTitle,
    prompt: question.prompt,
    help_text: question.helpText,
    type: question.type,
    options: question.options,
    risk_weight: question.riskWeight,
    evidence_required: question.evidenceRequired,
    guidance: question.guidance,
    control_ref: question.controlRef,
    mappings: question.mappings,
    sort_order: question.sortOrder,
  };
}

export function assessmentQuestionFromRow(row: Row): AssessmentQuestion {
  return {
    id: text(row, "id"),
    organizationId: text(row, "organization_id"),
    assessmentId: text(row, "assessment_id"),
    sourceQuestionId: textOrNull(row, "source_question_id"),
    sectionTitle: text(row, "section_title"),
    prompt: text(row, "prompt"),
    helpText: text(row, "help_text"),
    type: text(row, "type") as AssessmentQuestion["type"],
    options: json<string[]>(row, "options", []),
    riskWeight: num(row, "risk_weight"),
    evidenceRequired: bool(row, "evidence_required"),
    guidance: text(row, "guidance"),
    controlRef: text(row, "control_ref"),
    mappings: json(row, "mappings", []),
    sortOrder: num(row, "sort_order"),
  };
}

export function responseToRow(response: ResponseRecord): Row {
  return {
    id: response.id,
    organization_id: response.organizationId,
    assessment_id: response.assessmentId,
    assessment_question_id: response.assessmentQuestionId,
    answer_boolean: response.answerBoolean,
    answer_na: response.answerNa,
    answer_text: response.answerText,
    answer_choice: response.answerChoice,
    document_ids: response.documentIds,
    analyst_result: response.analystResult,
    analyst_notes: response.analystNotes,
    reviewed_by: response.reviewedBy,
    reviewed_at: response.reviewedAt,
    updated_at: response.updatedAt,
  };
}

export function responseFromRow(row: Row): ResponseRecord {
  const answer = row.answer_boolean;
  return {
    id: text(row, "id"),
    organizationId: text(row, "organization_id"),
    assessmentId: text(row, "assessment_id"),
    assessmentQuestionId: text(row, "assessment_question_id"),
    answerBoolean: typeof answer === "boolean" ? answer : null,
    answerNa: bool(row, "answer_na"),
    answerText: text(row, "answer_text"),
    answerChoice: text(row, "answer_choice"),
    documentIds: json<string[]>(row, "document_ids", []),
    analystResult: text(row, "analyst_result") as ResponseRecord["analystResult"],
    analystNotes: text(row, "analyst_notes"),
    reviewedBy: textOrNull(row, "reviewed_by"),
    reviewedAt: isoOrNull(row, "reviewed_at"),
    updatedAt: iso(row, "updated_at"),
  };
}

export function documentToRow(document: EvidenceDocument): Row {
  return {
    id: document.id,
    organization_id: document.organizationId,
    vendor_id: document.vendorId,
    assessment_id: document.assessmentId,
    assessment_question_id: document.assessmentQuestionId,
    finding_id: document.findingId,
    file_name: document.fileName,
    storage_path: document.storagePath,
    content_type: document.contentType,
    size_bytes: document.sizeBytes,
    document_type: document.documentType,
    description: document.description,
    review_status: document.reviewStatus,
    uploaded_by_id: document.uploadedById,
    uploaded_by_label: document.uploadedByLabel,
    uploaded_at: document.uploadedAt,
    soc2: document.soc2,
    deleted_at: document.deletedAt,
  };
}

export function documentFromRow(row: Row): EvidenceDocument {
  return {
    id: text(row, "id"),
    organizationId: text(row, "organization_id"),
    vendorId: text(row, "vendor_id"),
    assessmentId: textOrNull(row, "assessment_id"),
    assessmentQuestionId: textOrNull(row, "assessment_question_id"),
    findingId: textOrNull(row, "finding_id"),
    fileName: text(row, "file_name"),
    storagePath: text(row, "storage_path"),
    contentType: text(row, "content_type"),
    sizeBytes: num(row, "size_bytes"),
    documentType: text(row, "document_type") as EvidenceDocument["documentType"],
    description: text(row, "description"),
    reviewStatus: text(row, "review_status") as EvidenceDocument["reviewStatus"],
    uploadedById: textOrNull(row, "uploaded_by_id"),
    uploadedByLabel: text(row, "uploaded_by_label"),
    uploadedAt: iso(row, "uploaded_at"),
    soc2: json(row, "soc2", null),
    deletedAt: isoOrNull(row, "deleted_at"),
  };
}

export function findingToRow(finding: Finding): Row {
  return {
    id: finding.id,
    organization_id: finding.organizationId,
    vendor_id: finding.vendorId,
    assessment_id: finding.assessmentId,
    assessment_question_id: finding.assessmentQuestionId,
    reference: finding.reference,
    title: finding.title,
    description: finding.description,
    risk: finding.risk,
    recommendation: finding.recommendation,
    vendor_response: finding.vendorResponse,
    owner_id: finding.ownerId,
    status: finding.status,
    target_date: finding.targetDate,
    closure_date: finding.closureDate,
    closure_notes: finding.closureNotes,
    closure_document_id: finding.closureDocumentId,
    created_at: finding.createdAt,
    updated_at: finding.updatedAt,
    deleted_at: finding.deletedAt,
  };
}

export function findingFromRow(row: Row): Finding {
  return {
    id: text(row, "id"),
    organizationId: text(row, "organization_id"),
    vendorId: text(row, "vendor_id"),
    assessmentId: textOrNull(row, "assessment_id"),
    assessmentQuestionId: textOrNull(row, "assessment_question_id"),
    reference: text(row, "reference"),
    title: text(row, "title"),
    description: text(row, "description"),
    risk: text(row, "risk") as Finding["risk"],
    recommendation: text(row, "recommendation"),
    vendorResponse: text(row, "vendor_response"),
    ownerId: textOrNull(row, "owner_id"),
    status: text(row, "status") as Finding["status"],
    targetDate: dateOnly(row, "target_date"),
    closureDate: dateOnly(row, "closure_date"),
    closureNotes: text(row, "closure_notes"),
    closureDocumentId: textOrNull(row, "closure_document_id"),
    createdAt: iso(row, "created_at"),
    updatedAt: iso(row, "updated_at"),
    deletedAt: isoOrNull(row, "deleted_at"),
  };
}

export function remediationToRow(action: RemediationAction): Row {
  return {
    id: action.id,
    organization_id: action.organizationId,
    finding_id: action.findingId,
    required_action: action.requiredAction,
    vendor_response: action.vendorResponse,
    target_date: action.targetDate,
    status: action.status,
    closure_document_id: action.closureDocumentId,
    analyst_verification: action.analystVerification,
    verified_by: action.verifiedBy,
    verified_at: action.verifiedAt,
    created_at: action.createdAt,
    updated_at: action.updatedAt,
  };
}

export function remediationFromRow(row: Row): RemediationAction {
  return {
    id: text(row, "id"),
    organizationId: text(row, "organization_id"),
    findingId: text(row, "finding_id"),
    requiredAction: text(row, "required_action"),
    vendorResponse: text(row, "vendor_response"),
    targetDate: dateOnly(row, "target_date"),
    status: text(row, "status") as RemediationAction["status"],
    closureDocumentId: textOrNull(row, "closure_document_id"),
    analystVerification: text(row, "analyst_verification"),
    verifiedBy: textOrNull(row, "verified_by"),
    verifiedAt: isoOrNull(row, "verified_at"),
    createdAt: iso(row, "created_at"),
    updatedAt: iso(row, "updated_at"),
  };
}

export function acceptanceToRow(acceptance: RiskAcceptance): Row {
  return {
    id: acceptance.id,
    organization_id: acceptance.organizationId,
    finding_id: acceptance.findingId,
    risk: acceptance.risk,
    business_justification: acceptance.businessJustification,
    compensating_controls: acceptance.compensatingControls,
    approved_by: acceptance.approvedBy,
    approval_date: acceptance.approvalDate,
    expires_on: acceptance.expiresOn,
    created_at: acceptance.createdAt,
  };
}

export function acceptanceFromRow(row: Row): RiskAcceptance {
  return {
    id: text(row, "id"),
    organizationId: text(row, "organization_id"),
    findingId: text(row, "finding_id"),
    risk: text(row, "risk") as RiskAcceptance["risk"],
    businessJustification: text(row, "business_justification"),
    compensatingControls: text(row, "compensating_controls"),
    approvedBy: text(row, "approved_by"),
    approvalDate: text(row, "approval_date").slice(0, 10),
    expiresOn: text(row, "expires_on").slice(0, 10),
    createdAt: iso(row, "created_at"),
  };
}

export function decisionToRow(decision: AssessmentDecision): Row {
  return {
    id: decision.id,
    organization_id: decision.organizationId,
    assessment_id: decision.assessmentId,
    decision: decision.decision,
    notes: decision.notes,
    reviewer_id: decision.reviewerId,
    decided_at: decision.decidedAt,
    requires_secondary_approval: decision.requiresSecondaryApproval,
    secondary_approver_id: decision.secondaryApproverId,
    secondary_approved_at: decision.secondaryApprovedAt,
    pending: decision.pending,
  };
}

export function decisionFromRow(row: Row): AssessmentDecision {
  return {
    id: text(row, "id"),
    organizationId: text(row, "organization_id"),
    assessmentId: text(row, "assessment_id"),
    decision: text(row, "decision") as AssessmentDecision["decision"],
    notes: text(row, "notes"),
    reviewerId: text(row, "reviewer_id"),
    decidedAt: iso(row, "decided_at"),
    requiresSecondaryApproval: bool(row, "requires_secondary_approval"),
    secondaryApproverId: textOrNull(row, "secondary_approver_id"),
    secondaryApprovedAt: isoOrNull(row, "secondary_approved_at"),
    pending: bool(row, "pending"),
  };
}

export function notificationToRow(notification: AppNotification): Row {
  return {
    id: notification.id,
    organization_id: notification.organizationId,
    user_id: notification.userId,
    kind: notification.kind,
    dedupe_key: notification.dedupeKey,
    title: notification.title,
    body: notification.body,
    href: notification.href,
    read_at: notification.readAt,
    created_at: notification.createdAt,
  };
}

export function notificationFromRow(row: Row): AppNotification {
  return {
    id: text(row, "id"),
    organizationId: text(row, "organization_id"),
    userId: text(row, "user_id"),
    kind: text(row, "kind"),
    dedupeKey: text(row, "dedupe_key"),
    title: text(row, "title"),
    body: text(row, "body"),
    href: text(row, "href"),
    readAt: isoOrNull(row, "read_at"),
    createdAt: iso(row, "created_at"),
  };
}

export function auditToRow(event: AuditEvent): Row {
  return {
    id: event.id,
    organization_id: event.organizationId,
    actor_id: event.actorId,
    actor_label: event.actorLabel,
    action: event.action,
    entity_type: event.entityType,
    entity_id: event.entityId,
    summary: event.summary,
    before: event.before,
    after: event.after,
    created_at: event.createdAt,
  };
}

export function auditFromRow(row: Row): AuditEvent {
  return {
    id: text(row, "id"),
    organizationId: text(row, "organization_id"),
    actorId: textOrNull(row, "actor_id"),
    actorLabel: text(row, "actor_label"),
    action: text(row, "action"),
    entityType: text(row, "entity_type"),
    entityId: text(row, "entity_id"),
    summary: text(row, "summary"),
    before: row.before ?? null,
    after: row.after ?? null,
    createdAt: iso(row, "created_at"),
  };
}

export function invitationToRow(invitation: Invitation): Row {
  return {
    id: invitation.id,
    organization_id: invitation.organizationId,
    assessment_id: invitation.assessmentId,
    email: invitation.email,
    token_hash: invitation.tokenHash,
    expires_at: invitation.expiresAt,
    revoked_at: invitation.revokedAt,
    created_by: invitation.createdBy,
    created_at: invitation.createdAt,
    last_access_at: invitation.lastAccessAt,
  };
}

export function invitationFromRow(row: Row): Invitation {
  return {
    id: text(row, "id"),
    organizationId: text(row, "organization_id"),
    assessmentId: text(row, "assessment_id"),
    email: text(row, "email"),
    tokenHash: text(row, "token_hash"),
    expiresAt: iso(row, "expires_at"),
    revokedAt: isoOrNull(row, "revoked_at"),
    createdBy: text(row, "created_by"),
    createdAt: iso(row, "created_at"),
    lastAccessAt: isoOrNull(row, "last_access_at"),
  };
}

interface Binding {
  table: string;
  key: keyof Database;
  toRow: (row: { id: string }) => Row;
  fromRow: (row: Row) => { id: string };
}

function bind<T extends { id: string }>(
  table: string,
  key: keyof Database,
  toRow: (row: T) => Row,
  fromRow: (row: Row) => T,
): Binding {
  return {
    table,
    key,
    toRow: (row) => toRow(row as T),
    fromRow,
  };
}

export const TABLE_BINDINGS: Binding[] = [
  bind("profiles", "users", userToRow, userFromRow),
  bind("organizations", "organizations", organizationToRow, organizationFromRow),
  bind("memberships", "members", membershipToRow, membershipFromRow),
  bind("org_invites", "invites", inviteToRow, inviteFromRow),
  bind("questionnaire_templates", "templates", templateToRow, templateFromRow),
  bind("questionnaire_sections", "sections", sectionToRow, sectionFromRow),
  bind("questions", "questions", questionToRow, questionFromRow),
  bind("vendors", "vendors", vendorToRow, vendorFromRow),
  bind("vendor_contacts", "contacts", contactToRow, contactFromRow),
  bind("assessments", "assessments", assessmentToRow, assessmentFromRow),
  bind("assessment_questions", "assessmentQuestions", assessmentQuestionToRow, assessmentQuestionFromRow),
  bind("responses", "responses", responseToRow, responseFromRow),
  bind("documents", "documents", documentToRow, documentFromRow),
  bind("findings", "findings", findingToRow, findingFromRow),
  bind("remediations", "remediations", remediationToRow, remediationFromRow),
  bind("risk_acceptances", "riskAcceptances", acceptanceToRow, acceptanceFromRow),
  bind("assessment_decisions", "decisions", decisionToRow, decisionFromRow),
  bind("invitations", "invitations", invitationToRow, invitationFromRow),
  bind("notifications", "notifications", notificationToRow, notificationFromRow),
  bind("audit_events", "auditEvents", auditToRow, auditFromRow),
];

export function readRows<T>(key: keyof Database, rows: Row[]): T[] {
  const binding = TABLE_BINDINGS.find((item) => item.key === key);
  if (!binding) return [];
  return rows.map((row) => binding.fromRow(row) as T);
}
