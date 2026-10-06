"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DECISION_LABEL, DOCUMENT_TYPE_LABEL, REVIEW_LABEL } from "@/lib/domain/labels";
import { DECISIONS, DOCUMENT_TYPES, REVIEW_RESULTS, RISK_LEVELS } from "@/lib/domain/types";
import { roleHasPermission } from "@/lib/domain/permissions";
import { suggestResult } from "@/lib/domain/scoring";
import { nextAssessmentStatuses } from "@/lib/domain/workflow";
import { ASSESSMENT_STATUS_LABEL } from "@/lib/domain/labels";
import { publicErrorMessage } from "@/lib/domain/errors";
import { dueLabel, formatDateTime } from "@/lib/format";
import { useWorkspace } from "@/components/providers";
import { Banner, Button, EmptyState, Field, FindingBadge, PageHeader, RiskBadge, SelectInput, StatusBadge, TextArea, TextInput } from "@/components/ui";

export default function AssessmentPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { repo, nonce } = useWorkspace();
  const [tab, setTab] = useState<"Review" | "Evidence" | "Findings" | "Decision" | "Activity">("Review");
  const [error, setError] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [sectionFilter, setSectionFilter] = useState("All");
  void nonce;
  if (!repo) return null;
  let detail: ReturnType<typeof repo.getAssessment> | null = null;
  try {
    detail = repo.getAssessment(params.id);
  } catch (caught) {
    return <EmptyState title="Assessment not found" body={publicErrorMessage(caught)} />;
  }
  const session = repo.getSession();
  const canWrite = roleHasPermission(session?.role, "assessments.write");
  const { assessment, vendor, questions, documents, findings, invitations, decision, timeline, previous, ownerName } = detail;
  const sections = ["All", ...new Set(questions.map((question) => question.sectionTitle))];
  const visible = questions.filter((question) => sectionFilter === "All" || question.sectionTitle === sectionFilter);
  const reviewed = questions.filter((question) => question.response && question.response.analystResult !== "not_reviewed").length;
  const soc = documents.find((document) => document.documentType === "soc2_type_i" || document.documentType === "soc2_type_ii");
  const guide = [
    ["SOC 2 review recorded", Boolean(soc?.soc2 && soc.soc2.reviewStatus === "complete")],
    ["Controls reviewed", reviewed > 0],
    ["Finding recorded", findings.length > 0],
    ["Residual risk set", Boolean(assessment.residualOverride) || !assessment.controlPreliminary],
    ["Decision recorded", Boolean(decision && !decision.pending)],
  ];

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      setError("");
    } catch (caught) {
      setError(publicErrorMessage(caught));
    }
  }

  return (
    <div>
      <PageHeader
        title={assessment.name}
        description={`${vendor.name} · ${ownerName} · ${dueLabel(assessment.dueDate)}`}
        actions={
          <>
            <StatusBadge status={assessment.status} />
            <RiskBadge level={assessment.residualOverride ?? assessment.residualRisk} />
            <Link href={`/assessments/${assessment.id}/report`} className="inline-flex h-9 items-center rounded-md border border-line-strong bg-card px-3 text-sm">Report</Link>
            {canWrite ? <Button variant="secondary" onClick={() => run(() => repo.startReassessment(assessment.id).then((next) => router.push(`/assessments/${next.id}`)))}>Start reassessment</Button> : null}
          </>
        }
      />
      {error ? <div className="mb-3"><Banner tone="danger">{error}</Banner></div> : null}
      {previous ? <p className="mb-3 text-sm text-muted">This reassessment does not copy previous answers. <Link className="text-teal-dark" href={`/assessments/${previous.id}`}>Open the prior assessment</Link> if you need them.</p> : null}
      <ol className="mb-4 grid gap-2 md:grid-cols-5">
        {guide.map(([label, done]) => (
          <li key={label as string} className="rounded-md border border-line bg-card px-3 py-2 text-xs">
            <span className={done ? "text-low" : "text-muted"}>{done ? "Done" : "Open"}</span>
            <span className="mt-1 block text-sm text-ink">{label as string}</span>
          </li>
        ))}
      </ol>
      <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-line bg-card p-3">
        <Field label="Vendor email">
          <TextInput value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="security@vendor.example" />
        </Field>
        {canWrite ? <Button onClick={() => run(async () => {
          const result = await repo.createInvitation(assessment.id, inviteEmail);
          setInviteLink(`${window.location.origin}/portal/${result.token}`);
        })}>Create invitation</Button> : null}
        {inviteLink ? <p className="text-sm">Link, shown once: <a className="break-all text-teal-dark" href={inviteLink}>{inviteLink}</a></p> : null}
        <p className="w-full text-xs text-muted">{invitations.length} invitation{invitations.length === 1 ? "" : "s"}. Email delivery is not configured, so copy the link.</p>
      </div>
      {canWrite ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {nextAssessmentStatuses(assessment.status).map((status) => (
            <Button key={status} variant="secondary" onClick={() => run(() => repo.setAssessmentStatus(assessment.id, status))}>Move to {ASSESSMENT_STATUS_LABEL[status]}</Button>
          ))}
        </div>
      ) : null}
      <div className="mb-4 flex gap-1 overflow-auto border-b border-line">
        {(["Review", "Evidence", "Findings", "Decision", "Activity"] as const).map((item) => (
          <button key={item} className={`px-3 py-2 text-sm ${tab === item ? "border-b-2 border-teal font-medium" : "text-muted"}`} onClick={() => setTab(item)}>{item}</button>
        ))}
      </div>
      {tab === "Review" ? (
        <div>
          <div className="mb-3 flex items-center justify-between gap-3 text-sm">
            <p>{reviewed} of {questions.length} reviewed. Unreviewed questions are not treated as passes.</p>
            <SelectInput aria-label="Section" className="max-w-xs" value={sectionFilter} onChange={(event) => setSectionFilter(event.target.value)}>
              {sections.map((section) => <option key={section}>{section}</option>)}
            </SelectInput>
          </div>
          <ul className="space-y-3">
            {visible.map((question) => {
              const response = question.response;
              if (!response) return null;
              const suggestion = suggestResult(question, response);
              return (
                <li key={question.id} className="rounded-lg border border-line bg-card p-3">
                  <p className="text-xs text-muted">{question.sectionTitle} · {question.controlRef || "No ref"}{question.mappings.length ? ` · illustrative ${question.mappings.map((item) => `${item.framework} ${item.reference}`).join(", ")}` : ""}</p>
                  <h3 className="mt-1 text-sm font-medium">{question.prompt}</h3>
                  <p className="mt-1 text-sm">Vendor: <span className="font-medium">{labelAnswer(question, response)}</span></p>
                  {suggestion && response.analystResult === "not_reviewed" ? <p className="text-xs text-muted">Suggestion only: {REVIEW_LABEL[suggestion]}. You still choose the result.</p> : null}
                  {question.guidance ? <p className="mt-1 text-xs text-muted">{question.guidance}</p> : null}
                  <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Assessment result">
                    {REVIEW_RESULTS.map((result) => (
                      <button
                        key={result}
                        disabled={!canWrite}
                        className={`rounded-md border px-2 py-1 text-xs ${response.analystResult === result ? "border-teal bg-teal-soft font-medium" : "border-line"}`}
                        onClick={() => run(() => repo.saveReview(response.id, { result, notes: response.analystNotes }))}
                      >
                        {REVIEW_LABEL[result]}
                      </button>
                    ))}
                  </div>
                  <TextArea
                    aria-label="Analyst notes"
                    className="mt-2 min-h-16"
                    defaultValue={response.analystNotes}
                    key={response.updatedAt + response.analystNotes}
                    disabled={!canWrite}
                    onBlur={(event) => {
                      if (event.target.value !== response.analystNotes) {
                        void run(() => repo.saveReview(response.id, { result: response.analystResult, notes: event.target.value }));
                      }
                    }}
                  />
                  {canWrite ? <Button variant="ghost" className="mt-1" onClick={() => run(() => repo.createFinding({
                    title: question.prompt.slice(0, 180),
                    vendorId: vendor.id,
                    assessmentId: assessment.id,
                    assessmentQuestionId: question.id,
                    description: response.analystNotes || "The response did not demonstrate this control.",
                    risk: response.analystResult === "fail" ? "high" : "moderate",
                    recommendation: question.guidance,
                    vendorResponse: "",
                    ownerId: session?.userId,
                    targetDate: null,
                  }))}>Create finding from this response</Button> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      {tab === "Evidence" ? <EvidenceTab assessmentId={assessment.id} vendorId={vendor.id} questions={questions.map((question) => ({ id: question.id, prompt: question.prompt }))} documents={documents} canWrite={canWrite} onError={setError} /> : null}
      {tab === "Findings" ? (
        <div className="space-y-3">
          {findings.length === 0 ? <EmptyState title="No findings yet" body="Create one from a failed or partial response." /> : findings.map((finding) => (
            <Link key={finding.id} href={`/findings/${finding.id}`} className="flex items-center justify-between rounded-lg border border-line bg-card px-3 py-2 text-sm">
              <span>{finding.reference} {finding.title}</span>
              <span className="flex items-center gap-2"><RiskBadge level={finding.risk} /><FindingBadge status={finding.status} /></span>
            </Link>
          ))}
        </div>
      ) : null}
      {tab === "Decision" ? <DecisionTab assessmentId={assessment.id} canWrite={canWrite} canApprove={roleHasPermission(session?.role, "decisions.approve_high")} onError={setError} /> : null}
      {tab === "Activity" ? (
        <ol className="divide-y divide-line rounded-lg border border-line bg-card">
          {timeline.map((event) => <li key={event.id} className="px-3 py-2 text-sm"><span className="text-muted">{formatDateTime(event.createdAt)}</span> {event.summary} <span className="text-muted">— {event.actorLabel}</span></li>)}
        </ol>
      ) : null}
    </div>
  );
}

function labelAnswer(question: { type: string; options: string[] }, response: { answerBoolean: boolean | null; answerNa: boolean; answerText: string; answerChoice: string; documentIds: string[] }) {
  if (question.type === "yes_no" || question.type === "yes_no_na") {
    if (response.answerNa) return "N/A";
    if (response.answerBoolean === true) return "Yes";
    if (response.answerBoolean === false) return "No";
    return "No answer";
  }
  if (question.type === "multiple_choice") return response.answerChoice || "No answer";
  if (question.type === "file_request" && response.documentIds.length) return "File attached";
  return response.answerText || "No answer";
}

function EvidenceTab({
  assessmentId,
  vendorId,
  questions,
  documents,
  canWrite,
  onError,
}: {
  assessmentId: string;
  vendorId: string;
  questions: { id: string; prompt: string }[];
  documents: ReturnType<NonNullable<ReturnType<typeof useWorkspace>["repo"]>["getAssessment"]>["documents"];
  canWrite: boolean;
  onError: (message: string) => void;
}) {
  const { repo, nonce } = useWorkspace();
  void nonce;
  const [documentType, setDocumentType] = useState<(typeof DOCUMENT_TYPES)[number]>("soc2_type_ii");
  const [description, setDescription] = useState("");
  const [questionId, setQuestionId] = useState("");
  if (!repo) return null;
  const currentDocs = repo.getAssessment(assessmentId).documents;
  return (
    <div className="space-y-4">
      {canWrite ? (
        <form className="grid gap-2 rounded-lg border border-line bg-card p-3 md:grid-cols-2" onSubmit={async (event) => {
          event.preventDefault();
          const file = (event.currentTarget.elements.namedItem("file") as HTMLInputElement).files?.[0];
          if (!file) return;
          try {
            await repo.addUploadedDocument(file, { vendorId, assessmentId, assessmentQuestionId: questionId || null, documentType, description });
            event.currentTarget.reset();
            onError("");
          } catch (caught) {
            onError(publicErrorMessage(caught));
          }
        }}>
          <Field label="File"><input name="file" type="file" className="text-sm" /></Field>
          <Field label="Document type">
            <SelectInput value={documentType} onChange={(event) => setDocumentType(event.target.value as typeof documentType)}>
              {DOCUMENT_TYPES.map((type) => <option key={type} value={type}>{DOCUMENT_TYPE_LABEL[type]}</option>)}
            </SelectInput>
          </Field>
          <Field label="Related question">
            <SelectInput value={questionId} onChange={(event) => setQuestionId(event.target.value)}>
              <option value="">None</option>
              {questions.map((question) => <option key={question.id} value={question.id}>{question.prompt.slice(0, 80)}</option>)}
            </SelectInput>
          </Field>
          <Field label="Description"><TextInput value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
          <Button type="submit">Upload evidence</Button>
        </form>
      ) : null}
      <ul className="space-y-3">
        {currentDocs.map((document) => (
          <li key={document.id} className="rounded-lg border border-line bg-card p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{document.fileName}</p>
                <p className="text-muted">{DOCUMENT_TYPE_LABEL[document.documentType]} · {document.reviewStatus} · {document.uploadedByLabel}</p>
              </div>
              <Button variant="secondary" onClick={() => repo.getDocumentFile(document.id).then((file) => {
                const blob = new Blob([file.data], { type: file.contentType });
                const url = URL.createObjectURL(blob);
                const link = window.document.createElement("a");
                link.href = url;
                link.download = file.fileName;
                link.click();
                URL.revokeObjectURL(url);
              }).catch((caught) => onError(publicErrorMessage(caught)))}>Download</Button>
            </div>
            {document.description ? <p className="mt-2">{document.description}</p> : null}
            {document.soc2 ? <Soc2Form documentId={document.id} initial={document.soc2} canWrite={canWrite} onError={onError} /> : null}
          </li>
        ))}
      </ul>
      {documents.length === 0 ? <EmptyState title="No evidence yet" body="Upload a SOC report, policy, or other support. Files stay private to this workspace." /> : null}
    </div>
  );
}

function Soc2Form({ documentId, initial, canWrite, onError }: { documentId: string; initial: NonNullable<ReturnType<NonNullable<ReturnType<typeof useWorkspace>["repo"]>["getAssessment"]>["documents"][number]["soc2"]>; canWrite: boolean; onError: (message: string) => void }) {
  const { repo } = useWorkspace();
  const [form, setForm] = useState(initial);
  if (!repo) return null;
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });
  return (
    <form className="mt-3 grid gap-2 border-t border-line pt-3 md:grid-cols-2" onSubmit={async (event) => {
      event.preventDefault();
      try {
        await repo.saveSoc2Review(documentId, form);
        onError("");
      } catch (caught) {
        onError(publicErrorMessage(caught));
      }
    }}>
      <p className="md:col-span-2 text-xs text-muted">Structured analyst review. Document intelligence that reads the report is not implemented.</p>
      <Field label="Report type">
        <SelectInput value={form.reportType} onChange={(event) => set({ reportType: event.target.value as typeof form.reportType })}>
          <option value="">Select</option>
          <option value="type_i">Type I</option>
          <option value="type_ii">Type II</option>
        </SelectInput>
      </Field>
      <Field label="Audit firm"><TextInput value={form.auditFirm} onChange={(event) => set({ auditFirm: event.target.value })} /></Field>
      <Field label="Period start"><TextInput type="date" value={form.periodStart} onChange={(event) => set({ periodStart: event.target.value })} /></Field>
      <Field label="Period end"><TextInput type="date" value={form.periodEnd} onChange={(event) => set({ periodEnd: event.target.value })} /></Field>
      <Field label="Opinion">
        <SelectInput value={form.opinion} onChange={(event) => set({ opinion: event.target.value as typeof form.opinion })}>
          <option value="">Select</option>
          <option value="unqualified">Unqualified</option>
          <option value="qualified">Qualified</option>
          <option value="adverse">Adverse</option>
          <option value="disclaimer">Disclaimer</option>
        </SelectInput>
      </Field>
      <Field label="Exceptions noted?">
        <SelectInput value={form.exceptionsNoted === null ? "" : String(form.exceptionsNoted)} onChange={(event) => set({ exceptionsNoted: event.target.value === "" ? null : event.target.value === "true" })}>
          <option value="">Unknown</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </SelectInput>
      </Field>
      <Field label="Subservice organizations"><TextArea value={form.subserviceOrganizations} onChange={(event) => set({ subserviceOrganizations: event.target.value })} /></Field>
      <Field label="Complementary user entity controls"><TextArea value={form.complementaryUserEntityControls} onChange={(event) => set({ complementaryUserEntityControls: event.target.value })} /></Field>
      {([
        ["coversSecurity", "Security"],
        ["coversAvailability", "Availability"],
        ["coversConfidentiality", "Confidentiality"],
        ["coversProcessingIntegrity", "Processing integrity"],
        ["coversPrivacy", "Privacy"],
      ] as const).map(([key, label]) => (
        <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form[key]} onChange={(event) => set({ [key]: event.target.checked })} />{label} category covered</label>
      ))}
      <Field label="Analyst notes"><TextArea value={form.analystNotes} onChange={(event) => set({ analystNotes: event.target.value })} /></Field>
      <Field label="Review status">
        <SelectInput value={form.reviewStatus} onChange={(event) => set({ reviewStatus: event.target.value as typeof form.reviewStatus })}>
          <option value="not_started">Not started</option>
          <option value="in_review">In review</option>
          <option value="complete">Complete</option>
        </SelectInput>
      </Field>
      {canWrite ? <Button type="submit">Save SOC 2 review</Button> : null}
    </form>
  );
}

function DecisionTab({ assessmentId, canWrite, canApprove, onError }: { assessmentId: string; canWrite: boolean; canApprove: boolean; onError: (message: string) => void }) {
  const { repo, nonce } = useWorkspace();
  void nonce;
  const detail = repo?.getAssessment(assessmentId);
  const [notes, setNotes] = useState("");
  const [decision, setDecision] = useState<(typeof DECISIONS)[number]>("approved_with_conditions");
  const [secondary, setSecondary] = useState(false);
  const [summary, setSummary] = useState("");
  const [residual, setResidual] = useState("");
  const [residualWhy, setResidualWhy] = useState("");
  const report = useMemo(() => (repo && nonce >= 0 ? repo.getReport(assessmentId) : null), [repo, assessmentId, nonce]);
  if (!repo || !detail || !report) return null;
  const assessment = detail.assessment;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="space-y-2 rounded-lg border border-line bg-card p-4 text-sm">
        <h2 className="font-semibold">Risk</h2>
        <p>Inherent: <RiskBadge level={report.inherent.level} /> <span className="text-muted">score {report.inherent.score}/18</span></p>
        <p>Control: <RiskBadge level={report.control.level} /> <span className="text-muted">{report.control.ratio}% risk weight · {report.control.coverage}% coverage{report.control.preliminary ? " · preliminary" : ""}</span></p>
        <p>Residual: <RiskBadge level={report.residual.level} /></p>
        <p className="text-xs text-muted">{report.modelSummary}</p>
        <Field label="Override residual risk">
          <SelectInput value={residual} onChange={(event) => setResidual(event.target.value)}>
            <option value="">Calculated value</option>
            {RISK_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
          </SelectInput>
        </Field>
        <Field label="Justification"><TextArea value={residualWhy} onChange={(event) => setResidualWhy(event.target.value)} /></Field>
        {canWrite ? <Button onClick={async () => {
          try {
            await repo.setResidualOverride(assessmentId, { level: (residual || null) as typeof assessment.residualOverride, justification: residualWhy });
            onError("");
          } catch (caught) {
            onError(publicErrorMessage(caught));
          }
        }}>Save residual risk</Button> : null}
      </section>
      <section className="space-y-2 rounded-lg border border-line bg-card p-4 text-sm">
        <h2 className="font-semibold">Decision</h2>
        {detail.decision ? <p>Latest: {DECISION_LABEL[detail.decision.decision]}{detail.decision.pending ? " — waiting for additional approval" : ""}</p> : <p className="text-muted">No decision yet.</p>}
        <Field label="Decision">
          <SelectInput value={decision} onChange={(event) => setDecision(event.target.value as typeof decision)}>
            {DECISIONS.map((item) => <option key={item} value={item}>{DECISION_LABEL[item]}</option>)}
          </SelectInput>
        </Field>
        <Field label="Decision notes"><TextArea value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
        <label className="flex items-center gap-2"><input type="checkbox" checked={secondary} onChange={(event) => setSecondary(event.target.checked)} /> Require owner or admin approval for this high or critical decision</label>
        {canWrite ? <Button onClick={async () => {
          try {
            await repo.recordDecision(assessmentId, { decision, notes, requiresSecondaryApproval: secondary });
            onError("");
          } catch (caught) {
            onError(publicErrorMessage(caught));
          }
        }}>Record decision</Button> : null}
        {detail.decision?.pending && canApprove ? <Button variant="secondary" onClick={async () => {
          try {
            await repo.confirmDecision(detail.decision!.id);
            onError("");
          } catch (caught) {
            onError(publicErrorMessage(caught));
          }
        }}>Confirm approval</Button> : null}
        <Field label="Executive summary" hint="Leave blank on save to restore the generated summary. Edit it before you share the report.">
          <TextArea value={summary || report.executiveSummary} onChange={(event) => setSummary(event.target.value)} />
        </Field>
        {canWrite ? <Button variant="secondary" onClick={async () => {
          try {
            await repo.setExecutiveSummary(assessmentId, summary || report.executiveSummary);
            onError("");
          } catch (caught) {
            onError(publicErrorMessage(caught));
          }
        }}>Save summary</Button> : null}
        <Field label="Analyst notes"><TextArea defaultValue={assessment.analystNotes} onBlur={(event) => repo.setAnalystNotes(assessmentId, event.target.value).catch((caught) => onError(publicErrorMessage(caught)))} /></Field>
      </section>
    </div>
  );
}
