import { addDays } from "@/lib/domain/tokens";
import { emptyDatabase, type AssessmentQuestion, type Database, type Session } from "@/lib/domain/types";
import { sessionForUser, signUp, createOrganization } from "./auth-engine";
import { createAssessment, recordDecision, saveReview, setAssessmentStatus } from "./assessments";
import { addDocument, saveSoc2Review } from "./documents";
import { addRemediation, createFinding, recordRiskAcceptance, updateFinding } from "./findings";
import { addPortalDocument, createInvitation, savePortalAnswers, submitPortal, type PortalAnswerInput } from "./portal";
import { listTemplates } from "./templates";
import { addContact, createVendor, saveCriticality, saveInherentRisk } from "./vendors";

export const DEMO_PASSWORD = "AuditReady-demo-2026";
export const NORTHSTAR_PORTAL_TOKEN = "ar_demo_northstar_7f3c9a2e4b81";
export const BRIGHTMAIL_PORTAL_TOKEN = "ar_demo_brightmail_19ab44c0de77";

const PEOPLE = [
  { fullName: "Jordan Hale", email: "jordan@acme.example", jobTitle: "CTO", role: "owner" as const },
  { fullName: "Priya Shah", email: "priya@acme.example", jobTitle: "Security Manager", role: "admin" as const },
  { fullName: "Alex Rivera", email: "alex@acme.example", jobTitle: "GRC Analyst", role: "analyst" as const },
  { fullName: "Sam Okonkwo", email: "sam@acme.example", jobTitle: "Internal Auditor", role: "viewer" as const },
];

export async function buildSeed(now = new Date()): Promise<{ db: Database; defaultUserId: string }> {
  const db = emptyDatabase();
  const stamp = now.toISOString();
  const at = (days: number) => addDays(stamp, days);

  const users = [];
  for (const person of PEOPLE) {
    users.push(await signUp(db, { fullName: person.fullName, email: person.email, password: DEMO_PASSWORD }, at(-200)));
  }
  const [jordan, priya, alex, sam] = users;
  if (!jordan || !priya || !alex || !sam) throw new Error("Seed users missing.");
  for (const person of PEOPLE) {
    const user = db.users.find((item) => item.email === person.email);
    if (user) user.jobTitle = person.jobTitle;
  }

  const jordanSession = sessionForUser(db, jordan.id);
  createOrganization(db, jordanSession, { name: "Acme Technologies", jobTitle: "CTO" }, at(-180), "demo");
  const orgId = db.organizations[0]?.id;
  if (!orgId) throw new Error("Seed organization missing.");
  db.members.push(
    { id: crypto.randomUUID(), organizationId: orgId, userId: priya.id, role: "admin", createdAt: at(-180), deletedAt: null },
    { id: crypto.randomUUID(), organizationId: orgId, userId: alex.id, role: "analyst", createdAt: at(-180), deletedAt: null },
    { id: crypto.randomUUID(), organizationId: orgId, userId: sam.id, role: "viewer", createdAt: at(-179), deletedAt: null },
  );
  const alexSession = sessionForUser(db, alex.id);
  const priyaSession = sessionForUser(db, priya.id);
  const templateId = listTemplates(db, alexSession)[0]?.id;
  if (!templateId) throw new Error("Seed questionnaire missing.");

  const northstar = createVendor(db, alexSession, vendor("Northstar Cloud", "https://northstarcloud.example", "Production cloud hosting", "cloud_infrastructure", "Riley Morgan", "Alex Rivera", "critical", "customer_pii", "privileged"), at(-40), "demo");
  saveCriticality(db, alexSession, northstar.id, factors(true, "Hosts production workloads and customer data. Loss of this vendor stops the product."), at(-39));
  saveInherentRisk(db, alexSession, northstar.id, inherent({ customerData: true, pii: true, payment: false, productionAccess: true, privilegedAccess: true, operationallyCritical: true, hostsData: true, subprocessors: true }), at(-39));
  addContact(db, alexSession, northstar.id, { name: "Maya Chen", title: "Security Lead", email: "security@northstarcloud.example", contactRole: "Security" }, at(-38));
  addContact(db, alexSession, northstar.id, { name: "Evan Brooks", title: "Account Manager", email: "evan@northstarcloud.example", contactRole: "Account Manager" }, at(-38));

  const people = createVendor(db, priyaSession, vendor("PeopleCore HR", "https://peoplecore.example", "HR and payroll platform", "hr", "Lena Ortiz", "Priya Shah", "high", "customer_pii", "write"), at(-360), "demo");
  saveCriticality(db, priyaSession, people.id, { ...factors(false, "Payroll and employee records. Operationally important, no production access.", { sensitiveData: true, businessDependency: true, financialImpact: true, productionAccess: false, privilegedAccess: false, customerData: false }), criticality: "high" }, at(-350));
  saveInherentRisk(db, priyaSession, people.id, inherent({ customerData: false, pii: true, payment: false, productionAccess: false, privilegedAccess: false, operationallyCritical: true, hostsData: true, subprocessors: true }), at(-350));
  addContact(db, priyaSession, people.id, { name: "Noah Grant", title: "Privacy Counsel", email: "privacy@peoplecore.example", contactRole: "Privacy" }, at(-350));

  const payflow = createVendor(db, alexSession, vendor("PayFlow Systems", "https://payflow.example", "Payment processing", "financial", "Chris Adelayo", "Alex Rivera", "critical", "payment", "production"), at(-25), "demo");
  saveCriticality(db, alexSession, payflow.id, factors(true, "Processes customer payments and can reach production billing services."), at(-24));
  saveInherentRisk(db, alexSession, payflow.id, inherent({ customerData: true, pii: true, payment: true, productionAccess: true, privilegedAccess: true, operationallyCritical: true, hostsData: true, subprocessors: true }), at(-24));
  addContact(db, alexSession, payflow.id, { name: "Sofia Rahman", title: "Trust Center", email: "trust@payflow.example", contactRole: "Security" }, at(-24));

  const bright = createVendor(db, alexSession, vendor("BrightMail", "https://brightmail.example", "Customer email campaigns", "marketing", "Mina Park", "Alex Rivera", "moderate", "customer_pii", "none"), at(-12), "demo");
  saveCriticality(db, alexSession, bright.id, factors(false, "Sends customer email. No production access.", { sensitiveData: true, customerData: true, businessDependency: false }), at(-12));
  saveInherentRisk(db, alexSession, bright.id, inherent({ customerData: true, pii: true, payment: false, productionAccess: false, privilegedAccess: false, operationallyCritical: false, hostsData: true, subprocessors: true }), at(-12));
  addContact(db, alexSession, bright.id, { name: "Jonah Ellis", title: "Customer Success", email: "jonah@brightmail.example", contactRole: "Account Manager" }, at(-11));

  const dataforge = createVendor(db, alexSession, vendor("DataForge", "https://dataforge.example", "Product analytics", "saas", "Riley Morgan", "Alex Rivera", "high", "customer_pii", "read"), at(-70), "demo");
  saveCriticality(db, alexSession, dataforge.id, { ...factors(false, "Receives product usage data that includes customer identifiers.", { sensitiveData: true, customerData: true, productionAccess: false, privilegedAccess: false, financialImpact: false }), criticality: "high" }, at(-68));
  saveInherentRisk(db, alexSession, dataforge.id, inherent({ customerData: true, pii: true, payment: false, productionAccess: false, privilegedAccess: false, operationallyCritical: false, hostsData: true, subprocessors: true }), at(-68));

  const harbor = createVendor(db, alexSession, vendor("HarborDesk", "https://harbordesk.example", "Implementation consulting", "professional_services", "Priya Shah", "Priya Shah", "low", "internal", "none"), at(-100), "demo");
  saveCriticality(db, alexSession, harbor.id, { ...factors(false, "Project consultants under NDA. No system or customer-data access."), criticality: "low", sensitiveData: false, productionAccess: false, businessDependency: false, privilegedAccess: false, customerData: false, financialImpact: false }, at(-100));
  saveInherentRisk(db, alexSession, harbor.id, inherent({}), at(-100));

  await runAssessment(db, alexSession, {
    vendorId: northstar.id,
    name: "Northstar Cloud 2026 security assessment",
    templateId,
    ownerId: alex.id,
    due: at(12).slice(0, 10),
    created: at(-20),
    token: NORTHSTAR_PORTAL_TOKEN,
    email: "security@northstarcloud.example",
    sent: at(-16),
    answered: at(-8),
    submitted: at(-7),
    answer: (question) => {
      if (question.controlRef === "AC-REV" || question.controlRef === "BCP-TEST" || question.controlRef === "TPRM-PROG") return booleanAnswer(question, false);
      if (question.controlRef === "AC-FREQ") return choiceAnswer(question, "Annually");
      if (question.controlRef === "DP-SEG") return textAnswer(question, "Each customer is a separate tenant with its own encryption keys.");
      if (question.controlRef === "TPRM-LIST") return textAnswer(question, "Cloud infrastructure, transactional email, and a support desk.");
      return defaultAnswer(question);
    },
    beforeSubmit: async (token) => {
      const assessment = db.assessments.find((item) => item.vendorId === northstar.id);
      if (!assessment) return;
      const report = await addPortalDocument(db, token, { questionId: questionId(db, assessment.id, "CLD-SOC"), fileName: "Northstar-SOC2-Type-II-2025.pdf", contentType: "application/pdf", sizeBytes: 248000, documentType: "soc2_type_ii", description: "SOC 2 Type II report for the hosting platform." }, at(-9));
      await addPortalDocument(db, token, { questionId: questionId(db, assessment.id, "VM-PENFILE"), fileName: "Northstar-pentest-summary.pdf", contentType: "application/pdf", sizeBytes: 96000, documentType: "penetration_test", description: "Executive summary of the 2025 penetration test." }, at(-9));
      db.documents.find((item) => item.id === report.id);
    },
  });
  const northstarAssessment = db.assessments.find((item) => item.vendorId === northstar.id);
  if (!northstarAssessment) throw new Error("Northstar assessment missing.");
  const soc = db.documents.find((item) => item.vendorId === northstar.id && item.documentType === "soc2_type_ii");
  if (!soc) throw new Error("Northstar SOC report missing.");
  saveSoc2Review(db, alexSession, soc.id, {
    reportType: "type_ii",
    auditFirm: "Larkspur Assurance",
    periodStart: "2025-01-01",
    periodEnd: "2025-12-31",
    opinion: "",
    exceptionsNoted: null,
    subserviceOrganizations: "Cloud infrastructure provider listed as a subservice organization.",
    complementaryUserEntityControls: "",
    coversSecurity: true,
    coversAvailability: true,
    coversConfidentiality: false,
    coversProcessingIntegrity: false,
    coversPrivacy: false,
    analystNotes: "Period and firm captured. Opinion and exceptions still need to be read from the report.",
    reviewStatus: "in_review",
  }, at(-6));
  reviewSome(db, alexSession, northstarAssessment.id, at(-5), (ref) => {
    if (ref === "AC-REV") return "fail";
    if (ref === "TPRM-PROG") return "partial";
    if (["GOV-ISP", "AC-LEAST", "ID-MFA-PRIV", "ID-MFA-REMOTE", "ENC-TRANSIT", "ENC-REST", "IR-PLAN", "IR-TEST", "LOG-CENTRAL", "LOG-MON", "VM-SCAN", "VM-PEN", "HR-TRAIN", "CLD-ADMIN", "DR-BACKUP"].includes(ref)) return "pass";
    return null;
  });
  setAssessmentStatus(db, alexSession, northstarAssessment.id, "in_review", at(-5));
  const accessQuestion = questionId(db, northstarAssessment.id, "AC-REV");
  const accessFinding = createFinding(db, alexSession, {
    title: "Access reviews are annual rather than periodic for privileged roles",
    vendorId: northstar.id,
    assessmentId: northstarAssessment.id,
    assessmentQuestionId: accessQuestion,
    description: "Northstar described an annual access review. Privileged and customer-data access is not reviewed often enough for a critical hosting vendor.",
    risk: "moderate",
    recommendation: "Review privileged and customer-data access at least quarterly and keep the evidence.",
    vendorResponse: "",
    ownerId: alex.id,
    targetDate: at(30).slice(0, 10),
  }, at(-4));
  updateFinding(db, alexSession, accessFinding.id, {
    title: accessFinding.title,
    vendorId: northstar.id,
    assessmentId: northstarAssessment.id,
    assessmentQuestionId: accessQuestion,
    description: accessFinding.description,
    risk: "moderate",
    recommendation: accessFinding.recommendation,
    vendorResponse: "We can move privileged reviews to quarterly starting next month. The first package will be shared with Acme.",
    ownerId: alex.id,
    targetDate: at(30).slice(0, 10),
  }, at(-2));

  await runAssessment(db, priyaSession, {
    vendorId: people.id,
    name: "PeopleCore HR annual review",
    templateId,
    ownerId: priya.id,
    due: at(-20).slice(0, 10),
    created: at(-40),
    sent: at(-38),
    answered: at(-30),
    submitted: at(-28),
    answer: (question) => (question.controlRef === "HR-BG" ? booleanAnswer(question, false) : defaultAnswer(question)),
  });
  const peopleAssessment = db.assessments.find((item) => item.vendorId === people.id);
  if (!peopleAssessment) throw new Error("PeopleCore assessment missing.");
  reviewSome(db, priyaSession, peopleAssessment.id, at(-21), (ref) => (ref === "HR-BG" ? "partial" : "pass"));
  setAssessmentStatus(db, priyaSession, peopleAssessment.id, "in_review", at(-21));
  const bg = createFinding(db, priyaSession, {
    title: "Background checks are not applied to contractors",
    vendorId: people.id,
    assessmentId: peopleAssessment.id,
    assessmentQuestionId: questionId(db, peopleAssessment.id, "HR-BG"),
    description: "Employees are screened. Contractors with payroll access are not covered by the same check, where local law would allow it.",
    risk: "moderate",
    recommendation: "Extend screening to contractors who can view employee or payroll data.",
    vendorResponse: "A contractor screening addendum is in legal review.",
    ownerId: priya.id,
    targetDate: at(60).slice(0, 10),
  }, at(-18));
  recordRiskAcceptance(db, priyaSession, bg.id, {
    businessJustification: "Payroll processing cannot move this quarter, and employees are already screened. Contractor access is limited to two named support staff.",
    compensatingControls: "Named contractor accounts, MFA, and quarterly access review by PeopleCore security.",
    expiresOn: at(180).slice(0, 10),
  }, at(-16));
  recordDecision(db, priyaSession, peopleAssessment.id, {
    decision: "approved_with_conditions",
    notes: "Approved for continued use. Revisit contractor screening at the next review.",
    requiresSecondaryApproval: false,
  }, at(-15));
  addDocument(db, priyaSession, { vendorId: people.id, assessmentId: peopleAssessment.id, fileName: "PeopleCore-ISO27001.pdf", contentType: "application/pdf", sizeBytes: 180000, documentType: "iso_27001", description: "ISO/IEC 27001 certificate, current through next year." }, at(-29));

  await runAssessment(db, alexSession, {
    vendorId: payflow.id,
    name: "PayFlow Systems initial assessment",
    templateId,
    ownerId: alex.id,
    due: at(-12).slice(0, 10),
    created: at(-18),
    sent: at(-16),
    answered: at(-9),
    submitted: at(-8),
    answer: (question) => {
      if (question.controlRef === "ENC-TRANSIT" || question.controlRef === "VM-SCAN") return booleanAnswer(question, false);
      if (question.controlRef === "ENC-REST") return booleanAnswer(question, false);
      return defaultAnswer(question);
    },
  });
  const payAssessment = db.assessments.find((item) => item.vendorId === payflow.id);
  if (!payAssessment) throw new Error("PayFlow assessment missing.");
  reviewSome(db, alexSession, payAssessment.id, at(-6), (ref) => {
    if (ref === "ENC-TRANSIT" || ref === "VM-SCAN" || ref === "ENC-REST") return "fail";
    if (["GOV-ISP", "ID-MFA-PRIV", "IR-PLAN"].includes(ref)) return "pass";
    return null;
  });
  setAssessmentStatus(db, alexSession, payAssessment.id, "in_review", at(-6));
  const enc = createFinding(db, alexSession, {
    title: "Customer payment data is not encrypted in transit on a legacy integration",
    vendorId: payflow.id,
    assessmentId: payAssessment.id,
    assessmentQuestionId: questionId(db, payAssessment.id, "ENC-TRANSIT"),
    description: "PayFlow disclosed a legacy file transfer used for settlement reports that does not enforce TLS.",
    risk: "critical",
    recommendation: "Disable the legacy transfer or wrap it in a current encrypted channel before Acme sends production data.",
    vendorResponse: "Engineering has a replacement targeted for this month.",
    ownerId: alex.id,
    targetDate: at(21).slice(0, 10),
  }, at(-5));
  addRemediation(db, alexSession, enc.id, {
    requiredAction: "Retire the legacy settlement transfer and confirm TLS on every payment path.",
    vendorResponse: "Replacement is in staging. Production cutover is scheduled.",
    targetDate: at(21).slice(0, 10),
    status: "in_progress",
  }, at(-3));
  addDocument(db, alexSession, { vendorId: payflow.id, assessmentId: payAssessment.id, fileName: "PayFlow-SOC2-Type-II.pdf", contentType: "application/pdf", sizeBytes: 320000, documentType: "soc2_type_ii", description: "SOC 2 Type II with noted exceptions." }, at(-7));

  const brightAssessment = createAssessment(db, alexSession, {
    vendorId: bright.id,
    name: "BrightMail initial assessment",
    type: "initial",
    ownerId: alex.id,
    templateId,
    dueDate: at(6).slice(0, 10),
  }, at(-4), "demo");
  await createInvitation(db, alexSession, brightAssessment.id, "jonah@brightmail.example", at(-3), BRIGHTMAIL_PORTAL_TOKEN);

  await runAssessment(db, alexSession, {
    vendorId: dataforge.id,
    name: "DataForge security assessment",
    templateId,
    ownerId: alex.id,
    due: at(-15).slice(0, 10),
    created: at(-50),
    sent: at(-45),
    answered: at(-30),
    submitted: at(-28),
    answer: (question) => (question.controlRef === "IR-PLAN" ? booleanAnswer(question, false) : defaultAnswer(question)),
  });
  const dataAssessment = db.assessments.find((item) => item.vendorId === dataforge.id);
  if (!dataAssessment) throw new Error("DataForge assessment missing.");
  reviewSome(db, alexSession, dataAssessment.id, at(-20), (ref) => (ref === "IR-PLAN" ? "fail" : "pass"));
  setAssessmentStatus(db, alexSession, dataAssessment.id, "in_review", at(-20));
  createFinding(db, alexSession, {
    title: "No documented incident response plan",
    vendorId: dataforge.id,
    assessmentId: dataAssessment.id,
    assessmentQuestionId: questionId(db, dataAssessment.id, "IR-PLAN"),
    description: "DataForge could not provide an incident response plan or a customer notification commitment.",
    risk: "high",
    recommendation: "Do not send customer identifiers until an incident plan and notification commitment are in place.",
    vendorResponse: "We are drafting a plan but cannot commit to a date.",
    ownerId: alex.id,
    targetDate: at(-5).slice(0, 10),
  }, at(-18));
  recordDecision(db, alexSession, dataAssessment.id, {
    decision: "rejected",
    notes: "Rejected for customer data. The incident response gap is unresolved and the vendor would not commit to a date.",
    requiresSecondaryApproval: false,
  }, at(-12));

  await runAssessment(db, alexSession, {
    vendorId: harbor.id,
    name: "HarborDesk consulting review",
    templateId,
    ownerId: alex.id,
    due: at(-40).slice(0, 10),
    created: at(-80),
    sent: at(-75),
    answered: at(-60),
    submitted: at(-55),
    answer: (question) => {
      if (question.type === "yes_no_na" && ["SDLC-DOC", "SDLC-REVIEW", "SDLC-DEP", "PHY-FAC", "PHY-VIS", "CLD-SHARED", "CLD-CFG", "CLD-ADMIN"].includes(question.controlRef)) {
        return { questionId: question.id, answerBoolean: null, answerNa: true, answerText: "", answerChoice: "" };
      }
      return defaultAnswer(question);
    },
  });
  const harborAssessment = db.assessments.find((item) => item.vendorId === harbor.id);
  if (!harborAssessment) throw new Error("HarborDesk assessment missing.");
  reviewSome(db, alexSession, harborAssessment.id, at(-50), () => "pass");
  setAssessmentStatus(db, alexSession, harborAssessment.id, "in_review", at(-50));
  recordDecision(db, alexSession, harborAssessment.id, {
    decision: "approved",
    notes: "Approved. Consultants work under NDA with no system access.",
    requiresSecondaryApproval: false,
  }, at(-48));

  db.vendors.find((vendor) => vendor.id === people.id)!.nextReviewAt = at(20).slice(0, 10);
  return { db, defaultUserId: alex.id };
}

async function runAssessment(
  db: Database,
  session: Session,
  input: {
    vendorId: string;
    name: string;
    templateId: string;
    ownerId: string;
    due: string;
    created: string;
    token?: string;
    email?: string;
    sent: string;
    answered: string;
    submitted: string;
    answer: (question: AssessmentQuestion) => PortalAnswerInput;
    beforeSubmit?: (token: string) => Promise<void>;
  },
) {
  const assessment = createAssessment(db, session, {
    vendorId: input.vendorId,
    name: input.name,
    type: "initial",
    ownerId: input.ownerId,
    templateId: input.templateId,
    dueDate: input.due,
  }, input.created, "demo");
  const vendor = db.vendors.find((item) => item.id === input.vendorId);
  const email = input.email ?? `security@${(vendor?.name ?? "vendor").toLowerCase().replace(/[^a-z]+/g, "")}.example`;
  const invite = await createInvitation(db, session, assessment.id, email, input.sent, input.token);
  const questions = db.assessmentQuestions.filter((question) => question.assessmentId === assessment.id);
  await savePortalAnswers(db, invite.token, questions.map((question) => input.answer(question)), input.answered);
  if (input.beforeSubmit) await input.beforeSubmit(invite.token);
  await submitPortal(db, invite.token, input.submitted);
  return assessment;
}

function reviewSome(
  db: Database,
  session: Session,
  assessmentId: string,
  now: string,
  pick: (controlRef: string) => "pass" | "partial" | "fail" | "na" | null,
) {
  for (const question of db.assessmentQuestions.filter((item) => item.assessmentId === assessmentId)) {
    const result = pick(question.controlRef);
    if (!result) continue;
    const response = db.responses.find((item) => item.assessmentQuestionId === question.id);
    if (!response) continue;
    const notes = result === "fail" ? "Response does not demonstrate the control." : result === "partial" ? "Control exists with a material gap." : "";
    saveReview(db, session, response.id, { result, notes }, now);
  }
}

function questionId(db: Database, assessmentId: string, controlRef: string): string {
  const question = db.assessmentQuestions.find((item) => item.assessmentId === assessmentId && item.controlRef === controlRef);
  if (!question) throw new Error(`Missing question ${controlRef}`);
  return question.id;
}

function defaultAnswer(question: AssessmentQuestion): PortalAnswerInput {
  if (question.type === "multiple_choice") return choiceAnswer(question, question.options[0] ?? "");
  if (question.type === "text") return textAnswer(question, "Described in the security program and available to customers under NDA.");
  if (question.type === "file_request") return textAnswer(question, "Latest report is attached or available in the trust center.");
  return booleanAnswer(question, true);
}

function booleanAnswer(question: AssessmentQuestion, value: boolean): PortalAnswerInput {
  return { questionId: question.id, answerBoolean: value, answerNa: false, answerText: "", answerChoice: "" };
}

function choiceAnswer(question: AssessmentQuestion, choice: string): PortalAnswerInput {
  return { questionId: question.id, answerBoolean: null, answerNa: false, answerText: "", answerChoice: choice };
}

function textAnswer(question: AssessmentQuestion, text: string): PortalAnswerInput {
  return { questionId: question.id, answerBoolean: null, answerNa: false, answerText: text, answerChoice: "" };
}

function vendor(
  name: string,
  website: string,
  service: string,
  category: "saas" | "cloud_infrastructure" | "professional_services" | "financial" | "hr" | "marketing" | "security" | "other",
  businessOwner: string,
  securityOwner: string,
  criticality: "low" | "moderate" | "high" | "critical",
  dataAccess: "none" | "internal" | "confidential" | "customer_pii" | "payment" | "regulated",
  systemAccess: "none" | "read" | "write" | "production" | "privileged",
) {
  return {
    name,
    website,
    service,
    category,
    businessOwner,
    securityOwner,
    criticality,
    dataAccess,
    systemAccess,
    reviewFrequency: "annual" as const,
    notes: "",
  };
}

function factors(
  serious: boolean,
  justification: string,
  patch?: Partial<{ sensitiveData: boolean; productionAccess: boolean; businessDependency: boolean; privilegedAccess: boolean; customerData: boolean; financialImpact: boolean }>,
) {
  return {
    criticality: serious ? ("critical" as const) : ("moderate" as const),
    criticalityJustification: justification,
    sensitiveData: serious,
    productionAccess: serious,
    businessDependency: serious,
    privilegedAccess: serious,
    customerData: serious,
    financialImpact: serious,
    ...patch,
  };
}

function inherent(patch?: Partial<Record<"customerData" | "pii" | "payment" | "productionAccess" | "privilegedAccess" | "operationallyCritical" | "hostsData" | "subprocessors", boolean>>) {
  return {
    customerData: false,
    pii: false,
    payment: false,
    productionAccess: false,
    privilegedAccess: false,
    operationallyCritical: false,
    hostsData: false,
    subprocessors: false,
    override: null,
    overrideJustification: "",
    ...patch,
  };
}
