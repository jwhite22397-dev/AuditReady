"use client";

import { useParams } from "next/navigation";
import { ASSESSMENT_STATUS_LABEL, DECISION_LABEL, FINDING_STATUS_LABEL, REVIEW_LABEL } from "@/lib/domain/labels";
import { publicErrorMessage } from "@/lib/domain/errors";
import { formatDate, formatDateTime } from "@/lib/format";
import { useWorkspace } from "@/components/providers";
import { Button, EmptyState, RiskBadge } from "@/components/ui";

export default function ReportPage() {
  const params = useParams<{ id: string }>();
  const { repo, nonce } = useWorkspace();
  void nonce;
  if (!repo) return null;
  let report: ReturnType<typeof repo.getReport>;
  try {
    report = repo.getReport(params.id);
  } catch (caught) {
    return <EmptyState title="Report unavailable" body={publicErrorMessage(caught)} />;
  }
  return (
    <article className="mx-auto max-w-3xl bg-card px-6 py-8 text-sm print:bg-white">
      <div className="no-print mb-4 flex justify-end">
        <Button onClick={() => window.print()}>Print or save PDF</Button>
      </div>
      <p className="text-xs tracking-[0.14em] text-muted">AUDITREADY · {report.organizationName}</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Vendor risk assessment</h1>
      <p className="mt-1 text-muted">Generated {formatDateTime(report.generatedAt)}. This report records an internal review. It is not a certification.</p>
      <h2 className="mt-8 text-lg font-semibold">Executive summary</h2>
      <p className="mt-2 leading-6">{report.executiveSummary}</p>
      <h2 className="mt-8 text-lg font-semibold">Vendor</h2>
      <dl className="mt-2 grid grid-cols-2 gap-2">
        {[
          ["Vendor", report.vendor.name],
          ["Service", report.vendor.service],
          ["Website", report.vendor.website || "—"],
          ["Category", report.vendor.category],
          ["Criticality", report.vendor.criticality],
          ["Data access", report.vendor.dataAccess],
          ["System access", report.vendor.systemAccess],
          ["Business owner", report.vendor.businessOwner || "—"],
          ["Security owner", report.vendor.securityOwner || "—"],
        ].map(([label, value]) => (
          <div key={label}><dt className="text-xs text-muted">{label}</dt><dd>{value}</dd></div>
        ))}
      </dl>
      <h2 className="mt-8 text-lg font-semibold">Assessment</h2>
      <dl className="mt-2 grid grid-cols-2 gap-2">
        <div><dt className="text-xs text-muted">Name</dt><dd>{report.assessment.name}</dd></div>
        <div><dt className="text-xs text-muted">Owner</dt><dd>{report.assessment.ownerName}</dd></div>
        <div><dt className="text-xs text-muted">Opened</dt><dd>{formatDate(report.assessment.createdAt)}</dd></div>
        <div><dt className="text-xs text-muted">Vendor submitted</dt><dd>{formatDate(report.assessment.submittedAt)}</dd></div>
        <div><dt className="text-xs text-muted">Status</dt><dd>{ASSESSMENT_STATUS_LABEL[report.assessment.status]}</dd></div>
      </dl>
      <h2 className="mt-8 text-lg font-semibold">Risk</h2>
      <p className="mt-2">Inherent <RiskBadge level={report.inherent.level} /> · Control <RiskBadge level={report.control.level} /> · Residual <RiskBadge level={report.residual.level} /></p>
      <p className="mt-2 text-muted">Control coverage {report.control.coverage}%. Pass {report.control.pass}, partial {report.control.partial}, fail {report.control.fail}, not reviewed {report.control.notReviewed}.{report.control.preliminary ? " Control risk is preliminary because less than half the questionnaire has been reviewed." : ""}</p>
      {report.residual.justification ? <p className="mt-2">Residual override: {report.residual.justification}</p> : null}
      <p className="mt-2 text-xs text-muted">{report.modelSummary}</p>
      <h2 className="mt-8 text-lg font-semibold">Documents reviewed</h2>
      <ul className="mt-2 space-y-1">
        {report.documents.length === 0 ? <li>None recorded.</li> : report.documents.map((document) => <li key={document.fileName}>{document.fileName} — {document.documentType} — {document.reviewStatus}</li>)}
      </ul>
      <h2 className="mt-8 text-lg font-semibold">Questionnaire summary</h2>
      <table className="mt-2 w-full text-left">
        <caption className="sr-only">Results by section</caption>
        <thead><tr>{["Section", "Pass", "Partial", "Fail", "N/A", "Not reviewed"].map((heading) => <th key={heading} scope="col" className="border-b border-line py-1 pr-2 font-medium">{heading}</th>)}</tr></thead>
        <tbody>
          {report.sections.map((section) => (
            <tr key={section.title} className="border-b border-line">
              <th scope="row" className="py-1 pr-2 font-normal">{section.title}</th>
              <td>{section.pass}</td><td>{section.partial}</td><td>{section.fail}</td><td>{section.na}</td><td>{section.notReviewed}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2 className="mt-8 text-lg font-semibold">Findings</h2>
      {report.findings.length === 0 ? <p className="mt-2">None.</p> : report.findings.map((finding) => (
        <section key={finding.id} className="mt-3 border-t border-line pt-2">
          <h3 className="font-medium">{finding.reference} {finding.title}</h3>
          <p className="text-muted">{finding.risk} risk · {FINDING_STATUS_LABEL[finding.status]}</p>
          <p className="mt-1">{finding.description}</p>
          {finding.recommendation ? <p className="mt-1">Recommendation: {finding.recommendation}</p> : null}
          {finding.remediations.map((action) => <p key={action.id} className="mt-1">Remediation ({action.status}): {action.requiredAction} {action.vendorResponse ? `Vendor: ${action.vendorResponse}` : ""} {action.analystVerification ? `Verified: ${action.analystVerification}` : ""}</p>)}
          {finding.acceptance ? <p className="mt-1">Risk accepted until {finding.acceptance.expiresOn}. {finding.acceptance.businessJustification} Compensating controls: {finding.acceptance.compensatingControls}</p> : null}
        </section>
      ))}
      <h2 className="mt-8 text-lg font-semibold">Final decision</h2>
      {report.decision ? (
        <p className="mt-2">{DECISION_LABEL[report.decision.decision]} by {report.decision.reviewerName} on {formatDate(report.decision.decidedAt)}. {report.decision.pending ? "Additional approval is still required." : ""} {report.decision.approverName ? `Approved by ${report.decision.approverName}.` : ""}</p>
      ) : <p className="mt-2">Not decided.</p>}
      {report.decision ? <p className="mt-1">{report.decision.notes}</p> : null}
      {report.analystNotes ? <><h2 className="mt-8 text-lg font-semibold">Analyst notes</h2><p className="mt-2 whitespace-pre-wrap">{report.analystNotes}</p></> : null}
      <h2 className="mt-8 text-lg font-semibold">Control review detail</h2>
      <table className="mt-2 w-full text-left">
        <caption className="sr-only">Question results</caption>
        <thead><tr>{["Question", "Answer", "Result"].map((heading) => <th key={heading} scope="col" className="border-b border-line py-1 pr-2 text-left font-medium">{heading}</th>)}</tr></thead>
        <tbody>
          {report.questionnaireRows.map((row) => (
            <tr key={row.controlRef + row.prompt} className="border-b border-line align-top">
              <th scope="row" className="py-1 pr-2 font-normal">{row.prompt}</th>
              <td className="py-1 pr-2">{row.answer}</td>
              <td className="py-1">{REVIEW_LABEL[row.result]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}
