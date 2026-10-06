"use client";

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { ASSESSMENT_STATUS_LABEL, CRITICALITY_LABEL, FINDING_STATUS_LABEL, RISK_LABEL } from "@/lib/domain/labels";
import type { AssessmentStatus, Criticality, FindingStatus, RiskLevel } from "@/lib/domain/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  const styles = {
    primary: "bg-teal text-white hover:bg-teal-dark",
    secondary: "border border-line-strong bg-card text-ink hover:bg-paper",
    ghost: "text-ink-soft hover:bg-paper-2",
    danger: "bg-critical text-white hover:opacity-90",
  }[variant];
  return (
    <button
      type={type}
      className={cn("inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50", styles, className)}
      {...props}
    />
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn("h-9 w-full rounded-md border border-line-strong bg-card px-3 text-sm outline-none", props.className)} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn("min-h-24 w-full rounded-md border border-line-strong bg-card px-3 py-2 text-sm outline-none", props.className)} />;
}

export function SelectInput(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn("h-9 w-full rounded-md border border-line-strong bg-card px-2 text-sm outline-none", props.className)} />;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-ink">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function Banner({ tone = "info", children }: { tone?: "info" | "warning" | "danger"; children: ReactNode }) {
  const styles = { info: "bg-teal-soft text-teal-dark", warning: "bg-moderate-soft text-moderate", danger: "bg-critical-soft text-critical" }[tone];
  return <div className={cn("rounded-md px-3 py-2 text-sm", styles)}>{children}</div>;
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong bg-card px-6 py-10 text-center">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

const riskClass: Record<RiskLevel, string> = {
  low: "border-low/30 bg-low-soft text-low",
  moderate: "border-moderate/30 bg-moderate-soft text-moderate",
  high: "border-high/30 bg-high-soft text-high",
  critical: "border-critical/30 bg-critical-soft text-critical",
};

export function RiskBadge({ level, kind = "risk" }: { level: RiskLevel | null; kind?: "risk" | "criticality" }) {
  if (!level) return <span className="text-xs text-muted">Not rated</span>;
  const label = kind === "criticality" ? `${CRITICALITY_LABEL[level as Criticality]} criticality` : `${RISK_LABEL[level]} risk`;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium", riskClass[level])}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

export function StatusBadge({ status }: { status: AssessmentStatus | "not_started" }) {
  const label = status === "not_started" ? "Not started" : ASSESSMENT_STATUS_LABEL[status];
  return <span className="inline-flex rounded-full border border-line bg-paper px-2 py-0.5 text-xs font-medium text-ink-soft">{label}</span>;
}

export function FindingBadge({ status }: { status: FindingStatus }) {
  return <span className="inline-flex rounded-full border border-line bg-paper px-2 py-0.5 text-xs font-medium text-ink-soft">{FINDING_STATUS_LABEL[status]}</span>;
}

export function LoadingBlock({ label = "Loading workspace" }: { label?: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center text-sm text-muted" role="status">
      {label}
    </div>
  );
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 p-4 pt-20" role="presentation" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[80vh] w-full max-w-xl overflow-auto rounded-lg border border-line bg-card p-4 shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <Button variant="ghost" onClick={onClose} aria-label="Close">Close</Button>
        </div>
        {children}
      </div>
    </div>
  );
}
