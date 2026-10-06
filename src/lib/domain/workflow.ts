import type { AssessmentStatus, DecisionOutcome, FindingStatus } from "./types";

const ASSESSMENT_TRANSITIONS: Record<AssessmentStatus, readonly AssessmentStatus[]> = {
  draft: ["questionnaire_sent", "in_review", "closed"],
  questionnaire_sent: ["vendor_responded", "in_review", "draft", "closed"],
  vendor_responded: ["in_review", "closed"],
  in_review: ["remediation", "approved", "approved_with_conditions", "rejected", "closed"],
  remediation: ["in_review", "approved", "approved_with_conditions", "rejected", "closed"],
  approved: ["closed"],
  approved_with_conditions: ["closed", "remediation"],
  rejected: ["closed"],
  closed: [],
};

const FINDING_TRANSITIONS: Record<FindingStatus, readonly FindingStatus[]> = {
  open: ["vendor_response", "remediation", "closed"],
  vendor_response: ["remediation", "open", "closed"],
  remediation: ["closed", "open", "vendor_response"],
  risk_accepted: ["open", "closed"],
  closed: ["open"],
};

export function canTransitionAssessment(from: AssessmentStatus, to: AssessmentStatus): boolean {
  if (from === to) return true;
  return ASSESSMENT_TRANSITIONS[from].includes(to);
}

export function nextAssessmentStatuses(from: AssessmentStatus): AssessmentStatus[] {
  return [...ASSESSMENT_TRANSITIONS[from]];
}

export function canTransitionFinding(from: FindingStatus, to: FindingStatus): boolean {
  if (from === to) return true;
  return FINDING_TRANSITIONS[from].includes(to);
}

export function decisionToStatus(decision: DecisionOutcome): AssessmentStatus {
  if (decision === "approved") return "approved";
  if (decision === "approved_with_conditions") return "approved_with_conditions";
  if (decision === "rejected") return "rejected";
  return "remediation";
}

export function isTerminalAssessment(status: AssessmentStatus): boolean {
  return status === "closed";
}

export function isOpenFinding(status: FindingStatus): boolean {
  return status !== "closed";
}

export function isActiveAssessment(status: AssessmentStatus): boolean {
  return !["approved", "approved_with_conditions", "rejected", "closed"].includes(status);
}
