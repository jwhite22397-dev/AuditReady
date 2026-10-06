import { AppError } from "@/lib/domain/errors";
import { roleHasPermission, type Permission } from "@/lib/domain/permissions";
import { createId } from "@/lib/domain/tokens";
import type { AuditEvent, Database, Membership, Organization, Session, User } from "@/lib/domain/types";
import { zodMessage } from "@/lib/domain/validation";
import type { ZodType } from "zod";

export interface EngineCtx {
  session: Session;
  now: string;
  mode: "demo" | "supabase";
}

export function ctx(session: Session, now: string, mode: EngineCtx["mode"] = "demo"): EngineCtx {
  return { session, now, mode };
}

export function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new AppError("validation", zodMessage(result.error));
  return result.data;
}

export function requireUser(db: Database, session: Session): User {
  const user = db.users.find((item) => item.id === session.userId);
  if (!user) throw new AppError("unauthorized", "Sign in to continue.");
  return user;
}

export function requireOrg(db: Database, session: Session): { org: Organization; membership: Membership; user: User } {
  const user = requireUser(db, session);
  if (!session.organizationId) throw new AppError("unauthorized", "Create a workspace to continue.");
  const org = db.organizations.find((item) => item.id === session.organizationId && !item.deletedAt);
  if (!org) throw new AppError("not_found", "Workspace not found.");
  const membership = db.members.find(
    (item) => item.organizationId === org.id && item.userId === user.id && !item.deletedAt,
  );
  if (!membership) throw new AppError("forbidden", "You do not belong to this workspace.");
  return { org, membership, user };
}

export function assertCan(db: Database, session: Session, permission: Permission): { org: Organization; membership: Membership; user: User } {
  const scope = requireOrg(db, session);
  if (!roleHasPermission(scope.membership.role, permission)) {
    throw new AppError("forbidden", "You do not have permission to do that.");
  }
  return scope;
}

export function actorLabel(user: User): string {
  return user.fullName || user.email;
}

export function audit(
  db: Database,
  scope: { org: Organization; user: User },
  event: {
    action: string;
    entityType: string;
    entityId: string;
    summary: string;
    before?: unknown;
    after?: unknown;
    now: string;
  },
): AuditEvent {
  const entry: AuditEvent = {
    id: createId(),
    organizationId: scope.org.id,
    actorId: scope.user.id,
    actorLabel: actorLabel(scope.user),
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    summary: event.summary,
    before: event.before ?? null,
    after: event.after ?? null,
    createdAt: event.now,
  };
  db.auditEvents.push(entry);
  return entry;
}

export function auditExternal(
  db: Database,
  event: {
    organizationId: string;
    actorLabel: string;
    action: string;
    entityType: string;
    entityId: string;
    summary: string;
    before?: unknown;
    after?: unknown;
    now: string;
  },
): void {
  db.auditEvents.push({
    id: createId(),
    organizationId: event.organizationId,
    actorId: null,
    actorLabel: event.actorLabel,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    summary: event.summary,
    before: event.before ?? null,
    after: event.after ?? null,
    createdAt: event.now,
  });
}

export function notify(
  db: Database,
  input: {
    organizationId: string;
    userId: string;
    kind: string;
    dedupeKey: string;
    title: string;
    body: string;
    href: string;
    now: string;
  },
): void {
  if (db.notifications.some((item) => item.dedupeKey === input.dedupeKey)) return;
  db.notifications.push({
    id: createId(),
    organizationId: input.organizationId,
    userId: input.userId,
    kind: input.kind,
    dedupeKey: input.dedupeKey,
    title: input.title,
    body: input.body,
    href: input.href,
    readAt: null,
    createdAt: input.now,
  });
}

export function activeVendors(db: Database, organizationId: string) {
  return db.vendors.filter((vendor) => vendor.organizationId === organizationId && !vendor.deletedAt);
}

export function activeAssessments(db: Database, organizationId: string) {
  return db.assessments.filter((assessment) => assessment.organizationId === organizationId && !assessment.deletedAt);
}
