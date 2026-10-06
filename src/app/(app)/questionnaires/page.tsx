"use client";

import Link from "next/link";
import { useState } from "react";
import { roleHasPermission } from "@/lib/domain/permissions";
import { publicErrorMessage } from "@/lib/domain/errors";
import { useWorkspace } from "@/components/providers";
import { Banner, Button, PageHeader, TextInput } from "@/components/ui";

export default function QuestionnairesPage() {
  const { repo, nonce } = useWorkspace();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  void nonce;
  if (!repo) return null;
  const session = repo.getSession();
  const canWrite = roleHasPermission(session?.role, "questionnaires.write");
  const templates = repo.listTemplates();
  return (
    <div>
      <PageHeader title="Questionnaires" description="Templates are copied into each assessment. Editing a template does not rewrite reviews already in progress. Mappings are illustrative, not a claim of framework coverage." />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <ul className="divide-y divide-line rounded-lg border border-line bg-card">
        {templates.map((template) => (
          <li key={template.id} className="flex items-center justify-between gap-3 px-3 py-3 text-sm">
            <div>
              <Link href={`/questionnaires/${template.id}`} className="font-medium">{template.name}</Link>
              <p className="text-muted">{template.questionCount} questions{template.builtinKey ? " · built in" : ""}</p>
            </div>
            {canWrite ? <Button variant="secondary" onClick={() => repo.duplicateTemplate(template.id).catch((caught) => setError(publicErrorMessage(caught)))}>Duplicate</Button> : null}
          </li>
        ))}
      </ul>
      {canWrite ? (
        <form className="mt-4 flex max-w-lg gap-2" onSubmit={(event) => {
          event.preventDefault();
          repo.createTemplate({ name, description: "" }).then(() => setName("")).catch((caught) => setError(publicErrorMessage(caught)));
        }}>
          <TextInput aria-label="New template name" value={name} onChange={(event) => setName(event.target.value)} placeholder="New template name" />
          <Button type="submit">Create</Button>
        </form>
      ) : null}
    </div>
  );
}
