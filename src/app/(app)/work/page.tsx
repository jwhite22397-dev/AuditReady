"use client";

import Link from "next/link";
import { useWorkspace } from "@/components/providers";
import { EmptyState, FindingBadge, PageHeader, RiskBadge, StatusBadge } from "@/components/ui";
import { dueLabel, formatDate } from "@/lib/format";

export default function WorkPage() {
  const { repo, nonce } = useWorkspace();
  void nonce;
  if (!repo) return null;
  const work = repo.getMyWork();
  const sections = [
    ["Awaiting your review", work.awaitingReview.map((item) => ({ href: `/assessments/${item.id}`, title: item.name, meta: `${item.vendorName} · ${dueLabel(item.dueDate)}`, badge: <StatusBadge status={item.status} /> }))],
    ["Overdue", work.overdue.map((item) => ({ href: `/assessments/${item.id}`, title: item.name, meta: item.vendorName, badge: <span className="text-xs font-medium text-critical">{dueLabel(item.dueDate)}</span> }))],
    ["Vendor responses received", work.responsesReceived.map((item) => ({ href: `/assessments/${item.id}`, title: item.name, meta: item.vendorName, badge: <RiskBadge level={item.residual} /> }))],
    ["Open findings you own", work.openFindings.map((item) => ({ href: `/findings/${item.id}`, title: `${item.reference} ${item.title}`, meta: item.vendorName, badge: <FindingBadge status={item.status} /> }))],
    ["Remediation to verify", work.remediationToVerify.map((item) => ({ href: `/findings/${item.findingId}`, title: item.findingTitle, meta: `${item.findingReference} · target ${formatDate(item.targetDate)}`, badge: <span className="text-xs text-muted">Ready</span> }))],
  ] as const;
  const total = sections.reduce((sum, [, items]) => sum + items.length, 0);

  return (
    <div>
      <PageHeader title="My work" description="Reviews, overdue assessments, vendor responses, findings, and remediation waiting on you." />
      {total === 0 ? <EmptyState title="Nothing is assigned to you" body="Assessments and findings you own will show up here." /> : null}
      <div className="space-y-6">
        {sections.map(([title, items]) => (
          <section key={title}>
            <h2 className="text-sm font-semibold">{title} <span className="text-muted">{items.length}</span></h2>
            {items.length === 0 ? <p className="mt-2 text-sm text-muted">None.</p> : (
              <ul className="mt-2 divide-y divide-line rounded-lg border border-line bg-card">
                {items.map((item) => (
                  <li key={item.href + item.title}>
                    <Link href={item.href} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm hover:bg-paper">
                      <span>
                        <span className="font-medium">{item.title}</span>
                        <span className="mt-0.5 block text-muted">{item.meta}</span>
                      </span>
                      {item.badge}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
