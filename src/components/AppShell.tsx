"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { homeFor, useAuth } from "@/lib/auth";
import { canAccess, navFor } from "@/lib/navigation";
import { ROLE_LABELS, isManager } from "@/lib/types";
import { Loading } from "./ui";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, ready, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const allowed = !!user && canAccess(user.role, pathname);

  useEffect(() => {
    if (ready && !user) router.replace("/login");
    else if (user && !allowed) router.replace(homeFor(user));
  }, [ready, user, allowed, router]);

  if (!ready || !user || !allowed) return <Loading />;

  const sections = navFor(user.role);
  const items = sections.flatMap((s) => s.items);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="text-xs font-semibold uppercase tracking-widest text-amber-600">Krisala</div>
          <div className="text-sm font-semibold leading-tight">Construction Intelligence</div>
          <div className="mt-1 text-[11px] text-slate-400">MVP</div>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto p-3">
          {sections.map((section) => (
            <div key={section.title}>
              <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{section.title}</div>
              <div className="space-y-0.5">
                {section.items.map((n) => {
                  const active = isActive(n.href);
                  return (
                    <Link key={n.href} href={n.href} title={n.hint} className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}>
                      <span>
                        {n.label}
                        <span className={`block text-[11px] ${active ? "text-slate-300" : "text-slate-400"}`}>{n.hint}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-slate-100 p-4 text-sm">
          <div className="font-medium">{user.name}</div>
          <div className="text-xs text-slate-500">{ROLE_LABELS[user.role]}</div>
          <button onClick={logout} className="mt-2 text-xs text-slate-500 underline hover:text-slate-800">Sign out</button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2 md:hidden">
          <span className="text-sm font-semibold">Krisala CI</span>
          <select className="rounded border px-2 py-1 text-sm" value={items.find((i) => isActive(i.href))?.href ?? ""} onChange={(e) => router.push(e.target.value)}>
            {!items.some((i) => isActive(i.href)) && <option value="">Menu</option>}
            {sections.map((s) => (
              <optgroup key={s.title} label={s.title}>
                {s.items.map((n) => <option key={n.href} value={n.href}>{n.label}</option>)}
              </optgroup>
            ))}
          </select>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function useIsManager() {
  const { user } = useAuth();
  return isManager(user?.role);
}
