import type { Role } from "./types";

export const PERMISSIONS = [
  "org.read",
  "org.update",
  "org.delete",
  "org.billing",
  "members.read",
  "members.manage",
  "vendors.read",
  "vendors.write",
  "assessments.read",
  "assessments.write",
  "questionnaires.read",
  "questionnaires.write",
  "findings.read",
  "findings.write",
  "findings.accept_high_risk",
  "documents.read",
  "documents.write",
  "reports.read",
  "reports.write",
  "audit.read",
  "decisions.write",
  "decisions.approve_high",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ANALYST: Permission[] = [
  "org.read",
  "members.read",
  "vendors.read",
  "vendors.write",
  "assessments.read",
  "assessments.write",
  "questionnaires.read",
  "findings.read",
  "findings.write",
  "documents.read",
  "documents.write",
  "reports.read",
  "reports.write",
  "audit.read",
  "decisions.write",
];

const ADMIN: Permission[] = [
  ...ANALYST,
  "org.update",
  "members.manage",
  "questionnaires.write",
  "findings.accept_high_risk",
  "decisions.approve_high",
];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[] | "*"> = {
  owner: "*",
  admin: ADMIN,
  analyst: ANALYST,
  viewer: [
    "org.read",
    "members.read",
    "vendors.read",
    "assessments.read",
    "questionnaires.read",
    "findings.read",
    "documents.read",
    "reports.read",
    "audit.read",
  ],
};

export function roleHasPermission(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  const granted = ROLE_PERMISSIONS[role];
  if (granted === "*") return true;
  return granted.includes(permission);
}

export function permissionsForRole(role: Role): readonly Permission[] {
  const granted = ROLE_PERMISSIONS[role];
  if (granted === "*") return PERMISSIONS;
  return granted;
}

export function canManageRole(actor: Role, next: Role): boolean {
  if (actor === "owner") return true;
  if (actor === "admin") return next !== "owner";
  return false;
}
