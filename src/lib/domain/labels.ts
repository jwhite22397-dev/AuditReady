import type {
  AssessmentStatus,
  AssessmentType,
  Criticality,
  DataAccess,
  DecisionOutcome,
  DocumentReviewStatus,
  DocumentType,
  FindingStatus,
  QuestionType,
  ReviewFrequency,
  ReviewResult,
  RiskLevel,
  Role,
  SystemAccess,
  VendorCategory,
} from "./types";

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  analyst: "Analyst",
  viewer: "Viewer",
};

export const RISK_LABEL: Record<RiskLevel, string> = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
  critical: "Critical",
};

export const CRITICALITY_LABEL: Record<Criticality, string> = RISK_LABEL;

export const CATEGORY_LABEL: Record<VendorCategory, string> = {
  saas: "SaaS",
  cloud_infrastructure: "Cloud infrastructure",
  professional_services: "Professional services",
  financial: "Financial",
  hr: "HR",
  marketing: "Marketing",
  security: "Security",
  other: "Other",
};

export const DATA_ACCESS_LABEL: Record<DataAccess, string> = {
  none: "No company data",
  internal: "Internal data",
  confidential: "Confidential data",
  customer_pii: "Customer personal data",
  payment: "Payment data",
  regulated: "Regulated data",
};

export const SYSTEM_ACCESS_LABEL: Record<SystemAccess, string> = {
  none: "No system access",
  read: "Read access",
  write: "Write access",
  production: "Production access",
  privileged: "Privileged access",
};

export const FREQUENCY_LABEL: Record<ReviewFrequency, string> = {
  quarterly: "Quarterly",
  semiannual: "Every six months",
  annual: "Annual",
  biennial: "Every two years",
};

export const ASSESSMENT_STATUS_LABEL: Record<AssessmentStatus, string> = {
  draft: "Draft",
  questionnaire_sent: "Questionnaire sent",
  vendor_responded: "Vendor responded",
  in_review: "In review",
  remediation: "Remediation",
  approved: "Approved",
  approved_with_conditions: "Approved with conditions",
  rejected: "Rejected",
  closed: "Closed",
};

export const ASSESSMENT_TYPE_LABEL: Record<AssessmentType, string> = {
  initial: "Initial",
  reassessment: "Reassessment",
  incident: "Incident",
  ad_hoc: "Ad hoc",
};

export const REVIEW_LABEL: Record<ReviewResult, string> = {
  pass: "Pass",
  partial: "Partial",
  fail: "Fail",
  na: "N/A",
  not_reviewed: "Not reviewed",
};

export const FINDING_STATUS_LABEL: Record<FindingStatus, string> = {
  open: "Open",
  vendor_response: "Vendor response",
  remediation: "Remediation",
  risk_accepted: "Risk accepted",
  closed: "Closed",
};

export const DECISION_LABEL: Record<DecisionOutcome, string> = {
  approved: "Approved",
  approved_with_conditions: "Approved with conditions",
  rejected: "Rejected",
  requires_remediation: "Requires remediation",
};

export const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  soc2_type_ii: "SOC 2 Type II",
  soc2_type_i: "SOC 2 Type I",
  iso_27001: "ISO 27001 certificate",
  penetration_test: "Penetration test",
  pci_aoc: "PCI AOC",
  bcp_dr: "BCP/DR document",
  privacy_policy: "Privacy policy",
  information_security_policy: "Information security policy",
  cyber_insurance: "Cyber insurance",
  sig: "SIG",
  other: "Other",
};

export const DOCUMENT_REVIEW_LABEL: Record<DocumentReviewStatus, string> = {
  pending: "Pending review",
  accepted: "Accepted",
  rejected: "Rejected",
  needs_update: "Needs update",
};

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  yes_no: "Yes / No",
  yes_no_na: "Yes / No / N/A",
  text: "Text",
  multiple_choice: "Multiple choice",
  file_request: "File request",
};

export function humanize(value: string): string {
  return value.replaceAll("_", " ");
}
