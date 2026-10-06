import { AppError, publicErrorMessage } from "@/lib/domain/errors";
import { hashToken } from "@/lib/domain/tokens";
import { emptyDatabase, type Database } from "@/lib/domain/types";
import { MemoryRateLimiter } from "@/lib/security/rate-limit";
import type { SupabaseClient } from "@supabase/supabase-js";
import { flushChanges, type RowWriter } from "./diff";
import {
  assessmentFromRow,
  assessmentQuestionFromRow,
  documentFromRow,
  invitationFromRow,
  notificationFromRow,
  organizationFromRow,
  responseFromRow,
  vendorFromRow,
} from "./rows";
import { createServiceClient } from "./service";

const limiter = new MemoryRateLimiter();

export function assertPortalRate(token: string): void {
  const decision = limiter.consume(`portal:${token.slice(0, 12)}`, 120, 60 * 1000);
  if (!decision.allowed) throw new AppError("rate_limited", "Too many requests. Wait a moment and try again.");
}

export function portalErrorResponse(error: unknown): { status: number; body: { code: string; message: string } } {
  const message = publicErrorMessage(error);
  const code = error instanceof AppError ? error.code : "validation";
  const status = code === "not_found" ? 404 : code === "expired" ? 410 : code === "rate_limited" ? 429 : code === "forbidden" ? 403 : code === "conflict" ? 409 : 400;
  return { status, body: { code, message } };
}

export async function runPortal<T>(token: string, action: (db: Database, service: SupabaseClient) => Promise<T>): Promise<T> {
  const service = createServiceClient();
  const hash = await hashToken(token);
  const invitationResult = await service.from("invitations").select("*").eq("token_hash", hash).maybeSingle();
  if (invitationResult.error) throw new AppError("validation", "The invitation could not be loaded.");
  if (!invitationResult.data) throw new AppError("not_found", "This invitation link is not valid.");
  const invitation = invitationFromRow(invitationResult.data);
  const db = emptyDatabase();
  db.invitations = [invitation];

  const [orgResult, assessmentResult] = await Promise.all([
    service.from("organizations").select("*").eq("id", invitation.organizationId).maybeSingle(),
    service.from("assessments").select("*").eq("id", invitation.assessmentId).eq("organization_id", invitation.organizationId).maybeSingle(),
  ]);
  if (orgResult.error || assessmentResult.error || !orgResult.data || !assessmentResult.data) {
    throw new AppError("not_found", "This invitation is no longer available.");
  }
  const organization = organizationFromRow(orgResult.data);
  const assessment = assessmentFromRow(assessmentResult.data);
  if (organization.deletedAt || assessment.deletedAt || assessment.organizationId !== invitation.organizationId) {
    throw new AppError("not_found", "This invitation is no longer available.");
  }
  db.organizations = [organization];
  const vendorResult = await service.from("vendors").select("*").eq("id", assessment.vendorId).eq("organization_id", invitation.organizationId).maybeSingle();
  if (vendorResult.error || !vendorResult.data) throw new AppError("not_found", "This invitation is no longer available.");
  const vendor = vendorFromRow(vendorResult.data);
  const [assessments, questions, responses, documents, notifications] = await Promise.all([
    service.from("assessments").select("*").eq("vendor_id", vendor.id).eq("organization_id", invitation.organizationId),
    service.from("assessment_questions").select("*").eq("assessment_id", assessment.id).eq("organization_id", invitation.organizationId),
    service.from("responses").select("*").eq("assessment_id", assessment.id).eq("organization_id", invitation.organizationId),
    service.from("documents").select("*").eq("assessment_id", assessment.id).eq("organization_id", invitation.organizationId),
    service.from("notifications").select("*").eq("organization_id", invitation.organizationId).eq("user_id", assessment.ownerId),
  ]);
  for (const result of [assessments, questions, responses, documents, notifications]) {
    if (result.error) throw new AppError("validation", "The invitation could not be loaded.");
  }
  db.vendors = [vendor];
  db.assessments = (assessments.data ?? []).map((row) => assessmentFromRow(row)).filter((item) => item.organizationId === invitation.organizationId);
  db.assessmentQuestions = (questions.data ?? []).map((row) => assessmentQuestionFromRow(row));
  db.responses = (responses.data ?? []).map((row) => responseFromRow(row));
  db.documents = (documents.data ?? []).map((row) => documentFromRow(row));
  db.notifications = (notifications.data ?? []).map((row) => notificationFromRow(row));

  const before = structuredClone(db);
  const result = await action(db, service);
  await flushChanges(serviceWriter(service), before, db, invitation.organizationId);
  return result;
}

function serviceWriter(service: SupabaseClient): RowWriter {
  return {
    insert: async (table, rows) => {
      const { error } = await service.from(table).insert(rows);
      if (error) {
        console.error(error.message);
        throw new AppError("validation", "The questionnaire could not be saved.");
      }
    },
    update: async (table, row) => {
      const { error } = await service.from(table).update(row).eq("id", String(row.id));
      if (error) {
        console.error(error.message);
        throw new AppError("validation", "The questionnaire could not be saved.");
      }
    },
  };
}
