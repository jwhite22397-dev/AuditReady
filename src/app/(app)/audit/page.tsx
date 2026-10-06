"use client";

import { formatDateTime } from "@/lib/format";
import { useWorkspace } from "@/components/providers";
import { PageHeader } from "@/components/ui";

export default function AuditPage() {
  const { repo, nonce } = useWorkspace();
  void nonce;
  if (!repo) return null;
  const events = repo.listAudit();
  return (
    <div>
      <PageHeader title="Audit log" description="Append-only history of meaningful changes. Entries are not edited from this screen." />
      <div className="overflow-x-auto rounded-lg border border-line bg-card">
        <table className="w-full min-w-[720px] text-left text-sm">
          <caption className="sr-only">Audit events</caption>
          <thead className="border-b border-line text-xs text-muted">
            <tr>{["When", "Actor", "Action", "What happened"].map((heading) => <th key={heading} scope="col" className="px-3 py-2 font-medium">{heading}</th>)}</tr>
          </thead>
          <tbody>
            {events.slice(0, 200).map((event) => (
              <tr key={event.id} className="border-b border-line align-top last:border-0">
                <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(event.createdAt)}</td>
                <td className="px-3 py-2">{event.actorLabel}</td>
                <td className="px-3 py-2 font-mono text-xs">{event.action}</td>
                <td className="px-3 py-2">{event.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
