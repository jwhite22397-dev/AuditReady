"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { CATEGORY_LABEL, CRITICALITY_LABEL, DATA_ACCESS_LABEL, FREQUENCY_LABEL, SYSTEM_ACCESS_LABEL } from "@/lib/domain/labels";
import { CRITICALITIES, DATA_ACCESS_LEVELS, REVIEW_FREQUENCIES, SYSTEM_ACCESS_LEVELS, VENDOR_CATEGORIES } from "@/lib/domain/types";
import type { Vendor } from "@/lib/domain/types";
import { publicErrorMessage } from "@/lib/domain/errors";
import { vendorSchema } from "@/lib/domain/validation";
import { useWorkspace } from "./providers";
import { Banner, Button, Field, PageHeader, SelectInput, TextArea, TextInput } from "./ui";

export function VendorForm({ vendor }: { vendor?: Vendor }) {
  const { repo } = useWorkspace();
  const router = useRouter();
  const [error, setError] = useState("");
  const form = useForm({
    defaultValues: vendor ?? {
      name: "",
      website: "",
      service: "",
      category: "saas" as const,
      businessOwner: "",
      securityOwner: "",
      criticality: "moderate" as const,
      dataAccess: "internal" as const,
      systemAccess: "none" as const,
      reviewFrequency: "annual" as const,
      notes: "",
    },
  });

  return (
    <div>
      <PageHeader title={vendor ? `Edit ${vendor.name}` : "New vendor"} description="Capture enough to know why this company matters. Criticality here is your judgment, not a score." />
      <form
        className="grid max-w-3xl gap-3"
        onSubmit={form.handleSubmit(async (values) => {
          const parsed = vendorSchema.safeParse(values);
          if (!parsed.success) {
            setError(parsed.error.issues[0]?.message ?? "Check the form.");
            return;
          }
          if (!repo) return;
          try {
            const saved = vendor ? await repo.updateVendor(vendor.id, parsed.data) : await repo.createVendor(parsed.data);
            router.push(`/vendors/${saved.id}`);
          } catch (caught) {
            setError(publicErrorMessage(caught));
          }
        })}
      >
        {error ? <Banner tone="danger">{error}</Banner> : null}
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Vendor name"><TextInput {...form.register("name")} /></Field>
          <Field label="Website"><TextInput placeholder="https://" {...form.register("website")} /></Field>
          <Field label="Service or product"><TextInput {...form.register("service")} /></Field>
          <Field label="Category">
            <SelectInput {...form.register("category")}>{VENDOR_CATEGORIES.map((item) => <option key={item} value={item}>{CATEGORY_LABEL[item]}</option>)}</SelectInput>
          </Field>
          <Field label="Business owner"><TextInput {...form.register("businessOwner")} /></Field>
          <Field label="Security owner"><TextInput {...form.register("securityOwner")} /></Field>
          <Field label="Criticality">
            <SelectInput {...form.register("criticality")}>{CRITICALITIES.map((item) => <option key={item} value={item}>{CRITICALITY_LABEL[item]}</option>)}</SelectInput>
          </Field>
          <Field label="Review frequency">
            <SelectInput {...form.register("reviewFrequency")}>{REVIEW_FREQUENCIES.map((item) => <option key={item} value={item}>{FREQUENCY_LABEL[item]}</option>)}</SelectInput>
          </Field>
          <Field label="Data access">
            <SelectInput {...form.register("dataAccess")}>{DATA_ACCESS_LEVELS.map((item) => <option key={item} value={item}>{DATA_ACCESS_LABEL[item]}</option>)}</SelectInput>
          </Field>
          <Field label="System access">
            <SelectInput {...form.register("systemAccess")}>{SYSTEM_ACCESS_LEVELS.map((item) => <option key={item} value={item}>{SYSTEM_ACCESS_LABEL[item]}</option>)}</SelectInput>
          </Field>
        </div>
        <Field label="Notes"><TextArea {...form.register("notes")} /></Field>
        <Button type="submit">{vendor ? "Save vendor" : "Create vendor"}</Button>
      </form>
    </div>
  );
}
