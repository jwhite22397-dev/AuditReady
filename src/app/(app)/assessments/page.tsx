"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ASSESSMENT_STATUSES, RISK_LEVELS } from "@/lib/domain/types";
import { ASSESSMENT_STATUS_LABEL } from "@/lib/domain/labels";
import { roleHasPermission } from "@/lib/domain/permissions";
import { dueLabel } from "@/lib/format";
import { useWorkspace } from "@/components/providers";
import { EmptyState, PageHeader, RiskBadge, SelectInput, StatusBadge, TextInput } from "@/components/ui";
import type { AssessmentFilters } from "@/lib/data/assessments";

export default function AssessmentsPage() {
  const { repo, nonce } = useWorkspace();
  void nonce;
  const [filters, setFilters] = useState<AssessmentFilters>({ search: "", status: "all", ownerId: "all", risk: "all", due: "all" });
  const session = repo?.getSession();
  const rows = useMemo(() => (repo && nonce >= 0 ? repo.listAssessments(filters) : []), [repo, filters, nonce]);
  if (!repo || !session) return null;
  const members = repo.listMembers();
  return (
    <div>
      <PageHeader title="Assessments" description="Each assessment is one review of one vendor." actions={roleHasPermission(session.role, "assessments.write") ? <Link href="/assessments/new" className="inline-flex h-9 items-center rounded-md bg-teal px-3 text-sm font-medium text-white">New assessment</Link> : null} />
      <div className="mb-3 grid gap-2 md:grid-cols-5">
        <TextInput aria-label="Search assessments" placeholder="Search" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
        <SelectInput aria-label="Status" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value as AssessmentFilters["status"] })}>
          <option value="all">All statuses</option>
          {ASSESSMENT_STATUSES.map((status) => <option key={status} value={status}>{ASSESSMENT_STATUS_LABEL[status]}</option>)}
        </SelectInput>
        <SelectInput aria-label="Owner" value={filters.ownerId} onChange={(event) => setFilters({ ...filters, ownerId: event.target.value })}>
          <option value="all">All owners</option>
          {members.map((member) => <option key={member.userId} value={member.userId}>{member.fullName}</option>)}
        </SelectInput>
        <SelectInput aria-label="Risk" value={filters.risk} onChange={(event) => setFilters({ ...filters, risk: event.target.value as AssessmentFilters["risk"] })}>
          <option value="all">All risk</option>
          {RISK_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
        </SelectInput>
        <SelectInput aria-label="Due" value={filters.due} onChange={(event) => setFilters({ ...filters, due: event.target.value as AssessmentFilters["due"] })}>
          <option value="all">Any due date</option>
          <option value="overdue">Overdue</option>
          <option value="due_30">Due in 30 days</option>
        </SelectInput>
      </div>
      {rows.length === 0 ? <EmptyState title="No assessments" body="Create one from a vendor when you are ready to collect answers." /> : (
        <div className="overflow-x-auto rounded-lg border border-line bg-card">
          <table className="w-full min-w-[720px] text-left text-sm">
            <caption className="sr-only">Assessments</caption>
            <thead className="border-b border-line text-xs text-muted"><tr>{["Assessment", "Vendor", "Owner", "Status", "Risk", "Due"].map((heading) => <th key={heading} scope="col" className="px-3 py-2 font-medium">{heading}</th>)}</tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-line last:border-0 hover:bg-paper">
                  <th scope="row" className="px-3 py-2 font-medium"><Link href={`/assessments/${row.id}`}>{row.name}</Link></th>
                  <td className="px-3 py-2">{row.vendorName}</td>
                  <td className="px-3 py-2">{row.ownerName}</td>
                  <td className="px-3 py-2"><StatusBadge status={row.status} /></td>
                  <td className="px-3 py-2"><RiskBadge level={row.residual} /></td>
                  <td className="px-3 py-2">{dueLabel(row.dueDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
