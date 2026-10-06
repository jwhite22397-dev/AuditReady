import { AppError } from "@/lib/domain/errors";
import { validateUpload } from "@/lib/domain/filenames";
import { isAnswered } from "@/lib/domain/scoring";
import { addDays } from "@/lib/domain/tokens";
import type { AssessmentStatus, Database, DocumentType, RiskLevel, Session } from "@/lib/domain/types";
import { MemoryRateLimiter } from "@/lib/security/rate-limit";
import { acceptInvite, createOrganization, deleteOrganization, inviteMember, listInvites, listMembers, removeMember, sessionForUser, signIn, signUp, toPublicUser, updateMemberRole, updateOrganization } from "./auth-engine";
import {
  confirmDecision,
  createAssessment,
  devForceStatus,
  getAssessmentRecord,
  listAssessments,
  recordDecision,
  saveReview,
  setAnalystNotes,
  setAssessmentStatus,
  setExecutiveSummary,
  setInherentOverride,
  setResidualOverride,
  startReassessment,
  type AssessmentFilters,
} from "./assessments";
import { type BlobStore, createBlobStore } from "./blob-store";
import { addDocument, assertDocumentAccess, saveSoc2Review, updateDocument } from "./documents";
import { addRemediation, createFinding, getFinding, listFindings, recordRiskAcceptance, setFindingStatus, updateFinding, updateRemediation, verifyRemediation } from "./findings";
import { addPortalDocument, assertPortalDocument, createInvitation, getPortal, revokeInvitation, savePortalAnswers, submitPortal, type PortalAnswerInput } from "./portal";
import {
  buildReport,
  exportAssessmentCsv,
  exportFindingsCsv,
  exportVendorsCsv,
  getDashboard,
  getMyWork,
  listAudit,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  syncAttention,
  timelineForAssessment,
} from "./read-models";
import { buildSeed, DEMO_PASSWORD } from "./seed";
import { browserStorage, type KeyValueStorage } from "./storage";
import { addQuestion, addSection, archiveQuestion, archiveTemplate, createTemplate, duplicateTemplate, getTemplate, listTemplates, updateQuestion, updateTemplate } from "./templates";
import { addContact, contactsFor, createVendor, getVendor, importVendors, listVendors, removeContact, saveCriticality, saveInherentRisk, updateContact, updateVendor, vendorImportTemplate, type VendorFilters } from "./vendors";

const STORAGE_KEY = "auditready.demo.v1";

export class DemoRepository {
  readonly mode: "demo" | "supabase" = "demo";
  protected db: Database | null = null;
  protected session: Session | null = null;
  private readonly listeners = new Set<() => void>();
  protected readonly limiter = new MemoryRateLimiter();
  private writeChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly storage: KeyValueStorage = browserStorage(),
    private readonly blobs: BlobStore = createBlobStore(),
  ) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSession(): Session | null {
    return this.session ? { ...this.session } : null;
  }

  async init(): Promise<void> {
    const raw = this.storage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { version?: number; db?: Database; session?: Session | null };
        if (parsed.version === 1 && parsed.db) {
          this.db = parsed.db;
          this.session = parsed.session?.userId ? sessionForUser(parsed.db, parsed.session.userId) : null;
          if (this.session?.organizationId) syncAttention(this.db, this.session, new Date().toISOString());
          return;
        }
      } catch {
        this.storage.removeItem(STORAGE_KEY);
      }
    }
    await this.reset();
  }

  async signIn(email: string, password: string): Promise<Session> {
    const db = this.requireDb();
    const decision = this.limiter.consume(`login:${email.toLowerCase()}`, 8, 15 * 60 * 1000);
    if (!decision.allowed) throw new AppError("rate_limited", "Too many sign-in attempts. Wait a few minutes and try again.");
    this.session = await signIn(db, { email, password });
    await this.commit();
    return this.getSession()!;
  }

  async signUp(input: { fullName: string; email: string; password: string }): Promise<Session> {
    const db = this.requireDb();
    const user = await signUp(db, input, new Date().toISOString());
    this.session = { userId: user.id, organizationId: null, role: null };
    await this.commit();
    return this.getSession()!;
  }

  async signOut(): Promise<void> {
    this.session = null;
    await this.commit();
  }

  async requestPasswordReset(email: string): Promise<{ message: string }> {
    const db = this.requireDb();
    const exists = db.users.some((user) => user.email.toLowerCase() === email.toLowerCase());
    return {
      message: exists
        ? `Demo mode does not send email. Sample users sign in with ${DEMO_PASSWORD}.`
        : "If an account exists, a reset link would be sent. Demo mode does not send email.",
    };
  }

  async createOrganization(input: { name: string; jobTitle: string }) {
    const result = createOrganization(this.requireDb(), this.requireSession(), input, new Date().toISOString(), this.mode);
    this.session = sessionForUser(this.requireDb(), this.requireSession().userId);
    await this.commit();
    return result;
  }

  async updateOrganization(name: string) {
    const result = updateOrganization(this.requireDb(), this.requireSession(), { name }, new Date().toISOString());
    await this.commit();
    return result;
  }

  async deleteOrganization(confirmationName: string) {
    deleteOrganization(this.requireDb(), this.requireSession(), confirmationName, new Date().toISOString());
    this.session = null;
    await this.commit();
  }

  listOrganizations() {
    const db = this.requireDb();
    const session = this.requireSession();
    return db.members
      .filter((member) => member.userId === session.userId && !member.deletedAt)
      .map((member) => {
        const org = db.organizations.find((item) => item.id === member.organizationId && !item.deletedAt);
        return org ? { id: org.id, name: org.name, role: member.role } : null;
      })
      .filter((item): item is { id: string; name: string; role: NonNullable<Session["role"]> } => Boolean(item));
  }

  async setOrganization(organizationId: string) {
    const db = this.requireDb();
    const session = this.requireSession();
    const membership = db.members.find((member) => member.userId === session.userId && member.organizationId === organizationId && !member.deletedAt);
    const org = db.organizations.find((item) => item.id === organizationId && !item.deletedAt);
    if (!membership || !org) throw new AppError("forbidden", "You do not belong to that workspace.");
    this.session = { userId: session.userId, organizationId: org.id, role: membership.role };
    await this.commit();
  }

  listMembers() {
    return listMembers(this.requireDb(), this.requireSession());
  }

  async updateMemberRole(membershipId: string, role: "owner" | "admin" | "analyst" | "viewer") {
    updateMemberRole(this.requireDb(), this.requireSession(), membershipId, { role }, new Date().toISOString());
    this.session = sessionForUser(this.requireDb(), this.requireSession().userId);
    await this.commit();
  }

  async removeMember(membershipId: string) {
    removeMember(this.requireDb(), this.requireSession(), membershipId, new Date().toISOString());
    await this.commit();
  }

  async inviteMember(input: { email: string; role: "admin" | "analyst" | "viewer" }) {
    const result = await inviteMember(this.requireDb(), this.requireSession(), input, new Date().toISOString(), this.mode);
    await this.commit();
    return result;
  }

  listInvites() {
    return listInvites(this.requireDb(), this.requireSession());
  }

  async acceptInvite(code: string) {
    const membership = await acceptInvite(this.requireDb(), this.requireSession(), code, new Date().toISOString());
    this.session = { userId: membership.userId, organizationId: membership.organizationId, role: membership.role };
    await this.commit();
  }

  listVendors(filters?: VendorFilters) {
    return listVendors(this.requireDb(), this.requireSession(), filters);
  }

  getVendor(id: string) {
    const db = this.requireDb();
    const session = this.requireSession();
    const vendor = getVendor(db, session, id);
    return {
      vendor,
      contacts: contactsFor(db, vendor.organizationId, vendor.id),
      assessments: listAssessments(db, session, {}).filter((item) => item.vendorId === vendor.id),
      documents: db.documents.filter((document) => document.vendorId === vendor.id && !document.deletedAt),
      findings: listFindings(db, session, { vendorId: vendor.id }),
      activity: listAudit(db, session).filter((event) => event.entityId === vendor.id || db.assessments.some((assessment) => assessment.vendorId === vendor.id && assessment.id === event.entityId)),
    };
  }

  async createVendor(input: unknown) {
    const vendor = createVendor(this.requireDb(), this.requireSession(), input, new Date().toISOString(), this.mode);
    await this.commit();
    return vendor;
  }

  async updateVendor(id: string, input: unknown) {
    const vendor = updateVendor(this.requireDb(), this.requireSession(), id, input, new Date().toISOString());
    await this.commit();
    return vendor;
  }

  async importVendors(csv: string) {
    const result = importVendors(this.requireDb(), this.requireSession(), csv, new Date().toISOString(), this.mode);
    await this.commit();
    return result;
  }

  vendorImportTemplate() {
    return vendorImportTemplate();
  }

  async addContact(vendorId: string, input: unknown) {
    const contact = addContact(this.requireDb(), this.requireSession(), vendorId, input, new Date().toISOString());
    await this.commit();
    return contact;
  }

  async updateContact(id: string, input: unknown) {
    const contact = updateContact(this.requireDb(), this.requireSession(), id, input);
    await this.commit();
    return contact;
  }

  async removeContact(id: string) {
    removeContact(this.requireDb(), this.requireSession(), id, new Date().toISOString());
    await this.commit();
  }

  async saveCriticality(vendorId: string, input: unknown) {
    const vendor = saveCriticality(this.requireDb(), this.requireSession(), vendorId, input, new Date().toISOString());
    await this.commit();
    return vendor;
  }

  async saveInherentRisk(vendorId: string, input: unknown) {
    const vendor = saveInherentRisk(this.requireDb(), this.requireSession(), vendorId, input, new Date().toISOString());
    await this.commit();
    return vendor;
  }

  listAssessments(filters?: AssessmentFilters) {
    return listAssessments(this.requireDb(), this.requireSession(), filters);
  }

  getAssessment(id: string) {
    const db = this.requireDb();
    const session = this.requireSession();
    const assessment = getAssessmentRecord(db, session, id);
    const vendor = getVendor(db, session, assessment.vendorId);
    const questions = db.assessmentQuestions
      .filter((question) => question.assessmentId === assessment.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((question) => ({
        ...question,
        response: db.responses.find((response) => response.assessmentQuestionId === question.id) ?? null,
      }));
    const decisions = db.decisions.filter((decision) => decision.assessmentId === assessment.id).sort((a, b) => b.decidedAt.localeCompare(a.decidedAt));
    return {
      assessment,
      vendor,
      ownerName: db.users.find((user) => user.id === assessment.ownerId)?.fullName ?? "Unassigned",
      questions,
      documents: db.documents.filter((document) => document.assessmentId === assessment.id && !document.deletedAt),
      findings: listFindings(db, session, { vendorId: vendor.id }).filter((finding) => finding.assessmentId === assessment.id),
      invitations: db.invitations
        .filter((invitation) => invitation.assessmentId === assessment.id)
        .map((invitation) => ({ id: invitation.id, email: invitation.email, expiresAt: invitation.expiresAt, revokedAt: invitation.revokedAt, createdAt: invitation.createdAt })),
      decision: decisions[0] ?? null,
      timeline: timelineForAssessment(db, session, assessment.id),
      previous: assessment.previousAssessmentId ? db.assessments.find((item) => item.id === assessment.previousAssessmentId) ?? null : null,
    };
  }

  async createAssessment(input: unknown) {
    const assessment = createAssessment(this.requireDb(), this.requireSession(), input, new Date().toISOString(), this.mode);
    await this.commit();
    return assessment;
  }

  async setAssessmentStatus(id: string, status: AssessmentStatus) {
    const assessment = setAssessmentStatus(this.requireDb(), this.requireSession(), id, status, new Date().toISOString());
    await this.commit();
    return assessment;
  }

  async startReassessment(id: string) {
    const assessment = startReassessment(this.requireDb(), this.requireSession(), id, new Date().toISOString(), this.mode);
    await this.commit();
    return assessment;
  }

  async createInvitation(assessmentId: string, email: string) {
    const result = await createInvitation(this.requireDb(), this.requireSession(), assessmentId, email, new Date().toISOString());
    await this.commit();
    return result;
  }

  async revokeInvitation(id: string) {
    revokeInvitation(this.requireDb(), this.requireSession(), id, new Date().toISOString());
    await this.commit();
  }

  async saveReview(responseId: string, input: { result: "pass" | "partial" | "fail" | "na" | "not_reviewed"; notes: string }) {
    const response = saveReview(this.requireDb(), this.requireSession(), responseId, input, new Date().toISOString());
    await this.commit();
    return response;
  }

  async setInherentOverride(assessmentId: string, input: { level: RiskLevel | null; justification: string }) {
    setInherentOverride(this.requireDb(), this.requireSession(), assessmentId, input, new Date().toISOString());
    await this.commit();
  }

  async setResidualOverride(assessmentId: string, input: { level: RiskLevel | null; justification: string }) {
    setResidualOverride(this.requireDb(), this.requireSession(), assessmentId, input, new Date().toISOString());
    await this.commit();
  }

  async setExecutiveSummary(assessmentId: string, summary: string) {
    setExecutiveSummary(this.requireDb(), this.requireSession(), assessmentId, summary, new Date().toISOString());
    await this.commit();
  }

  async setAnalystNotes(assessmentId: string, notes: string) {
    setAnalystNotes(this.requireDb(), this.requireSession(), assessmentId, notes, new Date().toISOString());
    await this.commit();
  }

  async recordDecision(assessmentId: string, input: unknown) {
    const decision = recordDecision(this.requireDb(), this.requireSession(), assessmentId, input, new Date().toISOString());
    await this.commit();
    return decision;
  }

  async confirmDecision(decisionId: string) {
    confirmDecision(this.requireDb(), this.requireSession(), decisionId, new Date().toISOString());
    await this.commit();
  }

  listTemplates() {
    return listTemplates(this.requireDb(), this.requireSession());
  }

  getTemplate(id: string) {
    return getTemplate(this.requireDb(), this.requireSession(), id);
  }

  async createTemplate(input: unknown) {
    const template = createTemplate(this.requireDb(), this.requireSession(), input, new Date().toISOString(), this.mode);
    await this.commit();
    return template;
  }

  async duplicateTemplate(id: string) {
    const template = duplicateTemplate(this.requireDb(), this.requireSession(), id, new Date().toISOString(), this.mode);
    await this.commit();
    return template;
  }

  async updateTemplate(id: string, input: unknown) {
    updateTemplate(this.requireDb(), this.requireSession(), id, input, new Date().toISOString());
    await this.commit();
  }

  async archiveTemplate(id: string) {
    archiveTemplate(this.requireDb(), this.requireSession(), id, new Date().toISOString());
    await this.commit();
  }

  async addSection(templateId: string, title: string) {
    const section = addSection(this.requireDb(), this.requireSession(), templateId, title, new Date().toISOString());
    await this.commit();
    return section;
  }

  async addQuestion(templateId: string, input: unknown) {
    const question = addQuestion(this.requireDb(), this.requireSession(), templateId, input, new Date().toISOString());
    await this.commit();
    return question;
  }

  async updateQuestion(questionId: string, input: unknown) {
    updateQuestion(this.requireDb(), this.requireSession(), questionId, input, new Date().toISOString());
    await this.commit();
  }

  async archiveQuestion(questionId: string) {
    archiveQuestion(this.requireDb(), this.requireSession(), questionId, new Date().toISOString());
    await this.commit();
  }

  async getPortal(token: string) {
    const decision = this.limiter.consume(`portal:${token.slice(0, 12)}`, 120, 60 * 1000);
    if (!decision.allowed) throw new AppError("rate_limited", "Too many requests. Wait a moment and try again.");
    const view = await getPortal(this.requireDb(), token, new Date().toISOString());
    await this.commit();
    return view;
  }

  async savePortalAnswers(token: string, answers: PortalAnswerInput[]) {
    await savePortalAnswers(this.requireDb(), token, answers, new Date().toISOString());
    await this.commit();
  }

  async submitPortal(token: string) {
    await submitPortal(this.requireDb(), token, new Date().toISOString());
    await this.commit();
  }

  async addPortalDocument(token: string, file: File, input: { questionId?: string | null; documentType: DocumentType; description?: string }) {
    const problem = validateUpload(file.name, file.type || "application/octet-stream", file.size);
    if (problem) throw new AppError("validation", problem);
    const document = await addPortalDocument(this.requireDb(), token, {
      questionId: input.questionId,
      fileName: file.name,
      contentType: file.type,
      sizeBytes: file.size,
      documentType: input.documentType,
      description: input.description,
    }, new Date().toISOString());
    await this.blobs.put(document.id, await file.arrayBuffer(), file.type);
    await this.commit();
    return document;
  }

  async addUploadedDocument(file: File, input: { vendorId: string; assessmentId?: string | null; assessmentQuestionId?: string | null; findingId?: string | null; documentType: DocumentType; description?: string }) {
    const problem = validateUpload(file.name, file.type || "application/octet-stream", file.size);
    if (problem) throw new AppError("validation", problem);
    const document = addDocument(this.requireDb(), this.requireSession(), {
      ...input,
      fileName: file.name,
      contentType: file.type,
      sizeBytes: file.size,
    }, new Date().toISOString());
    await this.blobs.put(document.id, await file.arrayBuffer(), file.type);
    await this.commit();
    return document;
  }

  async getDocumentFile(id: string, portalToken?: string) {
    const db = this.requireDb();
    const document = portalToken
      ? await assertPortalDocument(db, portalToken, id, new Date().toISOString())
      : assertDocumentAccess(db, this.requireSession(), id);
    const blob = await this.blobs.get(document.id);
    if (!blob) {
      throw new AppError("not_found", "This file's details are saved, but its contents are not stored in this browser. Upload it again to keep a local copy.");
    }
    return { fileName: document.fileName, contentType: document.contentType, data: blob.data };
  }

  async updateDocument(id: string, input: unknown) {
    const document = updateDocument(this.requireDb(), this.requireSession(), id, input, new Date().toISOString());
    await this.commit();
    return document;
  }

  async saveSoc2Review(id: string, input: unknown) {
    const document = saveSoc2Review(this.requireDb(), this.requireSession(), id, input, new Date().toISOString());
    await this.commit();
    return document;
  }

  listFindings(filters?: Parameters<typeof listFindings>[2]) {
    return listFindings(this.requireDb(), this.requireSession(), filters);
  }

  getFindingDetail(id: string) {
    const db = this.requireDb();
    const session = this.requireSession();
    const finding = getFinding(db, session, id);
    return {
      finding,
      vendorName: db.vendors.find((vendor) => vendor.id === finding.vendorId)?.name ?? "Vendor",
      remediations: db.remediations.filter((action) => action.findingId === finding.id),
      acceptances: db.riskAcceptances.filter((item) => item.findingId === finding.id),
      documents: db.documents.filter((document) => document.findingId === finding.id && !document.deletedAt),
    };
  }

  async createFinding(input: unknown) {
    const finding = createFinding(this.requireDb(), this.requireSession(), input, new Date().toISOString());
    await this.commit();
    return finding;
  }

  async updateFinding(id: string, input: unknown) {
    const finding = updateFinding(this.requireDb(), this.requireSession(), id, input, new Date().toISOString());
    await this.commit();
    return finding;
  }

  async setFindingStatus(id: string, status: "open" | "vendor_response" | "remediation" | "closed", closureNotes = "") {
    setFindingStatus(this.requireDb(), this.requireSession(), id, status, new Date().toISOString(), closureNotes);
    await this.commit();
  }

  async addRemediation(findingId: string, input: unknown) {
    const action = addRemediation(this.requireDb(), this.requireSession(), findingId, input, new Date().toISOString());
    await this.commit();
    return action;
  }

  async updateRemediation(id: string, input: unknown) {
    const action = updateRemediation(this.requireDb(), this.requireSession(), id, input, new Date().toISOString());
    await this.commit();
    return action;
  }

  async verifyRemediation(id: string, verification: string) {
    verifyRemediation(this.requireDb(), this.requireSession(), id, verification, new Date().toISOString());
    await this.commit();
  }

  async recordRiskAcceptance(findingId: string, input: unknown) {
    const acceptance = recordRiskAcceptance(this.requireDb(), this.requireSession(), findingId, input, new Date().toISOString());
    await this.commit();
    return acceptance;
  }

  getDashboard() {
    return getDashboard(this.requireDb(), this.requireSession(), new Date().toISOString());
  }

  getMyWork() {
    return getMyWork(this.requireDb(), this.requireSession(), new Date().toISOString());
  }

  listAudit() {
    return listAudit(this.requireDb(), this.requireSession());
  }

  listNotifications() {
    syncAttention(this.requireDb(), this.requireSession(), new Date().toISOString());
    return listNotifications(this.requireDb(), this.requireSession());
  }

  async markNotificationRead(id: string) {
    markNotificationRead(this.requireDb(), this.requireSession(), id, new Date().toISOString());
    await this.commit();
  }

  async markAllNotificationsRead() {
    markAllNotificationsRead(this.requireDb(), this.requireSession(), new Date().toISOString());
    await this.commit();
  }

  getReport(assessmentId: string) {
    return buildReport(this.requireDb(), this.requireSession(), assessmentId, new Date().toISOString());
  }

  exportVendorsCsv() {
    return exportVendorsCsv(this.requireDb(), this.requireSession());
  }

  exportFindingsCsv() {
    return exportFindingsCsv(this.requireDb(), this.requireSession());
  }

  exportAssessmentCsv(assessmentId: string) {
    return exportAssessmentCsv(this.requireDb(), this.requireSession(), assessmentId, new Date().toISOString());
  }

  currentUser() {
    const db = this.requireDb();
    const session = this.requireSession();
    const user = db.users.find((item) => item.id === session.userId);
    return user ? toPublicUser(user) : null;
  }

  organization() {
    const db = this.requireDb();
    const session = this.requireSession();
    return db.organizations.find((item) => item.id === session.organizationId && !item.deletedAt) ?? null;
  }

  devUsers() {
    return this.requireDb().users.map((user) => {
      const membership = this.db?.members.find((member) => member.userId === user.id && !member.deletedAt);
      return { ...toPublicUser(user), role: membership?.role ?? null };
    });
  }

  async devSwitchUser(userId: string) {
    this.session = sessionForUser(this.requireDb(), userId);
    await this.commit();
  }

  async devCreateSampleVendor() {
    const count = this.requireDb().vendors.length + 1;
    const vendor = createVendor(this.requireDb(), this.requireSession(), {
      name: `Sample Vendor ${count}`,
      website: "https://example.com",
      service: "Sample service for workflow testing",
      category: "other",
      businessOwner: "Alex Rivera",
      securityOwner: "Alex Rivera",
      criticality: "moderate",
      dataAccess: "internal",
      systemAccess: "none",
      reviewFrequency: "annual",
      notes: "Created from the development panel.",
    }, new Date().toISOString(), this.mode);
    await this.commit();
    return vendor;
  }

  async devForceStatus(assessmentId: string, status: AssessmentStatus) {
    devForceStatus(this.requireDb(), this.requireSession(), assessmentId, status, new Date().toISOString());
    await this.commit();
  }

  async devForceSubmit(assessmentId: string) {
    const db = this.requireDb();
    const session = this.requireSession();
    const assessment = getAssessmentRecord(db, session, assessmentId);
    for (const question of db.assessmentQuestions.filter((item) => item.assessmentId === assessment.id)) {
      const response = db.responses.find((item) => item.assessmentQuestionId === question.id);
      if (!response || isAnswered(question, response)) continue;
      if (question.type === "yes_no" || question.type === "yes_no_na") response.answerBoolean = true;
      else if (question.type === "multiple_choice") response.answerChoice = question.options[0] ?? "Yes";
      else response.answerText = "Submitted from the development panel.";
    }
    devForceStatus(db, session, assessment.id, "vendor_responded", new Date().toISOString());
    assessment.submittedAt = new Date().toISOString();
    await this.commit();
  }

  async devGenerateFinding(assessmentId: string) {
    const db = this.requireDb();
    const session = this.requireSession();
    const assessment = getAssessmentRecord(db, session, assessmentId);
    const finding = createFinding(db, session, {
      title: "Development sample finding",
      vendorId: assessment.vendorId,
      assessmentId: assessment.id,
      description: "Sample finding created from the development panel so the remediation flow can be exercised.",
      risk: "moderate",
      recommendation: "Confirm the control and attach evidence.",
      vendorResponse: "",
      ownerId: session.userId,
      targetDate: addDays(new Date().toISOString(), 30).slice(0, 10),
    }, new Date().toISOString());
    await this.commit();
    return finding;
  }

  async devSetRisk(assessmentId: string, level: RiskLevel) {
    setResidualOverride(this.requireDb(), this.requireSession(), assessmentId, { level, justification: "Development panel override for demonstration." }, new Date().toISOString());
    await this.commit();
  }

  async devShiftDueDates(days: number) {
    const db = this.requireDb();
    const session = this.requireSession();
    for (const assessment of db.assessments.filter((item) => item.organizationId === session.organizationId && !item.deletedAt)) {
      assessment.dueDate = addDays(`${assessment.dueDate}T00:00:00Z`, days).slice(0, 10);
    }
    await this.commit();
  }

  async reset(): Promise<void> {
    const seed = await buildSeed();
    this.db = seed.db;
    this.session = sessionForUser(seed.db, seed.defaultUserId);
    await this.blobs.clear();
    this.persist();
    this.emit();
  }

  protected requireDb(): Database {
    if (!this.db) throw new AppError("validation", "Workspace is still loading.");
    return this.db;
  }

  protected requireSession(): Session {
    if (!this.session) throw new AppError("unauthorized", "Sign in to continue.");
    return this.session;
  }

  protected async afterCommit(): Promise<void> {}

  protected async commit(): Promise<void> {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = this.writeChain;
    this.writeChain = gate;
    await previous;
    try {
      this.persist();
      await this.afterCommit();
      this.emit();
    } finally {
      release();
    }
  }

  protected persist(): void {
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, db: this.db, session: this.session }));
    } catch {
      throw new AppError("validation", "This browser could not save the workspace. Export your data and clear site storage if it is full.");
    }
  }

  protected emit(): void {
    for (const listener of this.listeners) listener();
  }
}
