"use client";

import { useState } from "react";
import Link from "next/link";
import { useWorkspace } from "@/components/providers";
import { Banner, Button, PageHeader, TextArea } from "@/components/ui";
import { downloadText } from "@/lib/format";
import { publicErrorMessage } from "@/lib/domain/errors";

export default function ImportVendorsPage() {
  const { repo } = useWorkspace();
  const [csv, setCsv] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<{ row: number; message: string }[]>([]);
  if (!repo) return null;
  return (
    <div>
      <PageHeader title="Import vendors" description="Valid rows are created. Invalid rows are listed and skipped. Nothing broken is saved silently." actions={<Button variant="secondary" onClick={() => downloadText("vendor-import-template.csv", repo.vendorImportTemplate())}>Download template</Button>} />
      <form
        className="max-w-3xl space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          repo.importVendors(csv).then((result) => {
            setErrors(result.errors);
            setMessage(`Created ${result.created.length} vendor${result.created.length === 1 ? "" : "s"}.`);
          }).catch((caught: unknown) => {
            setMessage("");
            setErrors([{ row: 0, message: publicErrorMessage(caught) }]);
          });
        }}
      >
        {message ? <Banner>{message} <Link href="/vendors" className="underline">View vendors</Link></Banner> : null}
        {errors.length > 0 ? (
          <Banner tone="warning">
            <ul>{errors.map((error) => <li key={`${error.row}-${error.message}`}>{error.row ? `Row ${error.row}: ` : ""}{error.message}</li>)}</ul>
          </Banner>
        ) : null}
        <TextArea aria-label="Vendor CSV" className="min-h-64 font-mono text-xs" value={csv} onChange={(event) => setCsv(event.target.value)} placeholder="Paste CSV here" />
        <Button type="submit">Validate and import</Button>
      </form>
    </div>
  );
}
