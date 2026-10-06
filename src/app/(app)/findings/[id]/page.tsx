"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { FINDING_STATUSES, RISK_LEVELS } from "@/lib/domain/types";
import { FINDING_STATUS_LABEL, RISK_LABEL } from "@/lib/domain/labels";
import { roleHasPermission } from "@/lib/domain/permissions";
import { publicErrorMessage } from "@/lib/domain/errors";
import { formatDate } from "@/lib/format";
import { useWorkspace } from "@/components/providers";
import { Banner, Button, EmptyState, Field, FindingBadge, PageHeader, RiskBadge, SelectInput, TextArea, TextInput } from "@/components/ui";

export default function FindingPage() {
  const params = useParams<{ id: string }>();
  const { repo, nonce } = useWorkspace();
  const [error, setError] = useState("");
  const [closure, setClosure] = useState("");
  const [action, setAction] = useState({ requiredAction: "", vendorResponse: "", targetDate: "", status: "open" as const });
  const [acceptance, setAcceptance] = useState({ businessJustification: "", compensatingControls: "", expiresOn: "" });
  const [verifyNotes, setVerifyNotes] = useState<Record<string, string>>({});
  void nonce;
  if (!repo) return null;
  let detail: ReturnType<typeof repo.getFindingDetail>;
  try {
    detail = repo.getFindingDetail(params.id);
  } catch (caught) {
    return <EmptyState title="Finding not found" body={publicErrorMessage(caught)} />;
  }
  const { finding, vendorName, remediations, acceptances } = detail;
  const session = repo.getSession();
  const canWrite = roleHasPermission(session?.role, "findings.write");
  const canAcceptHigh = roleHasPermission(session?.role, "findings.accept_high_risk");

  async function run(work: () => Promise<unknown>) {
    try {
      await work();
      setError("");
    } catch (caught) {
      setError(publicErrorMessage(caught));
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title={`${finding.reference} ${finding.title}`} description={vendorName} actions={<><RiskBadge level={finding.risk} /><FindingBadge status={finding.status} /></>} />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {finding.assessmentId ? <Link className="text-sm text-teal-dark" href={`/assessments/${finding.assessmentId}`}>Back to assessment</Link> : null}
      <p className="max-w-3xl text-sm leading-6">{finding.description}</p>
      {finding.recommendation ? <p className="text-sm"><span className="font-medium">Recommendation. </span>{finding.recommendation}</p> : null}
      {finding.vendorResponse ? <p className="text-sm"><span className="font-medium">Vendor response. </span>{finding.vendorResponse}</p> : null}
      <form className="grid max-w-xl gap-2" onSubmit={(event) => {
        event.preventDefault();
        void run(() => repo.updateFinding(finding.id, {
          title: finding.title,
          vendorId: finding.vendorId,
          assessmentId: finding.assessmentId,
          assessmentQuestionId: finding.assessmentQuestionId,
          description: finding.description,
          risk: (event.currentTarget.elements.namedItem("risk") as HTMLSelectElement).value,
          recommendation: finding.recommendation,
          vendorResponse: (event.currentTarget.elements.namedItem("vendorResponse") as HTMLTextAreaElement).value,
          ownerId: finding.ownerId,
          targetDate: finding.targetDate,
        }));
      }}>
        <Field label="Risk">
          <SelectInput name="risk" defaultValue={finding.risk}>{RISK_LEVELS.map((level) => <option key={level} value={level}>{RISK_LABEL[level]}</option>)}</SelectInput>
        </Field>
        <Field label="Vendor response"><TextArea name="vendorResponse" defaultValue={finding.vendorResponse} /></Field>
        {canWrite ? <Button type="submit">Save finding</Button> : null}
      </form>
      <div className="flex flex-wrap gap-2">
        {FINDING_STATUSES.filter((status) => status !== "risk_accepted").map((status) => (
          <Button key={status} variant="secondary" disabled={!canWrite} onClick={() => run(() => repo.setFindingStatus(finding.id, status, closure))}>{FINDING_STATUS_LABEL[status]}</Button>
        ))}
      </div>
      <Field label="Closure notes"><TextArea value={closure} onChange={(event) => setClosure(event.target.value)} /></Field>
      <section className="rounded-lg border border-line bg-card p-4">
        <h2 className="font-semibold">Remediation</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {remediations.map((item) => (
            <li key={item.id} className="border-t border-line pt-2">
              <p>{item.requiredAction}</p>
              <p className="text-muted">{item.status} · target {formatDate(item.targetDate)}</p>
              {item.vendorResponse ? <p>Vendor: {item.vendorResponse}</p> : null}
              {item.analystVerification ? <p>Verified: {item.analystVerification}</p> : null}
              {canWrite && item.status !== "verified" ? (
                <form className="mt-2 grid gap-2" onSubmit={(event) => {
                  event.preventDefault();
                  void run(() => repo.verifyRemediation(item.id, verifyNotes[item.id] ?? ""));
                }}>
                  <Field label="Verification notes">
                    <TextArea value={verifyNotes[item.id] ?? ""} onChange={(event) => setVerifyNotes({ ...verifyNotes, [item.id]: event.target.value })} />
                  </Field>
                  <Button type="submit" variant="secondary">Verify remediation</Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
        {canWrite ? (
          <form className="mt-3 grid gap-2" onSubmit={(event) => {
            event.preventDefault();
            void run(() => repo.addRemediation(finding.id, { ...action, targetDate: action.targetDate || null }));
          }}>
            <Field label="Required action"><TextArea value={action.requiredAction} onChange={(event) => setAction({ ...action, requiredAction: event.target.value })} /></Field>
            <Field label="Vendor response"><TextArea value={action.vendorResponse} onChange={(event) => setAction({ ...action, vendorResponse: event.target.value })} /></Field>
            <Field label="Target date"><TextInput type="date" value={action.targetDate} onChange={(event) => setAction({ ...action, targetDate: event.target.value })} /></Field>
            <Button type="submit">Add remediation</Button>
          </form>
        ) : null}
      </section>
      <section className="rounded-lg border border-line bg-card p-4">
        <h2 className="font-semibold">Risk acceptance</h2>
        <p className="mt-1 text-sm text-muted">{finding.risk === "high" || finding.risk === "critical" ? "High and critical acceptance requires an admin or owner, and is written to the audit log." : "Acceptance is written to the audit log with the justification and expiry."}</p>
        <ul className="mt-2 space-y-2 text-sm">
          {acceptances.map((item) => <li key={item.id}>Accepted until {item.expiresOn}. {item.businessJustification}</li>)}
        </ul>
        {canWrite && (finding.risk === "low" || finding.risk === "moderate" || canAcceptHigh) ? (
          <form className="mt-3 grid gap-2" onSubmit={(event) => {
            event.preventDefault();
            void run(() => repo.recordRiskAcceptance(finding.id, acceptance));
          }}>
            <Field label="Business justification"><TextArea value={acceptance.businessJustification} onChange={(event) => setAcceptance({ ...acceptance, businessJustification: event.target.value })} /></Field>
            <Field label="Compensating controls"><TextArea value={acceptance.compensatingControls} onChange={(event) => setAcceptance({ ...acceptance, compensatingControls: event.target.value })} /></Field>
            <Field label="Review by"><TextInput type="date" value={acceptance.expiresOn} onChange={(event) => setAcceptance({ ...acceptance, expiresOn: event.target.value })} /></Field>
            <Button type="submit">Record risk acceptance</Button>
          </form>
        ) : null}
      </section>
    </div>
  );
}
