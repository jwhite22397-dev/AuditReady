"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { DEMO_PASSWORD } from "@/lib/data/seed";
import { publicErrorMessage } from "@/lib/domain/errors";
import { useWorkspace } from "@/components/providers";
import { Banner, Button, Field, TextInput } from "@/components/ui";

function LoginForm() {
  const { repo, ready } = useWorkspace();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";
  const [error, setError] = useState("");
  const form = useForm({ defaultValues: { email: "alex@acme.example", password: DEMO_PASSWORD } });

  useEffect(() => {
    if (ready && repo?.getSession()?.organizationId) router.replace("/dashboard");
  }, [ready, repo, router]);

  return (
    <AuthCard title="Sign in" subtitle="Use a workspace account, or the Acme demo.">
      <form
        className="space-y-3"
        onSubmit={form.handleSubmit(async (values) => {
          if (!repo) return;
          setError("");
          try {
            const session = await repo.signIn(values.email, values.password);
            router.push(session.organizationId ? next : "/onboarding");
          } catch (caught) {
            setError(publicErrorMessage(caught));
          }
        })}
      >
        {error ? <Banner tone="danger">{error}</Banner> : null}
        <Field label="Email"><TextInput type="email" autoComplete="username" {...form.register("email")} /></Field>
        <Field label="Password"><TextInput type="password" autoComplete="current-password" {...form.register("password")} /></Field>
        <Button type="submit" className="w-full">Sign in</Button>
      </form>
      <p className="mt-4 text-sm text-muted">Demo password for Alex, Priya, Jordan, and Sam: <span className="font-mono text-ink">{DEMO_PASSWORD}</span></p>
      <p className="mt-3 text-sm"><Link href="/forgot-password" className="text-teal-dark">Forgot password</Link> · <Link href="/signup" className="text-teal-dark">Create an account</Link></p>
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthCard title="Sign in" subtitle="Loading" />}>
      <LoginForm />
    </Suspense>
  );
}

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <Link href="/" className="text-sm font-semibold tracking-[0.16em]">AUDITREADY</Link>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">{title}</h1>
      {subtitle ? <p className="mt-2 text-sm text-muted">{subtitle}</p> : null}
      <div className="mt-6">{children}</div>
    </main>
  );
}
