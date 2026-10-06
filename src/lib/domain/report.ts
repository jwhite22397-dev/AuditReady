import type { Criticality, DecisionOutcome, RiskLevel } from "./types";

export interface ReportFinding {
  reference: string;
  title: string;
  risk: RiskLevel;
  status: string;
  description: string;
  recommendation: string;
}

export interface SummaryInput {
  vendorName: string;
  criticality: Criticality;
  service: string;
  dataAccessLabel: string;
  systemAccessLabel: string;
  findings: ReportFinding[];
  decision: DecisionOutcome | null;
  pendingApproval: boolean;
  residual: RiskLevel;
}

const CRITICALITY_LABEL: Record<Criticality, string> = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
  critical: "Critical",
};

const DECISION_PHRASE: Record<DecisionOutcome, string> = {
  approved: "Approved",
  approved_with_conditions: "Approved With Conditions",
  rejected: "Rejected",
  requires_remediation: "placed in remediation",
};

export function findingPhrase(findings: ReportFinding[]): string {
  const open = findings.filter((finding) => finding.status !== "closed");
  if (open.length === 0) return "The assessment did not leave open findings.";
  const counts = new Map<RiskLevel, number>();
  for (const finding of open) counts.set(finding.risk, (counts.get(finding.risk) ?? 0) + 1);
  const parts = (["critical", "high", "moderate", "low"] as RiskLevel[])
    .filter((level) => counts.has(level))
    .map((level) => {
      const count = counts.get(level) ?? 0;
      return `${count} ${level}-risk finding${count === 1 ? "" : "s"}`;
    });
  const titles = open
    .slice(0, 2)
    .map((finding) => finding.title.replace(/\.$/, ""))
    .join(" and ");
  return `The assessment identified ${parts.join(" and ")}${titles ? ` related to ${titles}` : ""}.`;
}

export function buildExecutiveSummary(input: SummaryInput): string {
  const exposure = [input.dataAccessLabel, input.systemAccessLabel].filter(Boolean).join(" and ");
  const because = exposure ? ` due to ${exposure}` : "";
  const decision = input.pendingApproval
    ? "A decision has been recorded and is waiting for additional approval."
    : input.decision
      ? `Based on the controls reviewed and the findings disposition, the vendor has been ${DECISION_PHRASE[input.decision]}.`
      : "A final decision has not been recorded.";
  return `${input.vendorName} was assessed as a ${CRITICALITY_LABEL[input.criticality]}-criticality vendor providing ${input.service}${because}. ${findingPhrase(input.findings)} Residual risk is ${input.residual}. ${decision}`;
}

export function decisionLabel(decision: DecisionOutcome | null, pending: boolean): string {
  if (!decision) return "Not decided";
  if (pending) return `${DECISION_PHRASE[decision]} (pending approval)`;
  return DECISION_PHRASE[decision];
}
