import { AppError } from "@/lib/domain/errors";
import { validateUpload } from "@/lib/domain/filenames";
import { emptyDatabase, type Database, type DocumentType, type EvidenceDocument, type Session } from "@/lib/domain/types";
import { organizationSchema, signUpSchema, zodMessage } from "@/lib/domain/validation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { flushChanges, type RowWriter } from "@/lib/supabase/diff";
import { readRows } from "@/lib/supabase/rows";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDocument, assertDocumentAccess } from "./documents";
import { DemoRepository } from "./demo-repository";
import { MemoryBlobStore } from "./blob-store";
import { MemoryStorage } from "./storage";
import { sessionForUser } from "./auth-engine";
import { seedBuiltinTemplate } from "./templates";

const ACTIVE_ORG_PREFIX = "auditready.active-org.";

export class SupabaseRepository extends DemoRepository {
  override readonly mode = "supabase" as const;
  private readonly client: SupabaseClient;
  private shadow: Database = emptyDatabase();
  private userId: string | null = null;

  constructor() {
    super(new MemoryStorage(), new MemoryBlobStore());
    this.client = createSupabaseBrowserClient();
  }

  override async init(): Promise<void> {
    await this.hydrate();
    this.persist();
  }

  override async signIn(email: string, password: string): Promise<Session> {
    const decision = this.limiter.consume(`login:${email.toLowerCase()}`, 8, 15 * 60 * 1000);
    if (!decision.allowed) throw new AppError("rate_limited", "Too many sign-in attempts. Wait a few minutes and try again.");
    const { error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw new AppError("unauthorized", "Email or password is incorrect.");
    await this.hydrate();
    this.persist();
    this.emit();
    return this.getSession()!;
  }

  override async signUp(input: { fullName: string; email: string; password: string }): Promise<Session> {
    const parsed = signUpSchema.safeParse(input);
    if (!parsed.success) throw new AppError("validation", zodMessage(parsed.error));
    const { data, error } = await this.client.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: { data: { full_name: parsed.data.fullName } },
    });
    if (error) {
      const exists = /already/i.test(error.message);
      throw new AppError(exists ? "conflict" : "validation", exists ? "An account with that email already exists." : "An account could not be created.");
    }
    if (!data.session) throw new AppError("validation", "Check your email to confirm the account, then sign in.");
    await this.hydrate();
    this.persist();
    this.emit();
    return this.getSession()!;
  }

  override async signOut(): Promise<void> {
    await this.client.auth.signOut();
    this.db = emptyDatabase();
    this.shadow = emptyDatabase();
    this.session = null;
    this.persist();
    this.emit();
  }

  override async requestPasswordReset(email: string): Promise<{ message: string }> {
    if (typeof window !== "undefined") {
      await this.client.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/login` });
    }
    return { message: "If an account exists, a reset link has been sent." };
  }

  override async createOrganization(input: { name: string; jobTitle: string }) {
    const parsed = organizationSchema.safeParse(input);
    if (!parsed.success) throw new AppError("validation", zodMessage(parsed.error));
    const { data, error } = await this.client.rpc("create_workspace", {
      p_name: parsed.data.name,
      p_job_title: parsed.data.jobTitle,
    });
    if (error || typeof data !== "string") throw new AppError("validation", "The workspace could not be created.");
    await this.hydrate();
    const db = this.requireDb();
    seedBuiltinTemplate(db, data, new Date().toISOString());
    const membership = db.members.find((member) => member.organizationId === data && member.userId === this.userId && !member.deletedAt);
    if (membership) this.session = { userId: membership.userId, organizationId: data, role: membership.role };
    await this.commit();
    const organization = db.organizations.find((item) => item.id === data);
    if (!organization) throw new AppError("validation", "The workspace could not be created.");
    return organization;
  }

  override async acceptInvite(code: string) {
    const { data, error } = await this.client.rpc("accept_workspace_invite", { p_code: code.trim() });
    if (error || typeof data !== "string") throw new AppError("not_found", "Invite not found.");
    await this.hydrate();
    const membership = this.requireDb().members.find((member) => member.id === data && !member.deletedAt);
    if (membership) this.session = { userId: membership.userId, organizationId: membership.organizationId, role: membership.role };
    this.persist();
    this.emit();
  }

  override async getPortal(token: string): Promise<Awaited<ReturnType<DemoRepository["getPortal"]>>> {
    return this.portalJson(token, "");
  }

  override async savePortalAnswers(token: string, answers: Parameters<DemoRepository["savePortalAnswers"]>[1]) {
    await this.portalJson(token, "", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ answers }) });
  }

  override async submitPortal(token: string) {
    await this.portalJson(token, "/submit", { method: "POST" });
  }

  override async addPortalDocument(token: string, file: File, input: { questionId?: string | null; documentType: DocumentType; description?: string }) {
    const problem = validateUpload(file.name, file.type || "application/octet-stream", file.size);
    if (problem) throw new AppError("validation", problem);
    const body = new FormData();
    body.set("file", file);
    body.set("documentType", input.documentType);
    if (input.questionId) body.set("questionId", input.questionId);
    if (input.description) body.set("description", input.description);
    return this.portalJson<EvidenceDocument>(token, "/documents", { method: "POST", body });
  }

  override async addUploadedDocument(file: File, input: { vendorId: string; assessmentId?: string | null; assessmentQuestionId?: string | null; findingId?: string | null; documentType: DocumentType; description?: string }) {
    const problem = validateUpload(file.name, file.type || "application/octet-stream", file.size);
    if (problem) throw new AppError("validation", problem);
    const document = addDocument(this.requireDb(), this.requireSession(), {
      ...input,
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      sizeBytes: file.size,
    }, new Date().toISOString());
    const upload = await this.client.storage.from("evidence").upload(document.storagePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (upload.error) {
      this.rollbackDocument(document.id);
      throw new AppError("validation", "The file could not be stored.");
    }
    await this.commit();
    return document;
  }

  override async getDocumentFile(id: string, portalToken?: string) {
    if (portalToken) {
      const response = await fetch(`/api/portal/${encodeURIComponent(portalToken)}/documents/${encodeURIComponent(id)}`);
      if (!response.ok) throw new AppError("not_found", "Document not found.");
      const fileName = fileNameFromDisposition(response.headers.get("content-disposition")) ?? "evidence";
      return { fileName, contentType: response.headers.get("content-type") ?? "application/octet-stream", data: await response.arrayBuffer() };
    }
    const document = assertDocumentAccess(this.requireDb(), this.requireSession(), id);
    const signed = await this.client.storage.from("evidence").createSignedUrl(document.storagePath, 60);
    if (signed.error || !signed.data?.signedUrl) throw new AppError("not_found", "This file could not be opened.");
    const response = await fetch(signed.data.signedUrl);
    if (!response.ok) throw new AppError("not_found", "This file could not be opened.");
    return { fileName: document.fileName, contentType: document.contentType, data: await response.arrayBuffer() };
  }

  override async reset(): Promise<void> {
    throw new AppError("forbidden", "Demo reset is unavailable when Supabase is configured.");
  }

  protected override async afterCommit(): Promise<void> {
    if (!this.db) return;
    const next = structuredClone(this.db);
    await flushChanges(this.writer(), this.shadow, next);
    this.shadow = next;
  }

  protected override persist(): void {
    if (typeof window === "undefined" || !this.userId) return;
    const key = `${ACTIVE_ORG_PREFIX}${this.userId}`;
    if (this.session?.organizationId) window.localStorage.setItem(key, this.session.organizationId);
    else window.localStorage.removeItem(key);
  }

  private async hydrate(): Promise<void> {
    const { data } = await this.client.auth.getUser();
    const db = emptyDatabase();
    this.userId = data.user?.id ?? null;
    if (!data.user) {
      this.db = db;
      this.session = null;
      this.shadow = structuredClone(db);
      return;
    }
    const profile = await this.client.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
    this.raise(profile.error);
    if (profile.data) db.users.push(...readRows<Database["users"][number]>("users", [profile.data]));
    const ownMemberships = await this.client.from("memberships").select("organization_id, deleted_at").eq("user_id", data.user.id);
    this.raise(ownMemberships.error);
    const orgIds = (ownMemberships.data ?? [])
      .filter((row) => !row.deleted_at)
      .map((row) => String(row.organization_id));
    if (orgIds.length > 0) await this.loadOrganizations(db, orgIds);
    this.db = db;
    this.session = sessionForUser(db, data.user.id);
    const stored = typeof window === "undefined" ? null : window.localStorage.getItem(`${ACTIVE_ORG_PREFIX}${data.user.id}`);
    const membership = stored ? db.members.find((member) => member.organizationId === stored && member.userId === data.user?.id && !member.deletedAt) : undefined;
    if (membership) this.session = { userId: membership.userId, organizationId: membership.organizationId, role: membership.role };
    this.shadow = structuredClone(db);
  }

  private async loadOrganizations(db: Database, orgIds: string[]): Promise<void> {
    const specs: Array<{ key: keyof Database; filter: "id" | "organization_id" }> = [
      { key: "organizations", filter: "id" },
      { key: "members", filter: "organization_id" },
      { key: "invites", filter: "organization_id" },
      { key: "templates", filter: "organization_id" },
      { key: "sections", filter: "organization_id" },
      { key: "questions", filter: "organization_id" },
      { key: "vendors", filter: "organization_id" },
      { key: "contacts", filter: "organization_id" },
      { key: "assessments", filter: "organization_id" },
      { key: "assessmentQuestions", filter: "organization_id" },
      { key: "responses", filter: "organization_id" },
      { key: "documents", filter: "organization_id" },
      { key: "findings", filter: "organization_id" },
      { key: "remediations", filter: "organization_id" },
      { key: "riskAcceptances", filter: "organization_id" },
      { key: "decisions", filter: "organization_id" },
      { key: "invitations", filter: "organization_id" },
      { key: "notifications", filter: "organization_id" },
    ];
    const tableFor: Record<string, string> = {
      organizations: "organizations",
      members: "memberships",
      invites: "org_invites",
      templates: "questionnaire_templates",
      sections: "questionnaire_sections",
      questions: "questions",
      vendors: "vendors",
      contacts: "vendor_contacts",
      assessments: "assessments",
      assessmentQuestions: "assessment_questions",
      responses: "responses",
      documents: "documents",
      findings: "findings",
      remediations: "remediations",
      riskAcceptances: "risk_acceptances",
      decisions: "assessment_decisions",
      invitations: "invitations",
      notifications: "notifications",
    };
    await Promise.all(specs.map(async (spec) => {
      const column = spec.filter === "id" ? "id" : "organization_id";
      const result = await this.client.from(tableFor[spec.key] ?? spec.key).select("*").in(column, orgIds);
      this.raise(result.error);
      assignRows(db, spec.key, result.data ?? []);
    }));
    const audit = await this.client.from("audit_events").select("*").in("organization_id", orgIds).order("created_at", { ascending: false }).limit(500);
    this.raise(audit.error);
    assignRows(db, "auditEvents", audit.data ?? []);
    const userIds = [...new Set(db.members.map((member) => member.userId))];
    if (userIds.length > 0) {
      const profiles = await this.client.from("profiles").select("*").in("id", userIds);
      this.raise(profiles.error);
      db.users = readRows("users", profiles.data ?? []);
    }
  }

  private writer(): RowWriter {
    return {
      insert: async (table, rows) => {
        const { error } = await this.client.from(table).insert(rows);
        this.raise(error);
      },
      update: async (table, row) => {
        const { error } = await this.client.from(table).update(row).eq("id", String(row.id));
        this.raise(error);
      },
    };
  }

  private raise(error: { message: string } | null): void {
    if (!error) return;
    console.error(error.message);
    if (/row-level security|permission denied/i.test(error.message)) {
      throw new AppError("forbidden", "You do not have permission to do that.");
    }
    throw new AppError("validation", "The change could not be saved.");
  }

  private rollbackDocument(id: string): void {
    const db = this.requireDb();
    db.documents = db.documents.filter((document) => document.id !== id);
    for (const response of db.responses) response.documentIds = response.documentIds.filter((item) => item !== id);
    db.auditEvents = db.auditEvents.filter((event) => event.entityId !== id);
  }

  private async portalJson<T>(token: string, path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`/api/portal/${encodeURIComponent(token)}${path}`, init);
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const message = body && typeof body === "object" && "message" in body && typeof body.message === "string" ? body.message : "The request failed.";
      const code = body && typeof body === "object" && "code" in body && typeof body.code === "string" ? body.code : "validation";
      throw new AppError(isErrorCode(code) ? code : "validation", message);
    }
    return body as T;
  }
}

function assignRows(db: Database, key: keyof Database, rows: Record<string, unknown>[]): void {
  const parsed = readRows(key, rows);
  if (key === "users") db.users = parsed as Database["users"];
  else if (key === "organizations") db.organizations = parsed as Database["organizations"];
  else if (key === "members") db.members = parsed as Database["members"];
  else if (key === "invites") db.invites = parsed as Database["invites"];
  else if (key === "templates") db.templates = parsed as Database["templates"];
  else if (key === "sections") db.sections = parsed as Database["sections"];
  else if (key === "questions") db.questions = parsed as Database["questions"];
  else if (key === "vendors") db.vendors = parsed as Database["vendors"];
  else if (key === "contacts") db.contacts = parsed as Database["contacts"];
  else if (key === "assessments") db.assessments = parsed as Database["assessments"];
  else if (key === "assessmentQuestions") db.assessmentQuestions = parsed as Database["assessmentQuestions"];
  else if (key === "responses") db.responses = parsed as Database["responses"];
  else if (key === "documents") db.documents = parsed as Database["documents"];
  else if (key === "findings") db.findings = parsed as Database["findings"];
  else if (key === "remediations") db.remediations = parsed as Database["remediations"];
  else if (key === "riskAcceptances") db.riskAcceptances = parsed as Database["riskAcceptances"];
  else if (key === "decisions") db.decisions = parsed as Database["decisions"];
  else if (key === "invitations") db.invitations = parsed as Database["invitations"];
  else if (key === "notifications") db.notifications = parsed as Database["notifications"];
  else if (key === "auditEvents") db.auditEvents = parsed as Database["auditEvents"];
}

function fileNameFromDisposition(value: string | null): string | null {
  if (!value) return null;
  const match = /filename="([^"]+)"/.exec(value);
  return match?.[1] ?? null;
}

function isErrorCode(value: string): value is AppError["code"] {
  return ["unauthorized", "forbidden", "not_found", "validation", "conflict", "expired", "rate_limited"].includes(value);
}
