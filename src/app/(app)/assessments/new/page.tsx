"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ASSESSMENT_TYPES } from "@/lib/domain/types";
import { ASSESSMENT_TYPE_LABEL } from "@/lib/domain/labels";
import { assessmentSchema } from "@/lib/domain/validation";
import { publicErrorMessage } from "@/lib/domain/errors";
import { addDays } from "@/lib/domain/tokens";
import { useWorkspace } from "@/components/providers";
import { Banner, Button, Field, PageHeader, SelectInput, TextInput } from "@/components/ui";

function NewAssessmentForm() {
  const { repo } = useWorkspace();
  const router = useRouter();
  const params = useSearchParams();
  const vendors = repo?.listVendors() ?? [];
  const templates = repo?.listTemplates() ?? [];
  const members = repo?.listMembers() ?? [];
  const session = repo?.getSession();
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    vendorId: params.get("vendor") || vendors[0]?.id || "",
    name: "",
    type: "initial" as const,
    ownerId: session?.userId || members[0]?.userId || "",
    templateId: templates[0]?.id || "",
    dueDate: addDays(new Date().toISOString(), 21).slice(0, 10),
  });
  if (!repo) return null;
  const vendor = vendors.find((item) => item.id === form.vendorId);
  const name = form.name || (vendor ? `${vendor.name} security assessment` : "");

  return (
    <div>
      <PageHeader title="New assessment" description="Questions are copied from the template. Later template edits do not change this assessment." />
      <form className="grid max-w-xl gap-3" onSubmit={async (event) => {
        event.preventDefault();
        const parsed = assessmentSchema.safeParse({ ...form, name });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? "Check the form.");
          return;
        }
        try {
          const assessment = await repo.createAssessment(parsed.data);
          router.push(`/assessments/${assessment.id}`);
        } catch (caught) {
          setError(publicErrorMessage(caught));
        }
      }}>
        {error ? <Banner tone="danger">{error}</Banner> : null}
        <Field label="Vendor">
          <SelectInput value={form.vendorId} onChange={(event) => setForm({ ...form, vendorId: event.target.value })}>
            {vendors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </SelectInput>
        </Field>
        <Field label="Assessment name"><TextInput value={name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
        <Field label="Type">
          <SelectInput value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as typeof form.type })}>
            {ASSESSMENT_TYPES.map((type) => <option key={type} value={type}>{ASSESSMENT_TYPE_LABEL[type]}</option>)}
          </SelectInput>
        </Field>
        <Field label="Owner">
          <SelectInput value={form.ownerId} onChange={(event) => setForm({ ...form, ownerId: event.target.value })}>
            {members.map((member) => <option key={member.userId} value={member.userId}>{member.fullName}</option>)}
          </SelectInput>
        </Field>
        <Field label="Questionnaire">
          <SelectInput value={form.templateId} onChange={(event) => setForm({ ...form, templateId: event.target.value })}>
            {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
          </SelectInput>
        </Field>
        <Field label="Due date"><TextInput type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} /></Field>
        <Button type="submit">Create assessment</Button>
      </form>
    </div>
  );
}

export default function NewAssessmentPage() {
  return <Suspense fallback={<p className="text-sm text-muted">Loading</p>}><NewAssessmentForm /></Suspense>;
}
