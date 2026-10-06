"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DOCUMENT_TYPES, type DocumentType } from "@/lib/domain/types";
import { DOCUMENT_TYPE_LABEL } from "@/lib/domain/labels";
import { publicErrorMessage } from "@/lib/domain/errors";
import { useWorkspace } from "@/components/providers";
import { Banner, Button, Field, SelectInput, TextArea } from "@/components/ui";
import type { PortalAnswerInput } from "@/lib/data/portal";
import type { DemoRepository } from "@/lib/data/demo-repository";

type PortalView = Awaited<ReturnType<DemoRepository["getPortal"]>>;

export default function PortalPage() {
  const params = useParams<{ token: string }>();
  const { repo, ready } = useWorkspace();
  const [view, setView] = useState<PortalView | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!repo) return;
    let active = true;
    repo.getPortal(params.token).then((result) => {
      if (active) setView(result);
    }).catch((caught: unknown) => {
      if (active) setError(publicErrorMessage(caught));
    });
    return () => {
      active = false;
    };
  }, [repo, params.token]);

  if (!ready || !repo) return <main className="p-8 text-sm text-muted">Loading questionnaire</main>;
  if (error && !view) {
    return (
      <main className="mx-auto max-w-xl px-5 py-16">
        <p className="text-sm font-semibold tracking-[0.14em]">AUDITREADY</p>
        <h1 className="mt-4 text-3xl font-semibold">Invitation unavailable</h1>
        <p className="mt-2 text-sm text-muted">{error}</p>
      </main>
    );
  }
  if (!view) return <main className="p-8 text-sm text-muted">Loading questionnaire</main>;
  return <PortalForm token={params.token} initial={view} repo={repo} onReload={setView} />;
}

function PortalForm({ token, initial, repo, onReload }: { token: string; initial: PortalView; repo: DemoRepository; onReload: (view: PortalView) => void }) {
  const [view, setView] = useState(initial);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [docTypes, setDocTypes] = useState<Record<string, DocumentType>>({});
  const [answers, setAnswers] = useState<Record<string, PortalAnswerInput>>(() => Object.fromEntries(initial.questions.map((question) => [question.id, {
    questionId: question.id,
    answerBoolean: question.response?.answerBoolean ?? null,
    answerNa: question.response?.answerNa ?? false,
    answerText: question.response?.answerText ?? "",
    answerChoice: question.response?.answerChoice ?? "",
  }])));
  const sections = [...new Set(view.questions.map((question) => question.sectionTitle))];

  async function reload() {
    const next = await repo.getPortal(token);
    setView(next);
    onReload(next);
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-8">
      <p className="text-sm font-semibold tracking-[0.14em]">AUDITREADY</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">{view.assessmentName}</h1>
      <p className="mt-2 text-sm text-muted">{view.organizationName} asked {view.vendorName} to complete this security questionnaire. This link shows only that assessment.</p>
      {view.locked ? <div className="mt-4"><Banner>This questionnaire has been submitted and is locked.</Banner></div> : null}
      {error ? <div className="mt-3"><Banner tone="danger">{error}</Banner></div> : null}
      {info ? <div className="mt-3"><Banner>{info}</Banner></div> : null}
      {sections.map((section) => (
        <section key={section} className="mt-8">
          <h2 className="text-lg font-semibold">{section}</h2>
          <ul className="mt-3 space-y-4">
            {view.questions.filter((question) => question.sectionTitle === section).map((question) => {
              const answer = answers[question.id];
              if (!answer) return null;
              return (
                <li key={question.id} className="rounded-lg border border-line bg-card p-3">
                  <p className="text-sm font-medium">{question.prompt}</p>
                  {question.helpText ? <p className="mt-1 text-xs text-muted">{question.helpText}</p> : null}
                  {question.type === "yes_no" || question.type === "yes_no_na" ? (
                    <div className="mt-2 flex gap-3 text-sm">
                      <label><input type="radio" name={question.id} checked={answer.answerBoolean === true && !answer.answerNa} disabled={view.locked} onChange={() => setAnswers({ ...answers, [question.id]: { ...answer, answerBoolean: true, answerNa: false } })} /> Yes</label>
                      <label><input type="radio" name={question.id} checked={answer.answerBoolean === false && !answer.answerNa} disabled={view.locked} onChange={() => setAnswers({ ...answers, [question.id]: { ...answer, answerBoolean: false, answerNa: false } })} /> No</label>
                      {question.type === "yes_no_na" ? <label><input type="radio" name={question.id} checked={answer.answerNa} disabled={view.locked} onChange={() => setAnswers({ ...answers, [question.id]: { ...answer, answerBoolean: null, answerNa: true } })} /> N/A</label> : null}
                    </div>
                  ) : null}
                  {question.type === "multiple_choice" ? (
                    <SelectInput className="mt-2" disabled={view.locked} value={answer.answerChoice} onChange={(event) => setAnswers({ ...answers, [question.id]: { ...answer, answerChoice: event.target.value } })}>
                      <option value="">Select</option>
                      {question.options.map((option) => <option key={option}>{option}</option>)}
                    </SelectInput>
                  ) : null}
                  {question.type === "text" || question.type === "file_request" ? (
                    <TextArea className="mt-2" disabled={view.locked} value={answer.answerText} onChange={(event) => setAnswers({ ...answers, [question.id]: { ...answer, answerText: event.target.value } })} />
                  ) : null}
                  {question.type === "file_request" && !view.locked ? (
                    <form className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end" onSubmit={async (event) => {
                      event.preventDefault();
                      const input = event.currentTarget.elements.namedItem("file");
                      const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined;
                      if (!file) return;
                      try {
                        await repo.addPortalDocument(token, file, { questionId: question.id, documentType: docTypes[question.id] ?? "other" });
                        setError("");
                        setInfo("File uploaded.");
                        await reload();
                      } catch (caught) {
                        setError(publicErrorMessage(caught));
                      }
                    }}>
                      <Field label="Document type">
                        <SelectInput value={docTypes[question.id] ?? "other"} onChange={(event) => setDocTypes({ ...docTypes, [question.id]: event.target.value as DocumentType })}>
                          {DOCUMENT_TYPES.map((type) => <option key={type} value={type}>{DOCUMENT_TYPE_LABEL[type]}</option>)}
                        </SelectInput>
                      </Field>
                      <Field label="Evidence file"><input name="file" type="file" className="text-sm" /></Field>
                      <Button type="submit" variant="secondary">Upload</Button>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {!view.locked ? (
        <div className="mt-6 flex gap-2">
          <Button onClick={async () => {
            try {
              await repo.savePortalAnswers(token, Object.values(answers));
              setInfo("Progress saved.");
              setError("");
            } catch (caught) {
              setError(publicErrorMessage(caught));
            }
          }}>Save progress</Button>
          <Button variant="secondary" onClick={async () => {
            try {
              await repo.savePortalAnswers(token, Object.values(answers));
              await repo.submitPortal(token);
              setInfo("Submitted. Thank you.");
              setError("");
              await reload();
            } catch (caught) {
              setError(publicErrorMessage(caught));
            }
          }}>Submit</Button>
        </div>
      ) : null}
      <p className="mt-8 text-xs text-muted">Accepted uploads: PDF, DOCX, XLSX, CSV, TXT, PNG, JPG, WebP. Maximum 10 MB. {DOCUMENT_TYPES.length} document types are available to the analyst after upload, including {DOCUMENT_TYPE_LABEL.soc2_type_ii}.</p>
    </main>
  );
}
