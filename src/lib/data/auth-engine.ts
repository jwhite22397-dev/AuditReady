import { AppError } from "@/lib/domain/errors";
import { entitlementsFor, withinLimit } from "@/lib/domain/entitlements";
import { canManageRole } from "@/lib/domain/permissions";
import { createId, generateToken, hashPassword, hashToken, slugify } from "@/lib/domain/tokens";
import type { Database, Membership, Organization, Role, Session, User } from "@/lib/domain/types";
import { inviteSchema, memberRoleSchema, organizationSchema, signInSchema, signUpSchema } from "@/lib/domain/validation";
import { assertCan, audit, parseInput, requireUser, type EngineCtx } from "./context";
import { seedBuiltinTemplate } from "./templates";

export interface PublicUser {
  id: string;
  email: string;
  fullName: string;
  jobTitle: string;
}

export function toPublicUser(user: User): PublicUser {
  return { id: user.id, email: user.email, fullName: user.fullName, jobTitle: user.jobTitle };
}

export async function signUp(db: Database, input: unknown, now: string): Promise<User> {
  const parsed = parseInput(signUpSchema, input);
  const email = parsed.email.toLowerCase();
  if (db.users.some((user) => user.email.toLowerCase() === email)) {
    throw new AppError("conflict", "An account with that email already exists.");
  }
  const salt = generateToken(16);
  const user: User = {
    id: createId(),
    email,
    fullName: parsed.fullName,
    jobTitle: "",
    passwordHash: await hashPassword(parsed.password, salt),
    passwordSalt: salt,
    createdAt: now,
  };
  db.users.push(user);
  return user;
}

export async function signIn(db: Database, input: unknown): Promise<Session> {
  const parsed = parseInput(signInSchema, input);
  const user = db.users.find((item) => item.email.toLowerCase() === parsed.email.toLowerCase());
  const invalid = new AppError("unauthorized", "Email or password is incorrect.");
  if (!user?.passwordHash || !user.passwordSalt) throw invalid;
  const actual = await hashPassword(parsed.password, user.passwordSalt);
  if (actual !== user.passwordHash) throw invalid;
  return sessionForUser(db, user.id);
}

export function sessionForUser(db: Database, userId: string): Session {
  const user = db.users.find((item) => item.id === userId);
  if (!user) throw new AppError("unauthorized", "Sign in to continue.");
  const membership = db.members.find((item) => {
    if (item.userId !== userId || item.deletedAt) return false;
    const org = db.organizations.find((organization) => organization.id === item.organizationId && !organization.deletedAt);
    return Boolean(org);
  });
  return {
    userId,
    organizationId: membership?.organizationId ?? null,
    role: membership?.role ?? null,
  };
}

export function createOrganization(db: Database, session: Session, input: unknown, now: string, mode: EngineCtx["mode"]): Organization {
  const user = requireUser(db, session);
  const parsed = parseInput(organizationSchema, input);
  const base = slugify(parsed.name);
  let slug = base;
  let suffix = 2;
  while (db.organizations.some((org) => org.slug === slug && !org.deletedAt)) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
  const org: Organization = {
    id: createId(),
    name: parsed.name,
    slug,
    plan: mode === "demo" ? "business" : "starter",
    createdAt: now,
    deletedAt: null,
  };
  db.organizations.push(org);
  user.jobTitle = parsed.jobTitle;
  const membership: Membership = {
    id: createId(),
    organizationId: org.id,
    userId: user.id,
    role: "owner",
    createdAt: now,
    deletedAt: null,
  };
  db.members.push(membership);
  seedBuiltinTemplate(db, org.id, now);
  const scope = { org, user };
  audit(db, scope, {
    action: "organization.created",
    entityType: "organization",
    entityId: org.id,
    summary: `Workspace ${org.name} created.`,
    after: { name: org.name },
    now,
  });
  return org;
}

export function updateOrganization(db: Database, session: Session, input: { name: string }, now: string): Organization {
  const scope = assertCan(db, session, "org.update");
  const name = input.name.trim();
  if (name.length < 2) throw new AppError("validation", "Company name is required.");
  const before = scope.org.name;
  scope.org.name = name;
  audit(db, scope, {
    action: "organization.updated",
    entityType: "organization",
    entityId: scope.org.id,
    summary: `Workspace renamed to ${name}.`,
    before: { name: before },
    after: { name },
    now,
  });
  return scope.org;
}

export function deleteOrganization(db: Database, session: Session, confirmationName: string, now: string): void {
  const scope = assertCan(db, session, "org.delete");
  if (confirmationName.trim() !== scope.org.name) {
    throw new AppError("validation", "Type the workspace name to confirm deletion.");
  }
  scope.org.deletedAt = now;
  audit(db, scope, {
    action: "organization.deleted",
    entityType: "organization",
    entityId: scope.org.id,
    summary: `Workspace ${scope.org.name} marked for deletion. Operational access is removed. Retained rows stay in place until an operator purge.`,
    now,
  });
}

export interface MemberView {
  membershipId: string;
  userId: string;
  fullName: string;
  email: string;
  jobTitle: string;
  role: Role;
}

export function listMembers(db: Database, session: Session): MemberView[] {
  const scope = assertCan(db, session, "members.read");
  return db.members
    .filter((member) => member.organizationId === scope.org.id && !member.deletedAt)
    .map((member) => {
      const user = db.users.find((item) => item.id === member.userId);
      return {
        membershipId: member.id,
        userId: member.userId,
        fullName: user?.fullName ?? "Unknown",
        email: user?.email ?? "",
        jobTitle: user?.jobTitle ?? "",
        role: member.role,
      };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

export function updateMemberRole(db: Database, session: Session, membershipId: string, input: unknown, now: string): void {
  const scope = assertCan(db, session, "members.manage");
  const parsed = parseInput(memberRoleSchema, input);
  const member = db.members.find((item) => item.id === membershipId && item.organizationId === scope.org.id && !item.deletedAt);
  if (!member) throw new AppError("not_found", "Member not found.");
  if (!canManageRole(scope.membership.role, parsed.role) || !canManageRole(scope.membership.role, member.role)) {
    throw new AppError("forbidden", "You cannot assign that role.");
  }
  if (member.role === "owner" && parsed.role !== "owner" && ownerCount(db, scope.org.id) <= 1) {
    throw new AppError("conflict", "The workspace needs at least one owner.");
  }
  const before = member.role;
  member.role = parsed.role;
  audit(db, scope, {
    action: "member.role_changed",
    entityType: "membership",
    entityId: member.id,
    summary: `Role changed from ${before} to ${parsed.role}.`,
    before: { role: before },
    after: { role: parsed.role },
    now,
  });
}

export function removeMember(db: Database, session: Session, membershipId: string, now: string): void {
  const scope = assertCan(db, session, "members.manage");
  const member = db.members.find((item) => item.id === membershipId && item.organizationId === scope.org.id && !item.deletedAt);
  if (!member) throw new AppError("not_found", "Member not found.");
  if (!canManageRole(scope.membership.role, member.role)) throw new AppError("forbidden", "You cannot remove that member.");
  if (member.role === "owner" && ownerCount(db, scope.org.id) <= 1) {
    throw new AppError("conflict", "The workspace needs at least one owner.");
  }
  member.deletedAt = now;
  audit(db, scope, {
    action: "member.removed",
    entityType: "membership",
    entityId: member.id,
    summary: "Member removed from the workspace.",
    now,
  });
}

export async function inviteMember(
  db: Database,
  session: Session,
  input: unknown,
  now: string,
  mode: EngineCtx["mode"],
): Promise<{ inviteId: string; code: string; email: string; role: Exclude<Role, "owner"> }> {
  const scope = assertCan(db, session, "members.manage");
  const parsed = parseInput(inviteSchema, input);
  const limits = entitlementsFor(scope.org.plan, mode);
  const used = db.members.filter((member) => member.organizationId === scope.org.id && !member.deletedAt).length;
  const pending = db.invites.filter((invite) => invite.organizationId === scope.org.id && !invite.acceptedAt).length;
  if (!withinLimit(used + pending, limits.users)) {
    throw new AppError("conflict", "The plan user limit has been reached.");
  }
  const email = parsed.email.toLowerCase();
  const code = generateToken(18);
  const invite = {
    id: createId(),
    organizationId: scope.org.id,
    email,
    role: parsed.role,
    codeHash: await hashToken(code),
    createdBy: scope.user.id,
    createdAt: now,
    acceptedAt: null,
    expiresAt: new Date(Date.parse(now) + 14 * 86_400_000).toISOString(),
  };
  db.invites.push(invite);
  audit(db, scope, {
    action: "member.invited",
    entityType: "invite",
    entityId: invite.id,
    summary: `Invited ${email} as ${parsed.role}.`,
    now,
  });
  return { inviteId: invite.id, code, email, role: parsed.role };
}

export function assertUserLimit(db: Database, session: Session, mode: EngineCtx["mode"]): void {
  const scope = assertCan(db, session, "members.manage");
  const limits = entitlementsFor(scope.org.plan, mode);
  const used = db.members.filter((member) => member.organizationId === scope.org.id && !member.deletedAt).length;
  if (!withinLimit(used, limits.users)) throw new AppError("conflict", "The plan user limit has been reached.");
}

export async function acceptInvite(db: Database, session: Session, code: string, now: string): Promise<Membership> {
  const user = requireUser(db, session);
  const hash = await hashToken(code.trim());
  const invite = db.invites.find((item) => item.codeHash === hash && !item.acceptedAt);
  if (!invite) throw new AppError("not_found", "Invite not found.");
  if (Date.parse(invite.expiresAt) < Date.parse(now)) throw new AppError("expired", "This invite has expired.");
  const org = db.organizations.find((item) => item.id === invite.organizationId && !item.deletedAt);
  if (!org) throw new AppError("not_found", "Workspace not found.");
  if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
    throw new AppError("forbidden", "This invite was sent to a different email address.");
  }
  const existing = db.members.find((item) => item.organizationId === org.id && item.userId === user.id && !item.deletedAt);
  if (existing) {
    invite.acceptedAt = now;
    return existing;
  }
  const membership: Membership = {
    id: createId(),
    organizationId: org.id,
    userId: user.id,
    role: invite.role,
    createdAt: now,
    deletedAt: null,
  };
  db.members.push(membership);
  invite.acceptedAt = now;
  audit(db, { org, user }, {
    action: "member.joined",
    entityType: "membership",
    entityId: membership.id,
    summary: `${user.fullName} joined as ${invite.role}.`,
    now,
  });
  return membership;
}

function ownerCount(db: Database, organizationId: string): number {
  return db.members.filter((member) => member.organizationId === organizationId && member.role === "owner" && !member.deletedAt).length;
}

export function listInvites(db: Database, session: Session) {
  const scope = assertCan(db, session, "members.read");
  return db.invites
    .filter((invite) => invite.organizationId === scope.org.id && !invite.acceptedAt)
    .map((invite) => ({
      id: invite.id,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
    }));
}
