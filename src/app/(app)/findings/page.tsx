"use client";

import Link from "next/link";
import { useState } from "react";
import { FINDING_STATUSES, RISK_LEVELS } from "@/lib/domain/types";
import { FINDING_STATUS_LABEL } from "@/lib/domain/labels";
import { downloadText, formatDate } from "@/lib/format";
import { useWorkspace } from "@/components/providers";
import { Button, EmptyState, FindingBadge, PageHeader, RiskBadge, SelectInput } from "@/components/ui";

export default function FindingsPage() {
  const { repo, nonce } = useWorkspace();
  const [status, setStatus] = useState<"all" | "open" | (typeof FINDING_STATUSES)[number]>("open");
  const [risk, setRisk] = useState<(typeof RISK_LEVELS)[number] | "all">("all");
  void nonce;
  if (!repo) return null;
  const findings = repo.listFindings({ status, risk });
  return (
    <div>
      <PageHeader title="Findings" description="Gaps found during vendor reviews." actions={<Button variant="secondary" onClick={() => downloadText("findings.csv", repo.exportFindingsCsv())}>Export CSV</Button>} />
      <div className="mb-3 flex gap-2">
        <SelectInput aria-label="Finding status" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
          <option value="open">Open</option>
          <option value="all">All</option>
          {FINDING_STATUSES.map((item) => <option key={item} value={item}>{FINDING_STATUS_LABEL[item]}</option>)}
        </SelectInput>
        <SelectInput aria-label="Finding risk" value={risk} onChange={(event) => setRisk(event.target.value as typeof risk)}>
          <option value="all">All risk</option>
          {RISK_LEVELS.map((item) => <option key={item} value={item}>{item}</option>)}
        </SelectInput>
      </div>
      {findings.length === 0 ? <EmptyState title="No findings" body="Create findings from an assessment response." /> : (
        <div className="overflow-x-auto rounded-lg border border-line bg-card">
          <table className="w-full min-w-[680px] text-left text-sm">
            <caption className="sr-only">Findings</caption>
            <thead className="border-b border-line text-xs text-muted"><tr>{["Finding", "Vendor", "Risk", "Status", "Target"].map((heading) => <th key={heading} scope="col" className="px-3 py-2 font-medium">{heading}</th>)}</tr></thead>
            <tbody>
              {findings.map((finding) => (
                <tr key={finding.id} className="border-b border-line last:border-0">
                  <th scope="row" className="px-3 py-2 font-medium"><Link href={`/findings/${finding.id}`}>{finding.reference} {finding.title}</Link></th>
                  <td className="px-3 py-2">{finding.vendorName}</td>
                  <td className="px-3 py-2"><RiskBadge level={finding.risk} /></td>
                  <td className="px-3 py-2"><FindingBadge status={finding.status} /></td>
                  <td className="px-3 py-2">{formatDate(finding.targetDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
