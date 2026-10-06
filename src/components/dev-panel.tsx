"use client";

import { useState } from "react";
import type { AssessmentStatus, RiskLevel } from "@/lib/domain/types";
import { ASSESSMENT_STATUSES, RISK_LEVELS } from "@/lib/domain/types";
import { ASSESSMENT_STATUS_LABEL, RISK_LABEL } from "@/lib/domain/labels";
import { publicErrorMessage } from "@/lib/domain/errors";
import type { DemoRepository } from "@/lib/data/demo-repository";
import { NORTHSTAR_PORTAL_TOKEN } from "@/lib/data/seed";
import { Button, SelectInput } from "./ui";

export function DevPanel({ repo, onError }: { repo: DemoRepository; onError: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [assessmentId, setAssessmentId] = useState("");
  const [status, setStatus] = useState<AssessmentStatus>("in_review");
  const [risk, setRisk] = useState<RiskLevel>("high");
  if (repo.mode !== "demo" || process.env.NEXT_PUBLIC_DATA_MODE === "supabase") return null;
  const assessments = repo.getSession() ? repo.listAssessments() : [];
  const selected = assessmentId || assessments[0]?.id || "";

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      onError("");
    } catch (error) {
      onError(publicErrorMessage(error));
    }
  }

  return (
    <div className="no-print fixed bottom-3 right-3 z-40">
      {open ? (
        <div className="mb-2 w-80 rounded-lg border border-line bg-card p-3 text-sm shadow-xl">
          <p className="font-medium">Development panel</p>
          <p className="mt-1 text-xs text-muted">Hidden when production data mode is on. It only changes this browser&apos;s demo workspace.</p>
          <label className="mt-3 block text-xs">Switch role
            <SelectInput className="mt-1" value={repo.getSession()?.userId ?? ""} onChange={(event) => run(() => repo.devSwitchUser(event.target.value))}>
              {repo.devUsers().map((user) => (
                <option key={user.id} value={user.id}>{user.fullName} · {user.role}</option>
              ))}
            </SelectInput>
          </label>
          <label className="mt-2 block text-xs">Assessment
            <SelectInput className="mt-1" value={selected} onChange={(event) => setAssessmentId(event.target.value)}>
              {assessments.map((item) => <option key={item.id} value={item.id}>{item.vendorName}</option>)}
            </SelectInput>
          </label>
          <div className="mt-2 flex gap-2">
            <SelectInput value={status} onChange={(event) => setStatus(event.target.value as AssessmentStatus)}>
              {ASSESSMENT_STATUSES.map((item) => <option key={item} value={item}>{ASSESSMENT_STATUS_LABEL[item]}</option>)}
            </SelectInput>
            <Button onClick={() => selected && run(() => repo.devForceStatus(selected, status))}>Set</Button>
          </div>
          <div className="mt-2 flex gap-2">
            <SelectInput value={risk} onChange={(event) => setRisk(event.target.value as RiskLevel)}>
              {RISK_LEVELS.map((item) => <option key={item} value={item}>{RISK_LABEL[item]}</option>)}
            </SelectInput>
            <Button onClick={() => selected && run(() => repo.devSetRisk(selected, risk))}>Risk</Button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => run(() => repo.devCreateSampleVendor())}>Sample vendor</Button>
            <Button variant="secondary" onClick={() => selected && run(() => repo.devForceSubmit(selected))}>Force submit</Button>
            <Button variant="secondary" onClick={() => selected && run(() => repo.devGenerateFinding(selected))}>New finding</Button>
            <Button variant="secondary" onClick={() => run(() => repo.devShiftDueDates(-10))}>Shift due −10d</Button>
            <Button variant="secondary" onClick={() => run(() => repo.reset())}>Reset demo</Button>
            <a className="inline-flex h-9 items-center justify-center rounded-md border border-line-strong px-2 text-center text-xs" href={`/portal/${NORTHSTAR_PORTAL_TOKEN}`}>Northstar portal</a>
          </div>
        </div>
      ) : null}
      <Button variant="secondary" onClick={() => setOpen((value) => !value)}>Dev</Button>
    </div>
  );
}
