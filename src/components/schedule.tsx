"use client";

import type { ScheduleMaterial, ScheduleTaskStatus } from "@/lib/types";
import { fmtDate } from "@/lib/format";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export const STATUS_STYLE: Record<ScheduleTaskStatus, { badge: string; bar: string; dot: string }> = {
  Completed: { badge: "bg-emerald-50 text-emerald-700 ring-emerald-200", bar: "bg-emerald-500", dot: "bg-emerald-500" },
  "In Progress": { badge: "bg-sky-50 text-sky-700 ring-sky-200", bar: "bg-sky-500", dot: "bg-sky-500" },
  Overdue: { badge: "bg-red-50 text-red-700 ring-red-200", bar: "bg-red-500", dot: "bg-red-500" },
  "Not Started": { badge: "bg-slate-100 text-slate-600 ring-slate-200", bar: "bg-slate-300", dot: "bg-slate-300" },
};

export function TaskStatus({ value }: { value: ScheduleTaskStatus }) {
  return <span className={cx("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", STATUS_STYLE[value].badge)}>{value}</span>;
}

/** Actual % as a bar, with an optional tick where the task should be by now. */
export function PercentBar({ percent, expected, className }: { percent: number; expected?: number | null; className?: string }) {
  const behind = expected != null && percent + 5 < expected;
  return (
    <div className={cx("relative h-1.5 w-full overflow-hidden rounded-full bg-slate-100", className)} title={`${percent}% done${expected != null ? `, ${expected}% expected` : ""}`}>
      <div className={cx("h-full rounded-full", percent >= 100 ? "bg-emerald-500" : behind ? "bg-amber-500" : "bg-sky-500")} style={{ width: `${Math.min(100, percent)}%` }} />
      {expected != null && <span className="absolute inset-y-0 w-0.5 bg-slate-900/70" style={{ left: `calc(${Math.min(100, expected)}% - 1px)` }} />}
    </div>
  );
}

export const fmtD = (d?: string | null) => (d ? fmtDate(d, true) : "—");
export const fmtDays = (n?: number | null) => (n == null ? "—" : `${n} ${n === 1 ? "day" : "days"}`);

export function Variance({ days }: { days: number | null | undefined }) {
  if (days == null) return <span className="text-slate-400">—</span>;
  if (days === 0) return <span className="text-slate-500">on time</span>;
  return <span className={cx("font-medium tabular-nums", days > 0 ? "text-red-600" : "text-emerald-600")}>{days > 0 ? `+${days}d late` : `${-days}d early`}</span>;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 text-sm text-slate-800">{children}</div>
    </div>
  );
}

export const LINK_TYPES: Record<string, string> = { FS: "finish → start", SS: "start → start", FF: "finish → finish", SF: "start → finish" };
export const linkText = (p: { type: string; lagDays: number }) => `${LINK_TYPES[p.type] || p.type}${p.lagDays ? ` ${p.lagDays > 0 ? "+" : ""}${p.lagDays}d` : ""}`;

/** Indian money: ₹ 1.63 Cr, ₹ 4.5 L, ₹ 85,078. */
export function inr(n?: number | null) {
  if (n == null) return "—";
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

/** "3,550 Sqm"; a material counted in rupees is shown as money. */
export function qty(n: number, unit?: string | null) {
  if (unit && /^rs\.?$/i.test(unit)) return inr(n);
  return `${n.toLocaleString("en-IN", { maximumFractionDigits: n < 10 ? 1 : 0 })}${unit ? ` ${unit}` : ""}`;
}

export function MaterialTable({ materials, perDay }: { materials: ScheduleMaterial[]; perDay?: boolean }) {
  return (
    <table className="w-full text-left text-xs">
      <thead>
        <tr className="text-[10px] uppercase tracking-wide text-slate-400">
          <th className="py-1 pr-2 font-medium">Material</th>
          {perDay && <th className="py-1 pr-2 text-right font-medium">Per day</th>}
          <th className="py-1 pr-2 text-right font-medium">Planned</th>
          <th className="py-1 pr-2 text-right font-medium">Used</th>
          <th className="py-1 pr-2 text-right font-medium">Left</th>
          <th className="w-24 py-1 font-medium">Used %</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {materials.map((m) => {
          const pct = m.quantity ? Math.round((m.actualQuantity / m.quantity) * 100) : 0;
          return (
            <tr key={`${m.name}|${m.unit}`}>
              <td className="py-1.5 pr-2 text-slate-800">{m.name}</td>
              {perDay && <td className="py-1.5 pr-2 text-right font-semibold tabular-nums text-slate-900">{m.perDay != null ? qty(m.perDay, m.unit) : "—"}</td>}
              <td className="py-1.5 pr-2 text-right tabular-nums">{qty(m.quantity, m.unit)}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums text-slate-600">{qty(m.actualQuantity, m.unit)}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums text-slate-600">{qty(m.remainingQuantity, m.unit)}</td>
              <td className="py-1.5"><div className="flex items-center gap-1.5"><PercentBar percent={pct} /><span className="w-8 text-right tabular-nums text-slate-500">{pct}%</span></div></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
