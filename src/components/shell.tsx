"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Bell, Search } from "lucide-react";
import { ROLE_LABEL } from "@/lib/domain/labels";
import { roleHasPermission } from "@/lib/domain/permissions";
import { publicErrorMessage } from "@/lib/domain/errors";
import { useWorkspace } from "./providers";
import { DevPanel } from "./dev-panel";
import { Button, cn } from "./ui";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/work", label: "My work" },
  { href: "/vendors", label: "Vendors" },
  { href: "/assessments", label: "Assessments" },
  { href: "/findings", label: "Findings" },
  { href: "/questionnaires", label: "Questionnaires" },
  { href: "/audit", label: "Audit log" },
  { href: "/settings", label: "Settings" },
];

export function Shell({ children }: { children: ReactNode }) {
  const { repo, nonce } = useWorkspace();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const [error, setError] = useState("");
  void nonce;
  const session = repo?.getSession();
  const user = repo?.currentUser();
  const org = repo?.organization();
  const notifications = repo && session ? repo.listNotifications() : [];
  const unread = notifications.filter((item) => !item.readAt).length;
  const vendors = useMemo(() => (repo && session && nonce >= 0 ? repo.listVendors({ search: query }) : []), [repo, session, query, nonce]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const commands = [
    { label: "New vendor", href: "/vendors/new", show: roleHasPermission(session?.role, "vendors.write") },
    { label: "New assessment", href: "/assessments/new", show: roleHasPermission(session?.role, "assessments.write") },
    { label: "View my work", href: "/work", show: true },
    { label: "Dashboard", href: "/dashboard", show: true },
  ].filter((item) => item.show && item.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="min-h-screen">
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:bg-card focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-card lg:flex">
        <div className="border-b border-line px-4 py-4">
          <Link href="/dashboard" className="text-sm font-semibold tracking-[0.14em]">AUDITREADY</Link>
          <p className="mt-1 truncate text-sm text-ink-soft">{org?.name}</p>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-2" aria-label="Primary">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn("rounded-md px-3 py-2 text-sm", pathname === item.href || pathname.startsWith(`${item.href}/`) ? "bg-teal-soft font-medium text-teal-dark" : "text-ink-soft hover:bg-paper")}
              aria-current={pathname === item.href ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-line p-3 text-sm">
          <p className="font-medium">{user?.fullName}</p>
          <p className="text-muted">{session?.role ? ROLE_LABEL[session.role] : ""}</p>
          <button className="mt-2 text-teal-dark" onClick={() => repo?.signOut().then(() => router.push("/login"))}>Sign out</button>
        </div>
      </aside>
      <div className="lg:pl-60">
        <header className="no-print sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-paper/95 px-4 py-3 backdrop-blur">
          <nav className="flex gap-2 overflow-auto lg:hidden" aria-label="Mobile">
            {NAV.slice(0, 5).map((item) => (
              <Link key={item.href} href={item.href} className="shrink-0 text-sm text-ink-soft">{item.label}</Link>
            ))}
          </nav>
          <button className="ml-auto inline-flex h-9 items-center gap-2 rounded-md border border-line bg-card px-3 text-sm text-muted" onClick={() => setOpen(true)}>
            <Search className="size-4" aria-hidden />
            Search
            <span className="hidden text-xs sm:inline">Ctrl K</span>
          </button>
          <div className="relative">
            <button className="relative inline-flex size-9 items-center justify-center rounded-md border border-line bg-card" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} onClick={() => setNotesOpen((value) => !value)}>
              <Bell className="size-4" aria-hidden />
              {unread ? <span className="absolute right-1 top-1 size-2 rounded-full bg-critical" /> : null}
            </button>
            {notesOpen ? (
              <div className="absolute right-0 mt-2 w-80 rounded-lg border border-line bg-card p-2 shadow-lg">
                <div className="mb-2 flex items-center justify-between px-1">
                  <p className="text-sm font-medium">Notifications</p>
                  <button className="text-xs text-teal-dark" onClick={() => repo?.markAllNotificationsRead()}>Mark all read</button>
                </div>
                <ul className="max-h-80 space-y-1 overflow-auto">
                  {notifications.length === 0 ? <li className="px-2 py-3 text-sm text-muted">You are caught up.</li> : null}
                  {notifications.slice(0, 12).map((item) => (
                    <li key={item.id}>
                      <Link href={item.href} className={cn("block rounded-md px-2 py-2 text-sm hover:bg-paper", item.readAt ? "text-muted" : "text-ink")} onClick={() => repo?.markNotificationRead(item.id)}>
                        <span className="font-medium">{item.title}</span>
                        <span className="mt-0.5 block text-xs text-muted">{item.body}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </header>
        {error ? <p className="px-4 pt-3 text-sm text-critical">{error}</p> : null}
        <main id="content" className="print-area mx-auto max-w-6xl px-4 py-6">{children}</main>
      </div>
      {open ? (
        <div className="no-print fixed inset-0 z-40 bg-ink/40 p-4" onMouseDown={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Command palette" className="mx-auto mt-20 max-w-lg rounded-lg border border-line bg-card p-3 shadow-xl" onMouseDown={(event) => event.stopPropagation()}>
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search vendors or jump" className="h-10 w-full rounded-md border border-line px-3 text-sm" aria-label="Command search" />
            <ul className="mt-2 max-h-80 overflow-auto">
              {commands.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="block rounded-md px-2 py-2 text-sm hover:bg-paper" onClick={() => setOpen(false)}>{item.label}</Link>
                </li>
              ))}
              {vendors.slice(0, 8).map((vendor) => (
                <li key={vendor.id}>
                  <Link href={`/vendors/${vendor.id}`} className="block rounded-md px-2 py-2 text-sm hover:bg-paper" onClick={() => setOpen(false)}>
                    Vendor · {vendor.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
      {repo ? <DevPanel repo={repo} onError={(message) => setError(message || publicErrorMessage(message))} /> : null}
    </div>
  );
}

export function Guard({ children }: { children: ReactNode }) {
  const { ready, repo, nonce } = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  void nonce;
  const session = repo?.getSession();
  useEffect(() => {
    if (!ready) return;
    if (!session) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (!session.organizationId) router.replace("/onboarding");
  }, [ready, session, router, pathname]);
  if (!ready || !session?.organizationId) {
    return <div className="grid min-h-screen place-items-center text-sm text-muted">Loading workspace</div>;
  }
  return <Shell>{children}</Shell>;
}

export function SignOutButton() {
  const { repo } = useWorkspace();
  const router = useRouter();
  return <Button variant="ghost" onClick={() => repo?.signOut().then(() => router.push("/login"))}>Sign out</Button>;
}
