import { INHERENT_FACTORS, type InherentAnswers, type RiskLevel } from "./types";

/**
 * AuditReady risk model
 * ---------------------
 * Ratings are analyst judgments supported by a transparent score. They are not
 * a claim that risk has been reduced to a single objective number.
 *
 * Inherent risk
 * Eight yes/no factors carry fixed weights that sum to 18:
 *   customer data 2, personal information 2, payment data 3,
 *   production access 3, privileged access 3, operationally critical 2,
 *   hosts company data 2, subprocessors 1.
 * Bands: 0–1 Low, 2–5 Moderate, 6–10 High, 11–18 Critical.
 *
 * Control risk
 * Each reviewed question has a weight from 1 to 5.
 *   Pass contributes 0.
 *   Partial contributes half the weight.
 *   Fail contributes the full weight.
 *   N/A is excluded.
 *   Unreviewed questions are excluded from the ratio and lower coverage.
 * Ratio = risk points / applicable weight.
 * Bands: under 15% Low, under 35% Moderate, under 60% High, otherwise Critical.
 * With no reviewed questions, control risk is Moderate and marked preliminary
 * (unknown, not "good"). Below 50% coverage the rating stays preliminary.
 *
 * Residual risk
 * Start from inherent risk. Control quality moves it by step:
 *   Low control risk: one step lower, never below Low.
 *   Moderate: unchanged.
 *   High: one step higher, never above Critical.
 *   Critical: two steps higher, never above Critical.
 * A critical-inherent vendor with low control risk therefore remains High.
 * That is intentional: strong controls reduce exposure but do not erase the
 * impact of a critical relationship.
 *
 * Overrides
 * An analyst may override inherent or residual risk. A written justification
 * is required. The calculated value, the override, the actor, and the previous
 * value are kept on the record and in the audit log.
 */

export const RISK_INDEX: Record<RiskLevel, number> = {
  low: 0,
  moderate: 1,
  high: 2,
  critical: 3,
};

export const RISK_FROM_INDEX: RiskLevel[] = ["low", "moderate", "high", "critical"];

export function clampRisk(index: number): RiskLevel {
  return RISK_FROM_INDEX[Math.min(3, Math.max(0, index))] ?? "low";
}

export function scoreInherent(answers: InherentAnswers): { score: number; level: RiskLevel } {
  let score = 0;
  for (const factor of INHERENT_FACTORS) {
    if (answers[factor.key]) score += factor.weight;
  }
  return { score, level: inherentLevel(score) };
}

export function inherentLevel(score: number): RiskLevel {
  if (score <= 1) return "low";
  if (score <= 5) return "moderate";
  if (score <= 10) return "high";
  return "critical";
}

export interface ControlScoreInput {
  weight: number;
  result: "pass" | "partial" | "fail" | "na" | "not_reviewed";
}

export interface ControlScore {
  level: RiskLevel;
  /** 0–100 risk ratio. Higher means weaker controls. */
  ratio: number;
  coverage: number;
  preliminary: boolean;
  pass: number;
  partial: number;
  fail: number;
  na: number;
  notReviewed: number;
  riskPoints: number;
  applicableWeight: number;
}

export function scoreControls(items: ControlScoreInput[]): ControlScore {
  let pass = 0;
  let partial = 0;
  let fail = 0;
  let na = 0;
  let notReviewed = 0;
  let riskPoints = 0;
  let applicableWeight = 0;
  let totalWeight = 0;

  for (const item of items) {
    const weight = item.weight > 0 ? item.weight : 1;
    if (item.result === "na") {
      na += 1;
      continue;
    }
    totalWeight += weight;
    if (item.result === "not_reviewed") {
      notReviewed += 1;
      continue;
    }
    applicableWeight += weight;
    if (item.result === "pass") pass += 1;
    else if (item.result === "partial") {
      partial += 1;
      riskPoints += weight * 0.5;
    } else if (item.result === "fail") {
      fail += 1;
      riskPoints += weight;
    }
  }

  const reviewedWeight = applicableWeight;
  const coverage = totalWeight === 0 ? 1 : reviewedWeight / totalWeight;
  const ratio = applicableWeight === 0 ? 0 : riskPoints / applicableWeight;
  const preliminary = coverage < 0.5;
  const level = applicableWeight === 0 ? "moderate" : controlLevel(ratio);

  return {
    level,
    ratio: Math.round(ratio * 1000) / 10,
    coverage: Math.round(coverage * 1000) / 10,
    preliminary,
    pass,
    partial,
    fail,
    na,
    notReviewed,
    riskPoints,
    applicableWeight,
  };
}

export function controlLevel(ratio: number): RiskLevel {
  if (ratio < 0.15) return "low";
  if (ratio < 0.35) return "moderate";
  if (ratio < 0.6) return "high";
  return "critical";
}

export function residualRisk(inherent: RiskLevel, control: RiskLevel): RiskLevel {
  const base = RISK_INDEX[inherent];
  if (control === "low") return clampRisk(base - 1);
  if (control === "moderate") return clampRisk(base);
  if (control === "high") return clampRisk(base + 1);
  return clampRisk(base + 2);
}

export function effectiveLevel(calculated: RiskLevel, override: RiskLevel | null): RiskLevel {
  return override ?? calculated;
}

export const RISK_MODEL_SUMMARY = [
  "Inherent risk adds fixed weights for data, access, criticality, hosting, and subprocessors (max 18).",
  "Control risk is the share of reviewed question weight marked partial or fail. Unreviewed questions do not count as passes.",
  "Residual risk starts at inherent risk and moves up or down based on control risk. Critical relationships stay elevated even when controls are strong.",
  "Overrides require a justification and are written to the audit log.",
].join(" ");
