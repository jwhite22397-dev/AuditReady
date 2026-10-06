"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Something went wrong.</h1>
      <p className="mt-2 text-sm text-muted">The workspace could not finish loading this view. Nothing on the page is a stack trace.</p>
      <button className="mt-6 h-9 w-fit rounded-md bg-teal px-3 text-sm text-white" onClick={reset}>Try again</button>
    </main>
  );
}
