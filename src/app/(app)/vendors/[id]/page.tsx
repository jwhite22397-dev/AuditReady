"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { CATEGORY_LABEL, DATA_ACCESS_LABEL, FREQUENCY_LABEL, SYSTEM_ACCESS_LABEL } from "@/lib/domain/labels";
import { CRITICALITIES, INHERENT_FACTORS } from "@/lib/domain/types";
import { CRITICALITY_LABEL } from "@/lib/domain/labels";
import { scoreInherent } from "@/lib/domain/risk";
import { roleHasPermission } from "@/lib/domain/permissions";
import { publicErrorMessage } from "@/lib/domain/errors";
import { formatDate, formatDateTime } from "@/lib/format";
import { useWorkspace } from "@/components/providers";
import { Banner, Button, EmptyState, Field, FindingBadge, PageHeader, RiskBadge, SelectInput, StatusBadge, TextArea, TextInput } from "@/components/ui";

const TABS = ["Overview", "Risk", "Assessments", "Documents", "Findings", "Contacts", "Activity"] as const;

export default function VendorDetailPage() {
  const params = useParams<{ id: string }>();
  const { repo, nonce } = useWorkspace();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [error, setError] = useState("");
  void nonce;
  if (!repo) return null;
  let detail: ReturnType<typeof repo.getVendor> | null = null;
  try {
    detail = repo.getVendor(params.id);
  } catch (caught) {
    return <EmptyState title="Vendor not found" body={publicErrorMessage(caught)} />;
  }
  const { vendor, contacts, assessments, documents, findings, activity } = detail;
  const session = repo.getSession();
  const canWrite = roleHasPermission(session?.role, "vendors.write");

  return (
    <div>
      <PageHeader
        title={vendor.name}
        description={vendor.service}
        actions={
          <>
            <RiskBadge level={vendor.criticality} kind="criticality" />
            <RiskBadge level={vendor.overallRisk} />
            {canWrite ? <Link href={`/assessments/new?vendor=${vendor.id}`} className="inline-flex h-9 items-center rounded-md bg-teal px-3 text-sm font-medium text-white">Start assessment</Link> : null}
          </>
        }
      />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <div className="mb-4 flex gap-1 overflow-auto border-b border-line" role="tablist">
        {TABS.map((item) => (
          <button key={item} role="tab" aria-selected={tab === item} className={`px-3 py-2 text-sm ${tab === item ? "border-b-2 border-teal font-medium" : "text-muted"}`} onClick={() => setTab(item)}>{item}</button>
        ))}
      </div>
      {tab === "Overview" ? (
        <dl className="grid gap-3 text-sm md:grid-cols-2">
          {[
            ["Website", vendor.website || "—"],
            ["Category", CATEGORY_LABEL[vendor.category]],
            ["Business owner", vendor.businessOwner || "—"],
            ["Security owner", vendor.securityOwner || "—"],
            ["Data access", DATA_ACCESS_LABEL[vendor.dataAccess]],
            ["System access", SYSTEM_ACCESS_LABEL[vendor.systemAccess]],
            ["Review frequency", FREQUENCY_LABEL[vendor.reviewFrequency]],
            ["Last assessment", formatDate(vendor.lastAssessmentAt)],
            ["Next review", formatDate(vendor.nextReviewAt)],
            ["Status", vendor.assessmentStatus],
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border border-line bg-card px-3 py-2">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="mt-1">{value}</dd>
            </div>
          ))}
          <div className="md:col-span-2 rounded-md border border-line bg-card px-3 py-2">
            <dt className="text-xs text-muted">Notes</dt>
            <dd className="mt-1 whitespace-pre-wrap">{vendor.notes || "No notes."}</dd>
          </div>
        </dl>
      ) : null}
      {tab === "Risk" ? <RiskTab vendorId={vendor.id} canWrite={canWrite} onError={setError} /> : null}
      {tab === "Assessments" ? (
        assessments.length === 0 ? <EmptyState title="No assessments yet" body="Start one when you are ready to send a questionnaire." /> : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-card">
            {assessments.map((item) => (
              <li key={item.id}><Link className="flex items-center justify-between px-3 py-2 text-sm" href={`/assessments/${item.id}`}><span>{item.name}</span><StatusBadge status={item.status} /></Link></li>
            ))}
          </ul>
        )
      ) : null}
      {tab === "Documents" ? (
        documents.length === 0 ? <EmptyState title="No documents" body="Evidence uploaded on an assessment will also appear with the vendor." /> : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-card text-sm">
            {documents.map((document) => <li key={document.id} className="px-3 py-2">{document.fileName}<span className="ml-2 text-muted">{document.documentType} · {formatDate(document.uploadedAt)}</span></li>)}
          </ul>
        )
      ) : null}
      {tab === "Findings" ? (
        findings.length === 0 ? <EmptyState title="No findings" body="Findings created during assessments are kept on the vendor record." /> : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-card">
            {findings.map((finding) => (
              <li key={finding.id}><Link className="flex items-center justify-between px-3 py-2 text-sm" href={`/findings/${finding.id}`}><span>{finding.reference} {finding.title}</span><FindingBadge status={finding.status} /></Link></li>
            ))}
          </ul>
        )
      ) : null}
      {tab === "Contacts" ? <ContactsTab vendorId={vendor.id} contacts={contacts} canWrite={canWrite} onError={setError} /> : null}
      {tab === "Activity" ? (
        <ol className="divide-y divide-line rounded-lg border border-line bg-card">
          {activity.slice(0, 40).map((event) => (
            <li key={event.id} className="px-3 py-2 text-sm"><span className="text-muted">{formatDateTime(event.createdAt)}</span> {event.summary}</li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

function RiskTab({ vendorId, canWrite, onError }: { vendorId: string; canWrite: boolean; onError: (message: string) => void }) {
  const { repo, nonce } = useWorkspace();
  const vendor = repo && nonce >= 0 ? repo.getVendor(vendorId).vendor : null;
  const [criticality, setCriticality] = useState(vendor?.criticality ?? "moderate");
  const [justification, setJustification] = useState(vendor?.criticalityJustification ?? "");
  const [factors, setFactors] = useState(vendor?.criticalityFactors ?? {
    sensitiveData: false, productionAccess: false, businessDependency: false, privilegedAccess: false, customerData: false, financialImpact: false,
  });
  const [answers, setAnswers] = useState(vendor?.inherent?.answers ?? {
    customerData: false, pii: false, payment: false, productionAccess: false, privilegedAccess: false, operationallyCritical: false, hostsData: false, subprocessors: false,
  });
  const [override, setOverride] = useState(vendor?.inherent?.override ?? "");
  const [overrideJustification, setOverrideJustification] = useState(vendor?.inherent?.overrideJustification ?? "");
  if (!repo || !vendor) return null;
  const recommended = scoreInherent(answers);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form className="space-y-3 rounded-lg border border-line bg-card p-4" onSubmit={async (event) => {
        event.preventDefault();
        try {
          await repo.saveCriticality(vendorId, { criticality, criticalityJustification: justification, ...factors });
          onError("");
        } catch (caught) {
          onError(publicErrorMessage(caught));
        }
      }}>
        <h2 className="font-semibold">Criticality</h2>
        <p className="text-sm text-muted">Check the factors that apply. The rating is still your judgment — three or more often means high or critical, but you decide.</p>
        {Object.entries({
          sensitiveData: "Sensitive data access",
          productionAccess: "Production system access",
          businessDependency: "Business dependency",
          privilegedAccess: "Privileged access",
          customerData: "Customer data",
          financialImpact: "Financial impact",
        }).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={factors[key as keyof typeof factors]} onChange={(event) => setFactors({ ...factors, [key]: event.target.checked })} />
            {label}
          </label>
        ))}
        <Field label="Criticality rating">
          <SelectInput value={criticality} onChange={(event) => setCriticality(event.target.value as typeof criticality)}>
            {CRITICALITIES.map((level) => <option key={level} value={level}>{CRITICALITY_LABEL[level]}</option>)}
          </SelectInput>
        </Field>
        <Field label="Justification"><TextArea value={justification} onChange={(event) => setJustification(event.target.value)} /></Field>
        {canWrite ? <Button type="submit">Save criticality</Button> : <p className="text-sm text-muted">Viewers cannot change criticality.</p>}
      </form>
      <form className="space-y-3 rounded-lg border border-line bg-card p-4" onSubmit={async (event) => {
        event.preventDefault();
        try {
          await repo.saveInherentRisk(vendorId, { ...answers, override: override || null, overrideJustification });
          onError("");
        } catch (caught) {
          onError(publicErrorMessage(caught));
        }
      }}>
        <h2 className="font-semibold">Inherent risk</h2>
        <p className="text-sm text-muted">Recommended tier: {recommended.level} ({recommended.score}/18). This is not the final residual risk.</p>
        {INHERENT_FACTORS.map((factor) => (
          <label key={factor.key} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={answers[factor.key]} onChange={(event) => setAnswers({ ...answers, [factor.key]: event.target.checked })} />
            {factor.label} <span className="text-muted">+{factor.weight}</span>
          </label>
        ))}
        <Field label="Override" hint="Leave blank to keep the recommendation. A different tier needs a justification.">
          <SelectInput value={override} onChange={(event) => setOverride(event.target.value)}>
            <option value="">Use recommendation</option>
            {CRITICALITIES.map((level) => <option key={level} value={level}>{CRITICALITY_LABEL[level]}</option>)}
          </SelectInput>
        </Field>
        <Field label="Override justification"><TextArea value={overrideJustification} onChange={(event) => setOverrideJustification(event.target.value)} /></Field>
        {canWrite ? <Button type="submit">Save inherent risk</Button> : null}
      </form>
    </div>
  );
}

function ContactsTab({ vendorId, contacts, canWrite, onError }: { vendorId: string; contacts: { id: string; name: string; title: string; email: string; contactRole: string }[]; canWrite: boolean; onError: (message: string) => void }) {
  const { repo } = useWorkspace();
  const [form, setForm] = useState({ name: "", title: "", email: "", contactRole: "Security" });
  if (!repo) return null;
  return (
    <div className="space-y-4">
      {contacts.length === 0 ? <p className="text-sm text-muted">No contacts yet. These are visible only inside the workspace.</p> : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-card text-sm">
          {contacts.map((contact) => (
            <li key={contact.id} className="flex items-center justify-between px-3 py-2">
              <span>{contact.name} · {contact.contactRole}<span className="block text-muted">{contact.title} {contact.email}</span></span>
              {canWrite ? <button className="text-xs text-critical" onClick={() => repo.removeContact(contact.id).catch((error) => onError(publicErrorMessage(error)))}>Remove</button> : null}
            </li>
          ))}
        </ul>
      )}
      {canWrite ? (
        <form className="grid gap-2 md:grid-cols-4" onSubmit={async (event) => {
          event.preventDefault();
          try {
            await repo.addContact(vendorId, form);
            setForm({ name: "", title: "", email: "", contactRole: "Security" });
            onError("");
          } catch (caught) {
            onError(publicErrorMessage(caught));
          }
        }}>
          <TextInput aria-label="Contact name" placeholder="Name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          <TextInput aria-label="Title" placeholder="Title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          <TextInput aria-label="Email" placeholder="Email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          <TextInput aria-label="Role" placeholder="Security, Sales..." value={form.contactRole} onChange={(event) => setForm({ ...form, contactRole: event.target.value })} />
          <Button type="submit">Add contact</Button>
        </form>
      ) : null}
    </div>
  );
}
