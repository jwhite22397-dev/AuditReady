"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { QUESTION_TYPE_LABEL } from "@/lib/domain/labels";
import { QUESTION_TYPES } from "@/lib/domain/types";
import { roleHasPermission } from "@/lib/domain/permissions";
import { publicErrorMessage } from "@/lib/domain/errors";
import { useWorkspace } from "@/components/providers";
import { Banner, Button, EmptyState, Field, PageHeader, SelectInput, TextArea } from "@/components/ui";

export default function TemplatePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { repo, nonce } = useWorkspace();
  const [error, setError] = useState("");
  const [prompt, setPrompt] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [type, setType] = useState<(typeof QUESTION_TYPES)[number]>("yes_no");
  const [options, setOptions] = useState("");
  void nonce;
  if (!repo) return null;
  let detail: ReturnType<typeof repo.getTemplate>;
  try {
    detail = repo.getTemplate(params.id);
  } catch (caught) {
    return <EmptyState title="Questionnaire not found" body={publicErrorMessage(caught)} />;
  }
  const canWrite = roleHasPermission(repo.getSession()?.role, "questionnaires.write");
  const sections = detail.sections;
  const activeSection = sectionId || sections[0]?.id || "";
  return (
    <div>
      <PageHeader title={detail.template.name} description={detail.template.description} actions={canWrite ? <Button variant="danger" onClick={() => repo.archiveTemplate(detail.template.id).then(() => router.push("/questionnaires")).catch((caught) => setError(publicErrorMessage(caught)))}>Archive</Button> : null} />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <div className="space-y-4">
        {sections.map((section) => (
          <section key={section.id}>
            <h2 className="text-sm font-semibold">{section.title}</h2>
            <ul className="mt-2 divide-y divide-line rounded-lg border border-line bg-card">
              {section.questions.map((question) => (
                <li key={question.id} className="px-3 py-2 text-sm">
                  <p>{question.prompt}</p>
                  <p className="text-xs text-muted">{QUESTION_TYPE_LABEL[question.type]} · weight {question.riskWeight}{question.controlRef ? ` · ${question.controlRef}` : ""}{question.mappings.length ? ` · ${question.mappings.map((item) => `${item.framework} ${item.reference}`).join(", ")}` : ""}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {canWrite ? (
        <form className="mt-6 grid max-w-xl gap-2" onSubmit={(event) => {
          event.preventDefault();
          repo.addQuestion(detail.template.id, {
            sectionId: activeSection,
            prompt,
            helpText: "",
            type,
            options: options.split("\n").map((item) => item.trim()).filter(Boolean),
            riskWeight: 3,
            evidenceRequired: false,
            guidance: "",
            controlRef: "",
          }).then(() => setPrompt("")).catch((caught) => setError(publicErrorMessage(caught)));
        }}>
          <h2 className="font-semibold">Add a question</h2>
          <Field label="Section">
            <SelectInput value={activeSection} onChange={(event) => setSectionId(event.target.value)}>
              {sections.map((section) => <option key={section.id} value={section.id}>{section.title}</option>)}
            </SelectInput>
          </Field>
          <Field label="Question"><TextArea value={prompt} onChange={(event) => setPrompt(event.target.value)} /></Field>
          <Field label="Type">
            <SelectInput value={type} onChange={(event) => setType(event.target.value as typeof type)}>
              {QUESTION_TYPES.map((item) => <option key={item} value={item}>{QUESTION_TYPE_LABEL[item]}</option>)}
            </SelectInput>
          </Field>
          {type === "multiple_choice" ? <Field label="Options, one per line"><TextArea value={options} onChange={(event) => setOptions(event.target.value)} /></Field> : null}
          <Button type="submit">Add question</Button>
        </form>
      ) : null}
    </div>
  );
}
