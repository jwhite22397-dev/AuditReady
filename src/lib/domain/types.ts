export const ROLES = ["owner", "admin", "analyst", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const CRITICALITIES = ["low", "moderate", "high", "critical"] as const;
export type Criticality = (typeof CRITICALITIES)[number];

export const RISK_LEVELS = ["low", "moderate", "high", "critical"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const VENDOR_CATEGORIES = [
  "saas",
  "cloud_infrastructure",
  "professional_services",
  "financial",
  "hr",
  "marketing",
  "security",
  "other",
] as const;
export type VendorCategory = (typeof VENDOR_CATEGORIES)[number];

export const DATA_ACCESS_LEVELS = [
  "none",
  "internal",
  "confidential",
  "customer_pii",
  "payment",
  "regulated",
] as const;
export type DataAccess = (typeof DATA_ACCESS_LEVELS)[number];

export const SYSTEM_ACCESS_LEVELS = ["none", "read", "write", "production", "privileged"] as const;
export type SystemAccess = (typeof SYSTEM_ACCESS_LEVELS)[number];

export const REVIEW_FREQUENCIES = ["quarterly", "semiannual", "annual", "biennial"] as const;
export type ReviewFrequency = (typeof REVIEW_FREQUENCIES)[number];

export const ASSESSMENT_STATUSES = [
  "draft",
  "questionnaire_sent",
  "vendor_responded",
  "in_review",
  "remediation",
  "approved",
  "approved_with_conditions",
  "rejected",
  "closed",
] as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];

export const ASSESSMENT_TYPES = ["initial", "reassessment", "incident", "ad_hoc"] as const;
export type AssessmentType = (typeof ASSESSMENT_TYPES)[number];

export const QUESTION_TYPES = ["yes_no", "yes_no_na", "text", "multiple_choice", "file_request"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const REVIEW_RESULTS = ["pass", "partial", "fail", "na", "not_reviewed"] as const;
export type ReviewResult = (typeof REVIEW_RESULTS)[number];

export const FINDING_STATUSES = [
  "open",
  "vendor_response",
  "remediation",
  "risk_accepted",
  "closed",
] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

export const DECISIONS = [
  "approved",
  "approved_with_conditions",
  "rejected",
  "requires_remediation",
] as const;
export type DecisionOutcome = (typeof DECISIONS)[number];

export const DOCUMENT_TYPES = [
  "soc2_type_ii",
  "soc2_type_i",
  "iso_27001",
  "penetration_test",
  "pci_aoc",
  "bcp_dr",
  "privacy_policy",
  "information_security_policy",
  "cyber_insurance",
  "sig",
  "other",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_REVIEW_STATUSES = ["pending", "accepted", "rejected", "needs_update"] as const;
export type DocumentReviewStatus = (typeof DOCUMENT_REVIEW_STATUSES)[number];

export const PLANS = ["starter", "pro", "business"] as const;
export type Plan = (typeof PLANS)[number];

export const FRAMEWORKS = ["SOC 2", "ISO 27001", "NIST CSF", "CIS Controls", "PCI DSS", "HIPAA"] as const;
export type FrameworkName = (typeof FRAMEWORKS)[number];

export interface FrameworkMapping {
  framework: FrameworkName;
  reference: string;
}

export interface CriticalityFactors {
  sensitiveData: boolean;
  productionAccess: boolean;
  businessDependency: boolean;
  privilegedAccess: boolean;
  customerData: boolean;
  financialImpact: boolean;
}

export const INHERENT_FACTORS = [
  { key: "customerData", label: "Will the vendor process customer data?", weight: 2 },
  { key: "pii", label: "Will the vendor process personal information?", weight: 2 },
  { key: "payment", label: "Will the vendor process payment information?", weight: 3 },
  { key: "productionAccess", label: "Will the vendor have production access?", weight: 3 },
  { key: "privilegedAccess", label: "Will the vendor have privileged access?", weight: 3 },
  { key: "operationallyCritical", label: "Is the vendor operationally critical?", weight: 2 },
  { key: "hostsData", label: "Will the vendor host company data?", weight: 2 },
  { key: "subprocessors", label: "Does the vendor use subprocessors?", weight: 1 },
] as const;

export type InherentFactorKey = (typeof INHERENT_FACTORS)[number]["key"];
export type InherentAnswers = Record<InherentFactorKey, boolean>;

export interface InherentAssessment {
  answers: InherentAnswers;
  score: number;
  recommended: RiskLevel;
  override: RiskLevel | null;
  overrideJustification: string;
  assessedAt: string;
  assessedBy: string;
}

export interface Soc2Review {
  reportType: "type_i" | "type_ii" | "";
  auditFirm: string;
  periodStart: string;
  periodEnd: string;
  opinion: "unqualified" | "qualified" | "adverse" | "disclaimer" | "";
  exceptionsNoted: boolean | null;
  subserviceOrganizations: string;
  complementaryUserEntityControls: string;
  coversSecurity: boolean;
  coversAvailability: boolean;
  coversConfidentiality: boolean;
  coversProcessingIntegrity: boolean;
  coversPrivacy: boolean;
  analystNotes: string;
  reviewStatus: "not_started" | "in_review" | "complete";
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  jobTitle: string;
  passwordHash: string | null;
  passwordSalt: string | null;
  createdAt: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: Plan;
  createdAt: string;
  deletedAt: string | null;
}

export interface Membership {
  id: string;
  organizationId: string;
  userId: string;
  role: Role;
  createdAt: string;
  deletedAt: string | null;
}

export interface OrgInvite {
  id: string;
  organizationId: string;
  email: string;
  role: Exclude<Role, "owner">;
  codeHash: string;
  createdBy: string;
  createdAt: string;
  acceptedAt: string | null;
  expiresAt: string;
}

export interface Vendor {
  id: string;
  organizationId: string;
  name: string;
  website: string;
  service: string;
  category: VendorCategory;
  businessOwner: string;
  securityOwner: string;
  criticality: Criticality;
  criticalityJustification: string;
  criticalityFactors: CriticalityFactors;
  dataAccess: DataAccess;
  systemAccess: SystemAccess;
  riskTier: RiskLevel | null;
  inherent: InherentAssessment | null;
  assessmentStatus: AssessmentStatus | "not_started";
  lastAssessmentAt: string | null;
  nextReviewAt: string | null;
  reviewFrequency: ReviewFrequency;
  overallRisk: RiskLevel | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface VendorContact {
  id: string;
  organizationId: string;
  vendorId: string;
  name: string;
  title: string;
  email: string;
  contactRole: string;
  createdAt: string;
  deletedAt: string | null;
}

export interface Assessment {
  id: string;
  organizationId: string;
  vendorId: string;
  name: string;
  type: AssessmentType;
  ownerId: string;
  templateId: string;
  previousAssessmentId: string | null;
  status: AssessmentStatus;
  dueDate: string;
  inherentRisk: RiskLevel;
  inherentScore: number;
  inherentOverride: RiskLevel | null;
  inherentJustification: string;
  controlRisk: RiskLevel;
  controlScore: number;
  controlPreliminary: boolean;
  residualRisk: RiskLevel;
  residualOverride: RiskLevel | null;
  residualJustification: string;
  executiveSummary: string;
  analystNotes: string;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface QuestionnaireTemplate {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  builtinKey: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionnaireSection {
  id: string;
  organizationId: string;
  templateId: string;
  title: string;
  sortOrder: number;
}

export interface Question {
  id: string;
  organizationId: string;
  templateId: string;
  sectionId: string;
  prompt: string;
  helpText: string;
  type: QuestionType;
  options: string[];
  riskWeight: number;
  evidenceRequired: boolean;
  guidance: string;
  controlRef: string;
  mappings: FrameworkMapping[];
  sortOrder: number;
  archivedAt: string | null;
}

export interface AssessmentQuestion {
  id: string;
  organizationId: string;
  assessmentId: string;
  sourceQuestionId: string | null;
  sectionTitle: string;
  prompt: string;
  helpText: string;
  type: QuestionType;
  options: string[];
  riskWeight: number;
  evidenceRequired: boolean;
  guidance: string;
  controlRef: string;
  mappings: FrameworkMapping[];
  sortOrder: number;
}

export interface ResponseRecord {
  id: string;
  organizationId: string;
  assessmentId: string;
  assessmentQuestionId: string;
  answerBoolean: boolean | null;
  answerNa: boolean;
  answerText: string;
  answerChoice: string;
  documentIds: string[];
  analystResult: ReviewResult;
  analystNotes: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  updatedAt: string;
}

export interface EvidenceDocument {
  id: string;
  organizationId: string;
  vendorId: string;
  assessmentId: string | null;
  assessmentQuestionId: string | null;
  findingId: string | null;
  fileName: string;
  storagePath: string;
  contentType: string;
  sizeBytes: number;
  documentType: DocumentType;
  description: string;
  reviewStatus: DocumentReviewStatus;
  uploadedById: string | null;
  uploadedByLabel: string;
  uploadedAt: string;
  soc2: Soc2Review | null;
  deletedAt: string | null;
}

export interface Finding {
  id: string;
  organizationId: string;
  vendorId: string;
  assessmentId: string | null;
  assessmentQuestionId: string | null;
  reference: string;
  title: string;
  description: string;
  risk: RiskLevel;
  recommendation: string;
  vendorResponse: string;
  ownerId: string | null;
  status: FindingStatus;
  targetDate: string | null;
  closureDate: string | null;
  closureNotes: string;
  closureDocumentId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type RemediationStatus = "open" | "in_progress" | "ready_for_verification" | "verified";

export interface RemediationAction {
  id: string;
  organizationId: string;
  findingId: string;
  requiredAction: string;
  vendorResponse: string;
  targetDate: string | null;
  status: RemediationStatus;
  closureDocumentId: string | null;
  analystVerification: string;
  verifiedBy: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RiskAcceptance {
  id: string;
  organizationId: string;
  findingId: string;
  risk: RiskLevel;
  businessJustification: string;
  compensatingControls: string;
  approvedBy: string;
  approvalDate: string;
  expiresOn: string;
  createdAt: string;
}

export interface AssessmentDecision {
  id: string;
  organizationId: string;
  assessmentId: string;
  decision: DecisionOutcome;
  notes: string;
  reviewerId: string;
  decidedAt: string;
  requiresSecondaryApproval: boolean;
  secondaryApproverId: string | null;
  secondaryApprovedAt: string | null;
  pending: boolean;
}

export interface AppNotification {
  id: string;
  organizationId: string;
  userId: string;
  kind: string;
  dedupeKey: string;
  title: string;
  body: string;
  href: string;
  readAt: string | null;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  organizationId: string;
  actorId: string | null;
  actorLabel: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  before: unknown;
  after: unknown;
  createdAt: string;
}

export interface Invitation {
  id: string;
  organizationId: string;
  assessmentId: string;
  email: string;
  tokenHash: string;
  expiresAt: string;
  revokedAt: string | null;
  createdBy: string;
  createdAt: string;
  lastAccessAt: string | null;
}

export interface Database {
  users: User[];
  organizations: Organization[];
  members: Membership[];
  invites: OrgInvite[];
  vendors: Vendor[];
  contacts: VendorContact[];
  assessments: Assessment[];
  templates: QuestionnaireTemplate[];
  sections: QuestionnaireSection[];
  questions: Question[];
  assessmentQuestions: AssessmentQuestion[];
  responses: ResponseRecord[];
  documents: EvidenceDocument[];
  findings: Finding[];
  remediations: RemediationAction[];
  riskAcceptances: RiskAcceptance[];
  decisions: AssessmentDecision[];
  notifications: AppNotification[];
  auditEvents: AuditEvent[];
  invitations: Invitation[];
}

export interface Session {
  userId: string;
  organizationId: string | null;
  role: Role | null;
}

export function emptyDatabase(): Database {
  return {
    users: [],
    organizations: [],
    members: [],
    invites: [],
    vendors: [],
    contacts: [],
    assessments: [],
    templates: [],
    sections: [],
    questions: [],
    assessmentQuestions: [],
    responses: [],
    documents: [],
    findings: [],
    remediations: [],
    riskAcceptances: [],
    decisions: [],
    notifications: [],
    auditEvents: [],
    invitations: [],
  };
}

export function emptyCriticalityFactors(): CriticalityFactors {
  return {
    sensitiveData: false,
    productionAccess: false,
    businessDependency: false,
    privilegedAccess: false,
    customerData: false,
    financialImpact: false,
  };
}

export function emptySoc2Review(): Soc2Review {
  return {
    reportType: "",
    auditFirm: "",
    periodStart: "",
    periodEnd: "",
    opinion: "",
    exceptionsNoted: null,
    subserviceOrganizations: "",
    complementaryUserEntityControls: "",
    coversSecurity: false,
    coversAvailability: false,
    coversConfidentiality: false,
    coversProcessingIntegrity: false,
    coversPrivacy: false,
    analystNotes: "",
    reviewStatus: "not_started",
  };
}
