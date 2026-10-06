import { describe, expect, it } from "vitest";
import { DeterministicDocumentAnalysisService } from "@/lib/analysis/document-analysis";
import { parseCsv, rowsToObjects, toCsv } from "@/lib/domain/csv";
import { AppError } from "@/lib/domain/errors";
import { sanitizeFileName, validateUpload } from "@/lib/domain/filenames";
import { roleHasPermission } from "@/lib/domain/permissions";
import { buildExecutiveSummary } from "@/lib/domain/report";
import { controlLevel, inherentLevel, residualRisk, scoreControls, scoreInherent } from "@/lib/domain/risk";
import { isAnswered, suggestResult } from "@/lib/domain/scoring";
import { generateToken, hashToken, slugify } from "@/lib/domain/tokens";
import type { AssessmentQuestion, ResponseRecord } from "@/lib/domain/types";
import { vendorSchema } from "@/lib/domain/validation";
import { canTransitionAssessment, canTransitionFinding } from "@/lib/domain/workflow";
import { MemoryRateLimiter } from "@/lib/security/rate-limit";
import { sessionForUser } from "@/lib/data/auth-engine";
import { createFinding, recordRiskAcceptance, setFindingStatus } from "@/lib/data/findings";
import { getPortal } from "@/lib/data/portal";
import { buildSeed, DEMO_PASSWORD, NORTHSTAR_PORTAL_TOKEN } from "@/lib/data/seed";
import { getVendor, listVendors } from "@/lib/data/vendors";
import { QUESTION_BANK } from "@/lib/data/question-bank";
import { DemoRepository } from "@/lib/data/demo-repository";
import { MemoryBlobStore } from "@/lib/data/blob-store";
import { MemoryStorage } from "@/lib/data/storage";
import { collectChanges } from "@/lib/supabase/diff";

const fixed = new Date("2026-10-06T15:00:00.000Z");

describe("risk model", () => {
  it("scores inherent factors on the documented bands", () => {
    expect(inherentLevel(0)).toBe("low");
    expect(inherentLevel(5)).toBe("moderate");
    expect(inherentLevel(10)).toBe("high");
    expect(inherentLevel(11)).toBe("critical");
    const scored = scoreInherent({
      customerData: true,
      pii: true,
      payment: true,
      productionAccess: true,
      privilegedAccess: true,
      operationallyCritical: true,
      hostsData: true,
      subprocessors: true,
    });
    expect(scored.score).toBe(18);
    expect(scored.level).toBe("critical");
  });

  it("scores control failures without treating blanks as passes", () => {
    const score = scoreControls([
      { weight: 5, result: "fail" },
      { weight: 5, result: "pass" },
      { weight: 5, result: "not_reviewed" },
      { weight: 5, result: "na" },
    ]);
    expect(score.fail).toBe(1);
    expect(score.notReviewed).toBe(1);
    expect(score.na).toBe(1);
    expect(score.preliminary).toBe(false);
    expect(score.ratio).toBe(50);
    const thin = scoreControls([
      { weight: 5, result: "pass" },
      { weight: 5, result: "not_reviewed" },
      { weight: 5, result: "not_reviewed" },
    ]);
    expect(thin.preliminary).toBe(true);
    expect(controlLevel(0.5)).toBe("high");
  });

  it("moves residual risk from inherent using control quality", () => {
    expect(residualRisk("critical", "low")).toBe("high");
    expect(residualRisk("high", "moderate")).toBe("high");
    expect(residualRisk("moderate", "high")).toBe("high");
    expect(residualRisk("low", "critical")).toBe("high");
    expect(residualRisk("critical", "critical")).toBe("critical");
  });
});

describe("permissions and workflow", () => {
  it("keeps viewers read-only and reserves high-risk acceptance", () => {
    expect(roleHasPermission("viewer", "vendors.write")).toBe(false);
    expect(roleHasPermission("viewer", "vendors.read")).toBe(true);
    expect(roleHasPermission("analyst", "findings.accept_high_risk")).toBe(false);
    expect(roleHasPermission("admin", "findings.accept_high_risk")).toBe(true);
    expect(roleHasPermission("owner", "org.billing")).toBe(true);
    expect(roleHasPermission("admin", "org.billing")).toBe(false);
    expect(roleHasPermission("analyst", "questionnaires.write")).toBe(false);
  });

  it("allows only the assessment and finding transitions in the workflow", () => {
    expect(canTransitionAssessment("draft", "questionnaire_sent")).toBe(true);
    expect(canTransitionAssessment("draft", "approved")).toBe(false);
    expect(canTransitionAssessment("in_review", "approved_with_conditions")).toBe(true);
    expect(canTransitionAssessment("closed", "in_review")).toBe(false);
    expect(canTransitionFinding("open", "risk_accepted")).toBe(false);
    expect(canTransitionFinding("remediation", "closed")).toBe(true);
  });
});

describe("questionnaire scoring and reports", () => {
  it("suggests a result from a yes/no answer without deciding it", () => {
    const question = { type: "yes_no" } as AssessmentQuestion;
    const response = { answerBoolean: false, answerNa: false, documentIds: [], answerText: "", answerChoice: "" } as unknown as ResponseRecord;
    expect(suggestResult(question, response)).toBe("fail");
    expect(isAnswered(question, response)).toBe(true);
  });

  it("writes a deterministic executive summary", () => {
    const summary = buildExecutiveSummary({
      vendorName: "Northstar Cloud",
      criticality: "critical",
      service: "production hosting",
      dataAccessLabel: "customer personal data",
      systemAccessLabel: "privileged access",
      findings: [
        { reference: "F-001", title: "Access review frequency", risk: "moderate", status: "open", description: "", recommendation: "" },
      ],
      decision: "approved_with_conditions",
      pendingApproval: false,
      residual: "high",
    });
    expect(summary).toContain("Northstar Cloud");
    expect(summary).toContain("Critical-criticality");
    expect(summary).toContain("Approved With Conditions");
    expect(summary).toContain("moderate-risk finding");
  });
});

describe("tokens, files, and csv", () => {
  it("creates unguessable tokens and stable hashes", async () => {
    const token = generateToken();
    expect(token.length).toBeGreaterThan(40);
    expect(token).not.toContain("+");
    expect(await hashToken(token)).toBe(await hashToken(token));
    expect(await hashToken(token)).not.toBe(await hashToken(`${token}x`));
    expect(slugify("Acme Technologies!")).toBe("acme-technologies");
  });

  it("rejects unsafe uploads and sanitizes names", () => {
    expect(validateUpload("report.pdf", "application/pdf", 1000)).toBeNull();
    expect(validateUpload("evil.exe", "application/octet-stream", 1000)).toMatch(/PDF/);
    expect(validateUpload("big.pdf", "application/pdf", 11 * 1024 * 1024)).toMatch(/10 MB/);
    expect(sanitizeFileName("../../secret\u0000.pdf")).toBe("secret.pdf");
  });

  it("round-trips csv and neutralizes formulas", () => {
    const csv = toCsv(["name", "notes"], [["=cmd", 'He said "hi"']]);
    expect(csv.startsWith("name,notes")).toBe(true);
    expect(csv).toContain("'=cmd");
    const parsed = rowsToObjects(parseCsv(csv));
    expect(parsed.records[0]?.name).toBe("'=cmd");
    expect(parsed.records[0]?.notes).toBe('He said "hi"');
  });

  it("rejects a vendor row without a name", () => {
    const result = vendorSchema.safeParse({ name: "", service: "Hosting", category: "saas", criticality: "low", dataAccess: "none", systemAccess: "none", reviewFrequency: "annual", website: "", businessOwner: "", securityOwner: "", notes: "" });
    expect(result.success).toBe(false);
  });
});

describe("rate limit", () => {
  it("blocks after the window is exhausted", () => {
    const limiter = new MemoryRateLimiter();
    expect(limiter.consume("login", 2, 1000, 0).allowed).toBe(true);
    expect(limiter.consume("login", 2, 1000, 10).allowed).toBe(true);
    expect(limiter.consume("login", 2, 1000, 20).allowed).toBe(false);
    expect(limiter.consume("login", 2, 1000, 2000).allowed).toBe(true);
  });
});

describe("document analysis boundary", () => {
  it("does not invent evidence from a file name", async () => {
    const suggestions = await new DeterministicDocumentAnalysisService().analyze({
      fileName: "soc2.pdf",
      contentType: "application/pdf",
      documentType: "soc2_type_ii",
    });
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.some((item) => /mfa evidence found|exceptions identified/i.test(`${item.title} ${item.detail}`))).toBe(false);
  });
});

describe("seeded workspace", () => {
  it("builds an isolated Acme workspace with the core workflow", async () => {
    expect(QUESTION_BANK.length).toBeGreaterThanOrEqual(50);
    const { db, defaultUserId } = await buildSeed(fixed);
    const alex = sessionForUser(db, defaultUserId);
    expect(alex.role).toBe("analyst");
    const vendors = listVendors(db, alex);
    expect(vendors.map((vendor) => vendor.name)).toEqual(
      expect.arrayContaining(["Northstar Cloud", "PeopleCore HR", "PayFlow Systems", "BrightMail", "DataForge"]),
    );
    const northstar = vendors.find((vendor) => vendor.name === "Northstar Cloud");
    expect(northstar?.criticality).toBe("critical");
    expect(northstar?.assessmentStatus).toBe("in_review");
    const otherOrgVendor = { ...northstar!, id: "99999999-9999-4999-8999-999999999999", organizationId: "88888888-8888-4888-8888-888888888888" };
    db.vendors.push(otherOrgVendor);
    expect(listVendors(db, alex).some((vendor) => vendor.id === otherOrgVendor.id)).toBe(false);
    expect(() => getVendor(db, alex, otherOrgVendor.id)).toThrow(AppError);

    const viewer = db.users.find((user) => user.email === "sam@acme.example");
    const viewerSession = sessionForUser(db, viewer!.id);
    expect(() => createFinding(db, viewerSession, {
      title: "Should fail",
      vendorId: northstar!.id,
      description: "Viewers cannot write findings.",
      risk: "low",
      recommendation: "",
      vendorResponse: "",
    }, fixed.toISOString())).toThrow(AppError);

    const payflow = vendors.find((vendor) => vendor.name === "PayFlow Systems")!;
    const critical = db.findings.find((finding) => finding.vendorId === payflow.id && finding.risk === "critical")!;
    expect(() => recordRiskAcceptance(db, alex, critical.id, {
      businessJustification: "Trying to accept this quietly.",
      compensatingControls: "None that are real.",
      expiresOn: "2026-12-01",
    }, fixed.toISOString())).toThrow(/admin or owner|permission/i);

    const admin = sessionForUser(db, db.users.find((user) => user.email === "priya@acme.example")!.id);
    const accepted = db.findings.find((finding) => finding.status === "risk_accepted");
    expect(accepted).toBeTruthy();
    expect(admin.role).toBe("admin");

    expect(() => setFindingStatus(db, alex, critical.id, "risk_accepted", fixed.toISOString(), "No.")).toThrow(/risk acceptance/i);

    const portal = await getPortal(db, NORTHSTAR_PORTAL_TOKEN, fixed.toISOString());
    expect(portal.vendorName).toBe("Northstar Cloud");
    expect(portal.questions.length).toBeGreaterThanOrEqual(50);
    expect(portal.documents.some((document) => document.fileName.includes("SOC2"))).toBe(true);
    expect(JSON.stringify(portal)).not.toContain("PayFlow");
    expect(JSON.stringify(portal)).not.toContain("passwordHash");
  });
});

describe("demo repository", () => {
  it("signs in the seeded analyst and refuses a bad password", async () => {
    const repo = new DemoRepository(new MemoryStorage(), new MemoryBlobStore());
    await repo.init();
    expect(repo.getSession()?.role).toBe("analyst");
    const dashboard = repo.getDashboard();
    expect(dashboard.totalVendors).toBeGreaterThanOrEqual(5);
    expect(dashboard.highRiskVendors).toBeGreaterThan(0);
    await expect(repo.signIn("alex@acme.example", "wrong-password")).rejects.toBeInstanceOf(AppError);
    const session = await repo.signIn("alex@acme.example", DEMO_PASSWORD);
    expect(session.role).toBe("analyst");
    const report = repo.getReport(repo.listAssessments({ search: "Northstar" })[0]!.id);
    expect(report.executiveSummary).toContain("Northstar Cloud");
    expect(report.modelSummary).toContain("Inherent risk");
  });
});

describe("supabase change tracking", () => {
  it("persists only changed rows and keeps other organizations out of a scoped flush", async () => {
    const seed = await buildSeed(fixed);
    const before = structuredClone(seed.db);
    const after = structuredClone(seed.db);
    expect(collectChanges(before, after)).toEqual([]);
    after.vendors[0]!.name = "Renamed Vendor";
    const changes = collectChanges(before, after);
    expect(changes).toEqual([
      expect.objectContaining({
        table: "vendors",
        inserts: [],
        updates: [expect.objectContaining({ name: "Renamed Vendor" })],
      }),
    ]);
    const orgId = after.vendors[0]!.organizationId;
    const other = structuredClone(after);
    other.vendors.push({ ...after.vendors[0]!, id: "00000000-0000-4000-8000-000000000099", organizationId: "00000000-0000-4000-8000-000000000088", name: "Outside" });
    const scoped = collectChanges(before, other, orgId);
    expect(scoped.some((change) => change.inserts.some((row) => row.name === "Outside") || change.updates.some((row) => row.name === "Outside"))).toBe(false);
    expect(scoped.some((change) => change.table === "profiles")).toBe(false);
  });
});
