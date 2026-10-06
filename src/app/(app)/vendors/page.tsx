"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CATEGORY_LABEL } from "@/lib/domain/labels";
import { CRITICALITIES, RISK_LEVELS } from "@/lib/domain/types";
import { roleHasPermission } from "@/lib/domain/permissions";
import { downloadText, formatDate } from "@/lib/format";
import { useWorkspace } from "@/components/providers";
import { Button, EmptyState, PageHeader, RiskBadge, SelectInput, StatusBadge, TextInput } from "@/components/ui";
import type { VendorFilters } from "@/lib/data/vendors";

export default function VendorsPage() {
  const { repo, nonce } = useWorkspace();
  void nonce;
  const [filters, setFilters] = useState<VendorFilters>({ search: "", risk: "all", criticality: "all", status: "all", due: "all", owner: "all" });
  const session = repo?.getSession();
  const vendors = useMemo(() => (repo && nonce >= 0 ? repo.listVendors(filters) : []), [repo, filters, nonce]);
  if (!repo || !session) return null;
  const owners = [...new Set(repo.listVendors().flatMap((vendor) => [vendor.businessOwner, vendor.securityOwner].filter(Boolean)))];

  return (
    <div>
      <PageHeader
        title="Vendors"
        description="The registry of companies that touch your data or systems."
        actions={
          <>
            <Button variant="secondary" onClick={() => downloadText("vendors.csv", repo.exportVendorsCsv())}>Export CSV</Button>
            <Link href="/vendors/import" className="inline-flex h-9 items-center rounded-md border border-line-strong bg-card px-3 text-sm">Import</Link>
            {roleHasPermission(session.role, "vendors.write") ? <Link href="/vendors/new" className="inline-flex h-9 items-center rounded-md bg-teal px-3 text-sm font-medium text-white">New vendor</Link> : null}
          </>
        }
      />
      <div className="mb-3 grid gap-2 md:grid-cols-6">
        <TextInput aria-label="Search vendors" placeholder="Search by name" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
        <SelectInput aria-label="Risk" value={filters.risk} onChange={(event) => setFilters({ ...filters, risk: event.target.value as VendorFilters["risk"] })}>
          <option value="all">All risk</option>
          {RISK_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
        </SelectInput>
        <SelectInput aria-label="Criticality" value={filters.criticality} onChange={(event) => setFilters({ ...filters, criticality: event.target.value as VendorFilters["criticality"] })}>
          <option value="all">All criticality</option>
          {CRITICALITIES.map((level) => <option key={level} value={level}>{level}</option>)}
        </SelectInput>
        <SelectInput aria-label="Assessment status" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value as VendorFilters["status"] })}>
          <option value="all">All statuses</option>
          <option value="not_started">Not started</option>
          <option value="in_review">In review</option>
          <option value="remediation">Remediation</option>
          <option value="approved">Approved</option>
          <option value="approved_with_conditions">Approved with conditions</option>
          <option value="rejected">Rejected</option>
        </SelectInput>
        <SelectInput aria-label="Owner" value={filters.owner} onChange={(event) => setFilters({ ...filters, owner: event.target.value })}>
          <option value="all">All owners</option>
          {owners.map((owner) => <option key={owner} value={owner}>{owner}</option>)}
        </SelectInput>
        <SelectInput aria-label="Due" value={filters.due} onChange={(event) => setFilters({ ...filters, due: event.target.value as VendorFilters["due"] })}>
          <option value="all">Any due date</option>
          <option value="overdue">Overdue</option>
          <option value="due_30">Due in 30 days</option>
        </SelectInput>
      </div>
      {vendors.length === 0 ? <EmptyState title="No vendors match" body="Adjust the filters or add the first vendor." /> : (
        <div className="overflow-x-auto rounded-lg border border-line bg-card">
          <table className="w-full min-w-[760px] text-left text-sm">
            <caption className="sr-only">Vendor inventory</caption>
            <thead className="border-b border-line text-xs text-muted">
              <tr>
                {["Vendor", "Service", "Criticality", "Risk", "Status", "Next review"].map((heading) => <th key={heading} scope="col" className="px-3 py-2 font-medium">{heading}</th>)}
              </tr>
            </thead>
            <tbody>
              {vendors.map((vendor) => (
                <tr key={vendor.id} className="border-b border-line last:border-0 hover:bg-paper">
                  <th scope="row" className="px-3 py-2 font-medium"><Link href={`/vendors/${vendor.id}`}>{vendor.name}</Link><span className="mt-0.5 block text-xs font-normal text-muted">{CATEGORY_LABEL[vendor.category]}</span></th>
                  <td className="px-3 py-2">{vendor.service}</td>
                  <td className="px-3 py-2"><RiskBadge level={vendor.criticality} kind="criticality" /></td>
                  <td className="px-3 py-2"><RiskBadge level={vendor.overallRisk} /></td>
                  <td className="px-3 py-2"><StatusBadge status={vendor.assessmentStatus} /></td>
                  <td className="px-3 py-2">{formatDate(vendor.nextReviewAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
