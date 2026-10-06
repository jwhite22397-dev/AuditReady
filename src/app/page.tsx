import Link from "next/link";
import { planCatalog } from "@/lib/domain/entitlements";

const steps = [
  ["Vendor", "Record who they are, what they touch, and how critical they are."],
  ["Assessment", "Open a review, assign an owner, and set a due date."],
  ["Questionnaire", "Send a secure link. The vendor does not need an account."],
  ["Evidence", "Collect the SOC report, policies, and files next to the answers."],
  ["Findings", "Mark gaps, track remediation, or accept risk with a written reason."],
  ["Decision", "Approve, approve with conditions, or reject — then export the report."],
];

const features = [
  ["Vendor inventory", "Criticality, data access, owners, and the next review date in one registry."],
  ["Inherent risk", "Eight plain questions recommend a tier. Analysts can override it and say why."],
  ["Questionnaire", "A built-in vendor-security questionnaire, plus templates you can duplicate and edit."],
  ["Vendor portal", "Tokenized access for one assessment. No seat required."],
  ["Evidence review", "Private files and a structured SOC 2 review. The product does not pretend to read the PDF for you."],
  ["Findings and remediation", "Open, respond, remediate, accept, or close. High-risk acceptance needs an admin."],
  ["Risk decision", "Inherent, control, and residual risk stay visible. Overrides require a justification."],
  ["Audit history", "Meaningful changes are appended. The log is not a scratchpad."],
];

const faqs = [
  ["Is this a certification tool?", "No. AuditReady helps you record a vendor review. It does not certify your company or the vendor against SOC 2, ISO 27001, or any other framework."],
  ["Do vendors need to buy AuditReady?", "No. They use an expiring invitation link for that assessment only."],
  ["What happens to uploaded evidence?", "Files stay in private storage. In the browser demo they stay on your machine. They are not public links."],
  ["Can I try it without an account setup?", "Yes. View demo opens a seeded Acme Technologies workspace in this browser."],
];

export default function HomePage() {
  const plans = planCatalog();
  return (
    <div className="bg-paper text-ink">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <span className="text-sm font-semibold tracking-[0.16em]">AUDITREADY</span>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/login" className="text-ink-soft">Sign in</Link>
          <Link href="/signup" className="rounded-md bg-teal px-3 py-2 font-medium text-white">Start free</Link>
        </nav>
      </header>
      <main>
        <section className="mx-auto grid max-w-6xl gap-10 px-5 pb-16 pt-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div>
            <p className="text-sm font-medium text-teal-dark">Third-party risk for teams of 20–500</p>
            <h1 className="mt-3 max-w-3xl text-5xl font-semibold tracking-tight text-balance">Vendor risk management without the GRC nightmare.</h1>
            <p className="mt-4 max-w-xl text-lg text-ink-soft">Assess vendors, review evidence, track findings, and document risk decisions in one simple workspace.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/signup" className="rounded-md bg-teal px-4 py-2.5 text-sm font-medium text-white">Start free</Link>
              <Link href="/dashboard" className="rounded-md border border-line-strong bg-card px-4 py-2.5 text-sm font-medium">View demo</Link>
            </div>
          </div>
          <div className="rounded-xl border border-line bg-card p-4 shadow-sm" aria-hidden>
            <div className="flex items-center justify-between text-xs text-muted">
              <span>Acme Technologies</span>
              <span>Needs attention</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <PreviewStat label="High-risk vendors" value="3" />
              <PreviewStat label="Open findings" value="3" />
              <PreviewStat label="Awaiting review" value="1" />
              <PreviewStat label="Overdue" value="1" />
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <PreviewRow title="Northstar Cloud" detail="Critical · In review" />
              <PreviewRow title="PayFlow Systems" detail="Critical finding · Remediation" />
              <PreviewRow title="BrightMail" detail="Questionnaire sent · Due soon" />
            </div>
          </div>
        </section>

        <section className="border-y border-line bg-card">
          <div className="mx-auto grid max-w-6xl gap-8 px-5 py-14 md:grid-cols-2">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">The spreadsheet version breaks the moment an auditor asks.</h2>
              <p className="mt-3 text-sm leading-6 text-ink-soft">Security teams already know how to review a vendor. The pain is the trail: email threads, a shared drive named “Final_v7”, a status column nobody trusts, and a decision that lives in someone’s head.</p>
            </div>
            <ul className="space-y-3 text-sm">
              {["Which questionnaire did we actually send?", "Where is the SOC report, and who read it?", "Did we accept that gap, and when does that acceptance expire?", "What will we show an auditor next quarter?"].map((item) => (
                <li key={item} className="rounded-md border border-line px-3 py-2">{item}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-14">
          <h2 className="text-2xl font-semibold tracking-tight">One workflow. Then stop.</h2>
          <ol className="mt-6 grid gap-3 md:grid-cols-3">
            {steps.map(([title, body], index) => (
              <li key={title} className="rounded-lg border border-line bg-card p-4">
                <p className="text-xs font-medium text-muted">0{index + 1}</p>
                <h3 className="mt-1 font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-ink-soft">{body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-y border-line bg-card">
          <div className="mx-auto max-w-6xl px-5 py-14">
            <h2 className="text-2xl font-semibold tracking-tight">What you can do on day one</h2>
            <ul className="mt-6 grid gap-4 md:grid-cols-2">
              {features.map(([title, body]) => (
                <li key={title} className="border-t border-line pt-3">
                  <h3 className="font-medium">{title}</h3>
                  <p className="mt-1 text-sm text-ink-soft">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-14">
          <h2 className="text-2xl font-semibold tracking-tight">Who it is for</h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-soft">Security analysts, GRC analysts, IT and security managers, compliance managers, internal auditors, and CTOs at smaller companies. If vendor reviews currently live in Excel, email, and a shared folder, this is the replacement for that pile.</p>
          <p className="mt-4 text-sm text-muted">It is not a continuous monitoring product, a procurement suite, or a framework library.</p>
        </section>

        <section className="border-y border-line bg-card">
          <div className="mx-auto max-w-6xl px-5 py-14">
            <h2 className="text-2xl font-semibold tracking-tight">Pricing direction</h2>
            <p className="mt-2 text-sm text-muted">Billing is not connected yet. Limits below are the plan model the product already enforces outside demo mode.</p>
            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {plans.map((plan) => (
                <article key={plan.plan} className="rounded-lg border border-line p-4">
                  <h3 className="font-semibold">{plan.label}</h3>
                  <p className="mt-1 text-2xl font-semibold tracking-tight">{plan.priceLabel}</p>
                  <ul className="mt-3 space-y-1 text-sm text-ink-soft">
                    <li>{plan.vendors} vendors</li>
                    <li>{plan.users} users</li>
                    <li>{plan.activeAssessments} active assessments</li>
                    <li>{plan.customQuestionnaires ? "Custom questionnaires" : "Built-in questionnaire"}</li>
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-14">
          <h2 className="text-2xl font-semibold tracking-tight">Security of the product</h2>
          <div className="mt-4 grid gap-4 text-sm text-ink-soft md:grid-cols-2">
            <p>Organizations are isolated. In production, Postgres row-level security checks membership on every row. The app also checks the role on the server-side data functions. A client-supplied organization id is never treated as proof of access.</p>
            <p>Evidence uses a private bucket and signed URLs. Invitation tokens are random, stored only as hashes, and scoped to one assessment. Uploads are type- and size-checked and never executed. AuditReady does not claim to be SOC 2 certified.</p>
          </div>
        </section>

        <section className="border-t border-line bg-card">
          <div className="mx-auto max-w-6xl px-5 py-14">
            <h2 className="text-2xl font-semibold tracking-tight">Questions</h2>
            <dl className="mt-6 space-y-4">
              {faqs.map(([question, answer]) => (
                <div key={question}>
                  <dt className="font-medium">{question}</dt>
                  <dd className="mt-1 text-sm text-ink-soft">{answer}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-lg bg-ink px-5 py-6 text-paper">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">Replace the vendor spreadsheet.</h2>
                <p className="mt-1 text-sm text-paper/80">Start a workspace, or open the Acme demo and finish the Northstar review.</p>
              </div>
              <div className="flex gap-2">
                <Link href="/signup" className="rounded-md bg-white px-4 py-2 text-sm font-medium text-ink">Start free</Link>
                <Link href="/dashboard" className="rounded-md border border-white/30 px-4 py-2 text-sm font-medium">View demo</Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function PreviewStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-paper px-3 py-2">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}

function PreviewRow({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-line px-3 py-2">
      <span>{title}</span>
      <span className="text-xs text-muted">{detail}</span>
    </div>
  );
}
