"use client";

import { useEffect } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function Card({ title, actions, children, className }: { title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-xl border border-slate-200 bg-white shadow-sm", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

const TONES: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  purple: "bg-violet-50 text-violet-700 ring-violet-200",
  blue: "bg-sky-50 text-sky-700 ring-sky-200",
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
};

export function Badge({ tone = "slate", children }: { tone?: keyof typeof TONES | string; children: React.ReactNode }) {
  return <span className={cx("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", TONES[tone] || TONES.slate)}>{children}</span>;
}

const HEALTH_TONE: Record<string, string> = { "On Track": "green", "At Risk": "amber", Delayed: "red", Blocked: "purple" };
const STATUS_TONE: Record<string, string> = { Planned: "slate", "In Progress": "blue", Completed: "green", Delayed: "red", Blocked: "purple" };
const SEVERITY_TONE: Record<string, string> = { Low: "blue", Medium: "amber", High: "red" };
const BLOCKER_STATUS_TONE: Record<string, string> = { Open: "red", Assigned: "amber", "In Progress": "blue", Resolved: "green", Closed: "slate" };

export const HealthBadge = ({ value }: { value: string }) => <Badge tone={HEALTH_TONE[value]}>{value}</Badge>;
export const StatusBadge = ({ value }: { value: string }) => <Badge tone={STATUS_TONE[value]}>{value}</Badge>;
export const SeverityBadge = ({ value }: { value?: string }) => (value ? <Badge tone={SEVERITY_TONE[value]}>{value}</Badge> : null);
export const BlockerStatusBadge = ({ value }: { value: string }) => <Badge tone={BLOCKER_STATUS_TONE[value]}>{value}</Badge>;
export const healthColor = (h: string) => ({ "On Track": "bg-emerald-500", "At Risk": "bg-amber-400", Delayed: "bg-red-500", Blocked: "bg-violet-500" })[h] || "bg-slate-300";

export function Button({ variant = "primary", className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  const styles = {
    primary: "bg-slate-900 text-white hover:bg-slate-700",
    secondary: "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
    danger: "bg-red-600 text-white hover:bg-red-500",
    ghost: "text-slate-600 hover:bg-slate-100",
  }[variant];
  return <button className={cx("inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-50", styles, className)} {...props} />;
}

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200";
export const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} className={cx(inputCls, props.className)} />;
export const Textarea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea rows={3} {...props} className={cx(inputCls, props.className)} />;
export const Select = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} className={cx(inputCls, props.className)} />;

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export function Progress({ planned, actual }: { planned: number; actual: number }) {
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-100" title={`Actual ${actual}% · Planned ${planned}%`}>
      <div className={cx("absolute inset-y-0 left-0 rounded-full", actual >= planned ? "bg-emerald-500" : "bg-amber-500")} style={{ width: `${actual}%` }} />
      <div className="absolute inset-y-0 w-0.5 bg-slate-800" style={{ left: `calc(${planned}% - 1px)` }} />
    </div>
  );
}

export function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={cx("mt-1 text-2xl font-semibold", tone)}>{value}</div>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">{children}</div>;
}

export function Loading() {
  return <div className="p-8 text-center text-sm text-slate-500">Loading…</div>;
}

export function ErrorBox({ message }: { message?: string | null }) {
  if (!message) return null;
  return <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{message}</div>;
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 pt-16" onMouseDown={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Close">✕</button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Table({ head, children }: { head: React.ReactNode[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            {head.map((h, i) => <th key={i} className="px-3 py-2 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

export const Td = ({ children, className }: { children?: React.ReactNode; className?: string }) => <td className={cx("px-3 py-2 align-top", className)}>{children}</td>;
