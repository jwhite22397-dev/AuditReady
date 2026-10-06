"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ROLE_LABEL } from "@/lib/domain/labels";
import { ROLES, type Role } from "@/lib/domain/types";
import { roleHasPermission } from "@/lib/domain/permissions";
import { entitlementsFor } from "@/lib/domain/entitlements";
import { publicErrorMessage } from "@/lib/domain/errors";
import { useWorkspace } from "@/components/providers";
import { Banner, Button, Field, PageHeader, SelectInput, TextInput } from "@/components/ui";

export default function SettingsPage() {
  const { repo, nonce } = useWorkspace();
  const router = useRouter();
  const [error, setError] = useState("");
  const [invite, setInvite] = useState<{ email: string; role: "admin" | "analyst" | "viewer" }>({ email: "", role: "analyst" });
  const [code, setCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [confirmName, setConfirmName] = useState("");
  void nonce;
  if (!repo) return null;
  const org = repo.organization();
  const session = repo.getSession();
  if (!org || !session) return null;
  const members = repo.listMembers();
  const invites = repo.listInvites();
  const canManage = roleHasPermission(session.role, "members.manage");
  const plan = entitlementsFor(org.plan, repo.mode);
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description={repo.mode === "demo" ? `${org.name} · demo workspaces are not limited by plan.` : `${org.name} · ${plan.label} limits apply to this workspace.`} />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <section className="rounded-lg border border-line bg-card p-4 text-sm">
        <h2 className="font-semibold">Plan</h2>
        <p className="mt-1">{plan.label} · {plan.priceLabel}. Billing is not connected. Changing the plan in the client does not raise limits in production; the database plan is the source of truth.</p>
      </section>
      <section>
        <h2 className="text-sm font-semibold">Members</h2>
        <ul className="mt-2 divide-y divide-line rounded-lg border border-line bg-card">
          {members.map((member) => (
            <li key={member.membershipId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span>{member.fullName}<span className="block text-muted">{member.email} · {member.jobTitle}</span></span>
              {canManage ? (
                <SelectInput className="max-w-36" value={member.role} aria-label={`Role for ${member.fullName}`} onChange={(event) => repo.updateMemberRole(member.membershipId, event.target.value as Role).catch((caught) => setError(publicErrorMessage(caught)))}>
                  {ROLES.map((role) => <option key={role} value={role}>{ROLE_LABEL[role]}</option>)}
                </SelectInput>
              ) : <span>{ROLE_LABEL[member.role]}</span>}
            </li>
          ))}
        </ul>
      </section>
      {canManage ? (
        <form className="grid max-w-xl gap-2" onSubmit={(event) => {
          event.preventDefault();
          repo.inviteMember(invite).then((result) => {
            setCode(result.code);
            setInvite({ email: "", role: "analyst" });
          }).catch((caught) => setError(publicErrorMessage(caught)));
        }}>
          <h2 className="text-sm font-semibold">Invite</h2>
          <p className="text-sm text-muted">Demo mode shows the invite code here because email is not configured. The code is stored only as a hash.</p>
          <Field label="Email"><TextInput type="email" value={invite.email} onChange={(event) => setInvite({ ...invite, email: event.target.value })} /></Field>
          <Field label="Role">
            <SelectInput value={invite.role} onChange={(event) => setInvite({ ...invite, role: event.target.value as typeof invite.role })}>
              <option value="admin">Admin</option>
              <option value="analyst">Analyst</option>
              <option value="viewer">Viewer</option>
            </SelectInput>
          </Field>
          <Button type="submit">Create invite</Button>
          {code ? <Banner>Invite code, shown once: {code}</Banner> : null}
          {invites.length > 0 ? <ul className="text-sm text-muted">{invites.map((item) => <li key={item.id}>{item.email} · {item.role}</li>)}</ul> : null}
        </form>
      ) : null}
      <form className="grid max-w-xl gap-2" onSubmit={(event) => {
        event.preventDefault();
        repo.acceptInvite(joinCode).then(() => {
          setJoinCode("");
          setError("");
          router.refresh();
        }).catch((caught) => setError(publicErrorMessage(caught)));
      }}>
        <h2 className="text-sm font-semibold">Join a workspace</h2>
        <p className="text-sm text-muted">Paste an invite code sent to this account&apos;s email. The code is checked against its stored hash.</p>
        <Field label="Invite code"><TextInput value={joinCode} onChange={(event) => setJoinCode(event.target.value)} autoComplete="off" /></Field>
        <Button type="submit" variant="secondary">Accept invite</Button>
      </form>
      {roleHasPermission(session.role, "org.delete") ? (
        <form className="max-w-xl space-y-2 rounded-lg border border-critical/30 p-4" onSubmit={(event) => {
          event.preventDefault();
          repo.deleteOrganization(confirmName).then(() => router.push("/")).catch((caught) => setError(publicErrorMessage(caught)));
        }}>
          <h2 className="font-semibold">Delete workspace</h2>
          <p className="text-sm text-muted">This removes access immediately. Rows stay in place for an operator purge. Type {org.name} to confirm. Demo data can be restored from the development panel.</p>
          <TextInput aria-label="Confirm workspace name" value={confirmName} onChange={(event) => setConfirmName(event.target.value)} />
          <Button type="submit" variant="danger">Delete workspace</Button>
        </form>
      ) : null}
    </div>
  );
}
