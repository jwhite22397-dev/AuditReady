"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { AuthCard } from "../login/page";
import { publicErrorMessage } from "@/lib/domain/errors";
import { signUpSchema } from "@/lib/domain/validation";
import { useWorkspace } from "@/components/providers";
import { Banner, Button, Field, TextInput } from "@/components/ui";

export default function SignupPage() {
  const { repo } = useWorkspace();
  const router = useRouter();
  const [error, setError] = useState("");
  const form = useForm({ defaultValues: { fullName: "", email: "", password: "" } });
  return (
    <AuthCard title="Create your account" subtitle="You will name the workspace on the next step.">
      <form
        className="space-y-3"
        onSubmit={form.handleSubmit(async (values) => {
          const parsed = signUpSchema.safeParse(values);
          if (!parsed.success) {
            setError(parsed.error.issues[0]?.message ?? "Check the form.");
            return;
          }
          if (!repo) return;
          setError("");
          try {
            await repo.signUp(parsed.data);
            router.push("/onboarding");
          } catch (caught) {
            setError(publicErrorMessage(caught));
          }
        })}
      >
        {error ? <Banner tone="danger">{error}</Banner> : null}
        <Field label="Your name"><TextInput autoComplete="name" {...form.register("fullName")} /></Field>
        <Field label="Work email"><TextInput type="email" autoComplete="email" {...form.register("email")} /></Field>
        <Field label="Password" hint="At least 10 characters, with a letter and a number."><TextInput type="password" autoComplete="new-password" {...form.register("password")} /></Field>
        <Button type="submit" className="w-full">Continue</Button>
      </form>
      <p className="mt-4 text-sm text-muted">Already have an account? <Link href="/login" className="text-teal-dark">Sign in</Link></p>
    </AuthCard>
  );
}
