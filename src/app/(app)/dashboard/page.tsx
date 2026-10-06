"use client";

import Link from "next/link";
import { ASSESSMENT_STATUS_LABEL, RISK_LABEL } from "@/lib/domain/labels";
import { RISK_LEVELS, type RiskLevel } from "@/lib/domain/types";
import { formatDateTime } from "@/lib/format";
import { useWorkspace } from "@/components/providers";
import { PageHeader, RiskBadge } from "@/components/ui";

export default function DashboardPage() {
  const { repo, nonce } = useWorkspace();
  void nonce;
  if (!repo) return null;
  const data = repo.getDashboard();
  const northstar = repo.listVendors({ search: "Northstar" })[0];
  const assessment = repo.listAssessments({ search: "Northstar" }).find((item) => item.status === "in_review");
  const stats = [
    ["Vendors", data.totalVendors, "/vendors"],
    ["Active assessments", data.activeAssessments, "/assessments"],
    ["High-risk vendors", data.highRiskVendors, "/vendors?risk=high"],
    ["Open findings", data.openFindings, "/findings"],
    ["Due in 14 days", data.assessmentsDue, "/assessments?due=due_30"],
  ];
  const maxRisk = Math.max(1, ...RISK_LEVELS.map((level) => data.riskDistribution[level]));

  return (
    <div>
      <PageHeader title="What needs attention" description="Open work, elevated vendors, and the latest changes in this workspace." />
      {assessment && northstar ? (
        <Link href={`/assessments/${assessment.id}`} className="mb-5 block rounded-lg border border-teal/30 bg-teal-soft px-4 py-3 text-sm text-teal-dark">
          <span className="font-medium">Start with Northstar Cloud.</span> Critical hosting vendor, questionnaire in, SOC 2 metadata waiting. Review the gaps, record remediation, and approve with conditions.
        </Link>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-5">
        {stats.map(([label, value, href]) => (
          <Link key={label} href={href as string} className="rounded-lg border border-line bg-card px-3 py-3">
            <p className="text-xs text-muted">{label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{value as number}</p>
          </Link>
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section>
          <h2 className="text-sm font-semibold">Needs a person</h2>
          <ul className="mt-2 divide-y divide-line rounded-lg border border-line bg-card">
            {data.attention.length === 0 ? <li className="px-3 py-4 text-sm text-muted">Nothing is waiting.</li> : null}
            {data.attention.map((item) => (
              <li key={item.id}>
                <Link href={item.href} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm hover:bg-paper">
                  <span>
                    <span className="font-medium">{item.title}</span>
                    <span className="mt-0.5 block text-muted">{item.detail}</span>
                  </span>
                  {item.tone === "critical" || item.tone === "high" || item.tone === "moderate" || item.tone === "low" ? <RiskBadge level={item.tone as RiskLevel} /> : <span className="text-xs text-muted">{item.tone}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="text-sm font-semibold">Residual risk across vendors</h2>
          <ul className="mt-2 space-y-2 rounded-lg border border-line bg-card p-3">
            {RISK_LEVELS.map((level) => (
              <li key={level} className="grid grid-cols-[7rem_1fr_2rem] items-center gap-2 text-sm">
                <span>{RISK_LABEL[level]}</span>
                <span className="h-2 rounded-full bg-paper-2">
                  <span className="block h-2 rounded-full bg-ink/70" style={{ width: `${(data.riskDistribution[level] / maxRisk) * 100}%` }} />
                </span>
                <span className="text-right tabular-nums">{data.riskDistribution[level]}</span>
              </li>
            ))}
          </ul>
          <h2 className="mt-5 text-sm font-semibold">Assessment status</h2>
          <ul className="mt-2 grid grid-cols-2 gap-2 text-sm">
            {Object.entries(data.statusDistribution).filter(([, count]) => count > 0).map(([status, count]) => (
              <li key={status} className="flex justify-between rounded-md border border-line bg-card px-3 py-2">
                <span>{ASSESSMENT_STATUS_LABEL[status as keyof typeof ASSESSMENT_STATUS_LABEL] ?? status}</span>
                <span className="tabular-nums">{count}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <section className="mt-6">
        <h2 className="text-sm font-semibold">Recent activity</h2>
        <ol className="mt-2 divide-y divide-line rounded-lg border border-line bg-card">
          {data.recentActivity.map((event) => (
            <li key={event.id} className="px-3 py-2 text-sm">
              <span className="text-muted">{formatDateTime(event.createdAt)}</span>
              <span className="mx-2 text-muted">·</span>
              {event.summary}
              <span className="text-muted"> — {event.actorLabel}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
