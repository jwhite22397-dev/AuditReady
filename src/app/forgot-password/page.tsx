"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthCard } from "../login/page";
import { useWorkspace } from "@/components/providers";
import { Banner, Button, Field, TextInput } from "@/components/ui";
import { publicErrorMessage } from "@/lib/domain/errors";

export default function ForgotPasswordPage() {
  const { repo } = useWorkspace();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  return (
    <AuthCard title="Reset password" subtitle="We will not reveal whether an account exists.">
      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!repo) return;
          setError("");
          try {
            const result = await repo.requestPasswordReset(email);
            setMessage(result.message);
          } catch (caught) {
            setError(publicErrorMessage(caught));
          }
        }}
      >
        {error ? <Banner tone="danger">{error}</Banner> : null}
        {message ? <Banner>{message}</Banner> : null}
        <Field label="Email"><TextInput type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></Field>
        <Button type="submit" className="w-full">Send reset link</Button>
      </form>
      <p className="mt-4 text-sm"><Link href="/login" className="text-teal-dark">Back to sign in</Link></p>
    </AuthCard>
  );
}
