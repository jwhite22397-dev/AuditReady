"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useWorkspace } from "@/components/providers";
import { Banner, Button, Field, TextInput } from "@/components/ui";
import { publicErrorMessage } from "@/lib/domain/errors";
import { organizationSchema } from "@/lib/domain/validation";

export default function OnboardingPage() {
  const { repo, ready } = useWorkspace();
  const router = useRouter();
  const [error, setError] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [leaving, setLeaving] = useState(false);
  const form = useForm({ defaultValues: { name: "", jobTitle: "Security Analyst" } });
  const session = repo?.getSession();

  useEffect(() => {
    if (!ready || leaving) return;
    if (!session) router.replace("/login");
    else if (session.organizationId) router.replace("/dashboard");
  }, [ready, session, router, leaving]);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5">
      <p className="text-sm font-semibold tracking-[0.16em]">AUDITREADY</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight">Welcome to AuditReady</h1>
      <p className="mt-2 text-sm text-muted">Create the workspace your team will use for vendor reviews. You become the owner.</p>
      <form
        className="mt-6 space-y-3"
        onSubmit={form.handleSubmit(async (values) => {
          const parsed = organizationSchema.safeParse(values);
          if (!parsed.success) {
            setError(parsed.error.issues[0]?.message ?? "Check the form.");
            return;
          }
          if (!repo) return;
          setLeaving(true);
          try {
            await repo.createOrganization(parsed.data);
            router.push("/vendors/new");
          } catch (caught) {
            setLeaving(false);
            setError(publicErrorMessage(caught));
          }
        })}
      >
        {error ? <Banner tone="danger">{error}</Banner> : null}
        <Field label="Company"><TextInput placeholder="Acme Technologies" {...form.register("name")} /></Field>
        <Field label="Your role" hint="This is your job title, not a permission."><TextInput {...form.register("jobTitle")} /></Field>
        <Button type="submit">Create workspace</Button>
      </form>
      <form className="mt-8 space-y-3 border-t border-line pt-6" onSubmit={async (event) => {
        event.preventDefault();
        if (!repo) return;
        setLeaving(true);
        try {
          await repo.acceptInvite(joinCode);
          router.push("/dashboard");
        } catch (caught) {
          setLeaving(false);
          setError(publicErrorMessage(caught));
        }
      }}>
        <h2 className="text-lg font-semibold">Have an invite?</h2>
        <p className="text-sm text-muted">Enter the code sent to this email address to join an existing workspace.</p>
        <Field label="Invite code"><TextInput value={joinCode} onChange={(event) => setJoinCode(event.target.value)} autoComplete="off" /></Field>
        <Button type="submit" variant="secondary">Join workspace</Button>
      </form>
    </main>
  );
}
