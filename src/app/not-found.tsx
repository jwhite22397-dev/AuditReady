import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6">
      <p className="text-sm font-medium text-teal">404</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">That page is not in this workspace.</h1>
      <p className="mt-2 text-sm text-muted">The record may belong to another organization, or the link is out of date.</p>
      <Link href="/dashboard" className="mt-6 text-sm font-medium text-teal-dark">Back to the dashboard</Link>
    </main>
  );
}
