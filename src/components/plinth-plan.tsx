"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { api, useApi } from "@/lib/api";
import { fmtDate, fmtWeekday, toInputDate, todayInput } from "@/lib/format";
import type { PlinthDay, PlinthPlan } from "@/lib/types";
import { Icon } from "./geotech";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// ---------------------------------------------------------------------------
// Day helpers
// ---------------------------------------------------------------------------

export function timing(d: PlinthDay) {
  const t = todayInput();
  const day = toInputDate(d.date);
  return { isToday: day === t, isPast: day < t, isFuture: day > t };
}

export const doneCount = (d: PlinthDay) => d.items.filter((i) => i.done).length;
export const dayPercent = (d: PlinthDay) => (d.items.length ? Math.round((doneCount(d) / d.items.length) * 100) : 0);

export function dayStatus(items: PlinthDay["items"]): PlinthDay["status"] {
  const done = items.filter((i) => i.done).length;
  if (!items.length || done === 0) return "Pending";
  return done === items.length ? "Done" : "In Progress";
}

export const isBehind = (d: PlinthDay) => d.status !== "Done" && timing(d).isPast;

// The day to show first: today, else the oldest unfinished day that is already due, else the next one.
export function currentDay(plan: PlinthPlan): PlinthDay {
  const today = plan.days.find((d) => timing(d).isToday);
  if (today) return today;
  return plan.days.find(isBehind) ?? plan.days.find((d) => d.status !== "Done") ?? plan.days[plan.days.length - 1];
}

function summarise(plan: PlinthPlan): PlinthPlan["summary"] {
  const items = plan.days.reduce((n, d) => n + d.items.length, 0);
  const itemsDone = plan.days.reduce((n, d) => n + doneCount(d), 0);
  return {
    totalDays: plan.days.length,
    doneDays: plan.days.filter((d) => d.status === "Done").length,
    behindDays: plan.days.filter(isBehind).length,
    items,
    itemsDone,
    percent: items ? Math.round((itemsDone / items) * 100) : 0,
    todayDay: plan.days.find((d) => timing(d).isToday)?.day ?? null,
  };
}

/** Plans for the signed-in user, with a way to swap one updated day in without refetching. */
export function usePlinthPlans() {
  const { data, error, loading, reload, setData } = useApi<{ plans: PlinthPlan[] }>("/plinth-plan");
  const update = useCallback(
    (day: PlinthDay) =>
      setData((d) => {
        if (!d) return d;
        return {
          plans: d.plans.map((p) => {
            if (p.report._id !== day.report) return p;
            const next = { ...p, days: p.days.map((x) => (x._id === day._id ? day : x)) };
            return { ...next, summary: summarise(next) };
          }),
        };
      }),
    [setData],
  );
  return { plans: data?.plans ?? null, error, loading, reload, update };
}

/** Tick or untick an item; the screen updates at once and is put back if the server refuses. */
export async function toggleItem(day: PlinthDay, itemId: string, onChange: (d: PlinthDay) => void): Promise<string | null> {
  const item = day.items.find((i) => i._id === itemId);
  if (!item) return null;
  const items = day.items.map((i) => (i._id === itemId ? { ...i, done: !i.done } : i));
  onChange({ ...day, items, status: dayStatus(items) });
  try {
    onChange(await api<PlinthDay>(`/plinth-plan/days/${day._id}/items/${itemId}`, { method: "PATCH", json: { done: !item.done } }));
    return null;
  } catch (e) {
    onChange(day);
    return (e as Error).message;
  }
}

export const PHASE_TONE: Record<string, string> = { excavation: "amber", pcc: "slate", foundation: "blue", plinthBeam: "purple", backfill: "green" };

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

export function Check({ checked, onClick, disabled, label }: { checked: boolean; onClick?: () => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 transition",
        checked ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white text-transparent hover:border-slate-500",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
    </button>
  );
}

export function Ring({ percent, size = 88, label }: { percent: number; size?: number; label?: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90" role="img" aria-label={`${percent}% of the checklist done`}>
        <circle cx="40" cy="40" r={r} fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="8" />
        <circle cx="40" cy="40" r={r} fill="none" stroke="#fbbf24" strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - percent / 100)} style={{ transition: "stroke-dashoffset .4s" }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center leading-none">
        <div><div className="text-xl font-semibold tabular-nums">{percent}%</div>{label && <div className="mt-0.5 text-[10px] uppercase tracking-wide opacity-60">{label}</div>}</div>
      </div>
    </div>
  );
}

export function MiniBar({ percent, tone = "bg-emerald-500" }: { percent: number; tone?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100" title={`${percent}% done`}>
      <div className={cx("h-full rounded-full transition-all", tone)} style={{ width: `${percent}%` }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card for the site engineer's "My Day" screen
// ---------------------------------------------------------------------------

export function PlinthTodayCard() {
  const { plans, update } = usePlinthPlans();
  const [err, setErr] = useState<string | null>(null);
  if (!plans?.length) return null;

  return (
    <div className="space-y-3">
      {plans.map((plan) => {
        const day = currentDay(plan);
        const t = timing(day);
        const open = day.items.filter((i) => !i.done);
        const finished = plan.summary.doneDays === plan.summary.totalDays;
        const percent = dayPercent(day);
        return (
          <section key={plan.report._id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-900 px-4 py-3 text-white">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/10 text-amber-300"><Icon name="clipboard" /></span>
                <div>
                  <div className="text-sm font-semibold">Plinth plan{plan.report.project ? ` · ${plan.report.project.name}` : ""}</div>
                  <div className="text-[11px] text-slate-300">{finished ? "All days finished" : `Day ${day.day} of ${plan.summary.totalDays} · ${fmtWeekday(day.date)}`}</div>
                </div>
              </div>
              <Link href="/plinth-plan" className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/20">Open full plan</Link>
            </header>
            {finished ? (
              <p className="px-4 py-3 text-sm text-emerald-700">The whole plinth plan is complete. Well done.</p>
            ) : (
              <div className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-900">{day.title}</span>
                  {t.isFuture && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-600">starts {fmtDate(day.date)}</span>}
                  {isBehind(day) && <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-700 ring-1 ring-inset ring-red-200">behind</span>}
                </div>
                <div className="mt-2 flex items-center gap-3"><MiniBar percent={percent} /><span className="text-xs tabular-nums text-slate-500">{doneCount(day)}/{day.items.length}</span></div>
                <ul className="mt-3 space-y-1.5">
                  {open.slice(0, 4).map((i) => (
                    <li key={i._id} className="flex items-start gap-2.5 text-sm">
                      <Check checked={false} label={`Mark done: ${i.text}`} onClick={async () => setErr(await toggleItem(day, i._id, update))} />
                      <span className="pt-0.5 text-slate-700">{i.text}</span>
                    </li>
                  ))}
                </ul>
                {open.length > 4 && <p className="mt-2 text-xs text-slate-500">+ {open.length - 4} more on the full plan</p>}
                {open.length === 0 && <p className="mt-2 text-sm text-emerald-700">Today&apos;s checklist is done.</p>}
                {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
