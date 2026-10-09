"use client";

import { useMemo, useState } from "react";
import { useApi } from "@/lib/api";
import { fmtDateTime, fmtWeekday, todayInput } from "@/lib/format";
import type { DayTask, DayTasks, Project, ScheduleMaterial } from "@/lib/types";
import { ErrorBox, Loading, Select } from "@/components/ui";
import { Icon } from "@/components/geotech";
import { cx, fmtD, inr, linkText, qty } from "@/components/schedule";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const shift = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 864e5);

// ---------------------------------------------------------------------------
// Plain names: the schedule is written in capitals with long wing names.
// ---------------------------------------------------------------------------

const KEEP = new Set(["RCC", "PCC", "UGWT", "STP", "NOC", "NOC'S", "CP", "VDP", "MEP", "LW", "R/F", "ST.", "DG", "A", "B"]);
function nice(s: string) {
  let first = true; // capitalise the first word with letters ("04 Slab (podium 3 floor slab)")
  return s
    .replace(/\s+/g, " ")
    .replace(/-\s+/g, "-")
    .trim()
    .split(" ")
    .map((w) => {
      if (KEEP.has(w.toUpperCase())) { first = false; return w.toUpperCase(); }
      if (!/[a-z]/i.test(w) || /^\d/.test(w)) return w.toLowerCase();
      const out = first ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase();
      first = false;
      return out;
    })
    .join(" ")
    .replace(/\( /g, "(")
    .replace(/ \)/g, ")");
}
function area(path: string[]) {
  const a = path[1] ?? path[0] ?? "";
  if (/^([A-Z])\s*-?\s*WING/i.test(a)) return `${a.match(/^([A-Z])/i)![1].toUpperCase()}-Wing`;
  if (/external/i.test(a)) return "External works";
  return nice(a.replace(/\(.*\)/, ""));
}
const where = (path: string[]) => path.slice(2).map(nice).join(" › ");
function material(name: string) {
  if (/aluform\s*shutter/i.test(name)) return "Aluform shuttering";
  if (/shutter/i.test(name)) return "Shuttering";
  if (/concrete/i.test(name)) return "Concrete";
  if (/aluform/i.test(name)) return "Aluform material";
  return name;
}

// What the engineer needs to know about a task on the chosen day, in one word.
type Tone = "late" | "due" | "start" | "behind" | "ok" | "done";
const TONE: Record<Tone, { label: string; cls: string; dot: string }> = {
  late: { label: "Late", cls: "bg-red-100 text-red-800", dot: "bg-red-500" },
  due: { label: "Due today", cls: "bg-amber-100 text-amber-900", dot: "bg-amber-500" },
  start: { label: "Starts today", cls: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500" },
  behind: { label: "Behind", cls: "bg-orange-100 text-orange-800", dot: "bg-orange-500" },
  ok: { label: "On track", cls: "bg-sky-100 text-sky-800", dot: "bg-sky-500" },
  done: { label: "Done", cls: "bg-slate-100 text-slate-600", dot: "bg-slate-400" },
};
function toneOf(t: DayTask, late: boolean): Tone {
  if (t.status === "Completed") return "done";
  if (late) return "late";
  if (t.isFinish) return "due";
  if (t.isStart) return "start";
  if (t.expectedPercent != null && t.expectedPercent - t.percent > 10) return "behind";
  return "ok";
}

// ---------------------------------------------------------------------------

export default function MspTasksPage() {
  const { data: projects } = useApi<Project[]>("/projects");
  const [projectId, setProjectId] = useState("");
  const project = projectId || projects?.[0]?._id || "";
  const today = todayInput();
  const [from, setFrom] = useState(today);
  const [selected, setSelected] = useState(today);
  const { data, error, loading } = useApi<DayTasks>(project ? `/schedule/day-tasks?project=${project}&from=${from}&days=7` : null);
  const day = data?.days.find((d) => d.date.slice(0, 10) === selected) ?? data?.days[0];
  const goTo = (d: string) => { setFrom(d); setSelected(d); };

  if (!projects) return <Loading />;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">MSP Tasks</h1>
          <p className="text-sm text-slate-500">
            {data?.import
              ? <>Your work from <b>{data.import.file.originalName}</b> · updated {fmtDateTime(data.import.createdAt)} by {data.import.uploadedBy?.name ?? "—"}</>
              : "Your work from the project schedule, day by day."}
          </p>
        </div>
        {projects.length > 1 && (
          <Select value={project} onChange={(e) => setProjectId(e.target.value)} className="max-w-60">
            {projects.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
          </Select>
        )}
      </header>
      <ErrorBox message={error} />

      {loading && !data ? <Loading /> : !data?.import ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          No schedule uploaded yet. The site manager uploads the MSP (.mpp) file under <b>MSP Schedule</b>; your tasks show here after that.
        </div>
      ) : (
        <>
          <WeekStrip data={data} selected={day?.date.slice(0, 10)} today={today} onSelect={setSelected}
            onPrev={() => goTo(shift(from, -7))} onNext={() => goTo(shift(from, 7))} onToday={() => goTo(today)} onPick={goTo} />
          {day && <DayView day={day} overdue={data.overdue} isToday={day.date.slice(0, 10) === today} />}
        </>
      )}
    </div>
  );
}

function WeekStrip({ data, selected, today, onSelect, onPrev, onNext, onToday, onPick }: {
  data: DayTasks; selected?: string; today: string; onSelect: (d: string) => void; onPrev: () => void; onNext: () => void; onToday: () => void; onPick: (d: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button onClick={onPrev} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50" aria-label="Previous week"><Icon name="left" /></button>
        <button onClick={onToday} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Today</button>
        <button onClick={onNext} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50" aria-label="Next week"><Icon name="right" /></button>
        <input type="date" value={selected ?? today} onChange={(e) => e.target.value && onPick(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {data.days.map((d) => {
          const key = d.date.slice(0, 10);
          const active = key === selected;
          return (
            <button key={key} onClick={() => onSelect(key)} className={cx("rounded-xl px-2 py-2 text-center transition ring-1 ring-inset",
              active ? "bg-slate-900 text-white ring-slate-900" : d.workDay ? "bg-white ring-slate-200 hover:bg-slate-50" : "bg-slate-50 text-slate-400 ring-slate-200")}>
              <div className={cx("text-[11px]", active ? "text-slate-300" : "text-slate-500")}>{fmtWeekday(d.date)}</div>
              <div className="text-lg font-semibold tabular-nums">{d.workDay ? d.tasks.length : "Off"}</div>
              <div className={cx("truncate text-[10px]", active ? "text-slate-300" : "text-slate-500")}>
                {key === today ? "today" : d.holiday ? nice(d.holiday.replace(/[-\s]*\d{4}$/, "")) : !d.workDay ? "Sunday" : "tasks"}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function DayView({ day, overdue, isToday }: { day: DayTasks["days"][number]; overdue: DayTask[]; isToday: boolean }) {
  const date = day.date.slice(0, 10);
  // Late work is shown on today only (it is about now, not about a future date).
  const late = isToday ? overdue : [];
  const rows = useMemo(() => day.tasks.map((t) => ({ t, tone: toneOf(t, false) })), [day]);
  const groups = useMemo(() => {
    const m = new Map<string, typeof rows>();
    for (const r of rows) m.set(area(r.t.path), [...(m.get(area(r.t.path)) || []), r]);
    return [...m.entries()];
  }, [rows]);
  const count = (tone: Tone) => rows.filter((r) => r.tone === tone).length;

  // Materials the day needs, summed over the tasks.
  const mats = new Map<string, { name: string; unit: string | null; amount: number }>();
  if (day.workDay) {
    for (const { t } of rows) for (const m of t.materials) {
      if (!m.perDay || m.unit === "Rs.") continue;
      const k = `${material(m.name)}|${m.unit}`;
      const x = mats.get(k) || { name: material(m.name), unit: m.unit, amount: 0 };
      x.amount += m.perDay;
      mats.set(k, x);
    }
  }

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-lg font-semibold text-slate-900">{isToday ? "Today, " : ""}{fmtWeekday(day.date)}</h2>
          {!day.workDay && <span className="text-sm text-slate-500">{day.holiday ? `Holiday: ${nice(day.holiday)}` : "Sunday"} — no work planned</span>}
        </div>
        {day.workDay && (
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <Chip n={rows.length} label="tasks on site" cls="bg-slate-100 text-slate-800" />
            {late.length > 0 && <Chip n={late.length} label="late" cls={TONE.late.cls} />}
            {count("due") > 0 && <Chip n={count("due")} label="due today" cls={TONE.due.cls} />}
            {count("start") > 0 && <Chip n={count("start")} label="start today" cls={TONE.start.cls} />}
            {count("behind") > 0 && <Chip n={count("behind")} label="behind" cls={TONE.behind.cls} />}
          </div>
        )}
        {mats.size > 0 && (
          <div className="mt-3 border-t border-slate-100 pt-3">
            <div className="mb-1.5 text-xs font-medium text-slate-500">Materials needed {isToday ? "today" : "this day"}</div>
            <div className="flex flex-wrap gap-2">
              {[...mats.values()].map((m) => (
                <span key={`${m.name}|${m.unit}`} className="rounded-lg bg-amber-50 px-3 py-1.5 text-sm ring-1 ring-inset ring-amber-200">
                  <span className="text-slate-600">{m.name}</span> <b className="tabular-nums text-slate-900">{qty(Math.round(m.amount * 10) / 10, m.unit)}</b>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {late.length > 0 && (
        <Group title="Late — finish these first" tone="text-red-700">
          {late.map((t) => <TaskRow key={`late-${t.uid}`} t={t} tone="late" on={date} />)}
        </Group>
      )}

      {day.workDay && !rows.length && (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No scheduled tasks on this day.</p>
      )}
      {day.workDay && groups.map(([name, list]) => (
        <Group key={name} title={`${name} · ${list.length} task${list.length === 1 ? "" : "s"}`}>
          {list.map(({ t, tone }) => <TaskRow key={t.uid} t={t} tone={tone} on={date} />)}
        </Group>
      ))}
    </section>
  );
}

const Chip = ({ n, label, cls }: { n: number; label: string; cls: string }) => (
  <span className={cx("rounded-full px-3 py-1", cls)}><b className="tabular-nums">{n}</b> {label}</span>
);

function Group({ title, tone, children }: { title: string; tone?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className={cx("mb-2 px-1 text-xs font-semibold uppercase tracking-wider", tone || "text-slate-500")}>{title}</div>
      <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">{children}</div>
    </div>
  );
}

function TaskRow({ t, tone, on }: { t: DayTask; tone: Tone; on: string }) {
  const [open, setOpen] = useState(false);
  const s = TONE[tone];
  const left = daysBetween(on, t.finish);
  const due = tone === "late"
    ? `${t.daysLate ?? -left} day${(t.daysLate ?? -left) === 1 ? "" : "s"} late · was due ${fmtD(t.finish)}`
    : left <= 0 ? "Due today" : `Due in ${left} day${left === 1 ? "" : "s"} · ${fmtD(t.finish)}`;
  const today = t.materials.filter((m) => m.perDay && m.unit !== "Rs.");
  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <span className={cx("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", s.dot)} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-900">{nice(t.name)}</span>
            <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-semibold", s.cls)}>{s.label}</span>
            {t.critical && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 ring-1 ring-inset ring-red-200" title="Any delay here delays the project">Critical</span>}
          </div>
          <div className="text-xs text-slate-500">{area(t.path)}{where(t.path) ? ` · ${where(t.path)}` : ""}</div>
        </div>
        <div className={cx("text-right text-sm", tone === "late" ? "font-medium text-red-700" : tone === "due" ? "font-medium text-amber-800" : "text-slate-600")}>{due}</div>
      </div>

      <div className="ml-5 mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <div className="flex w-56 items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div className={cx("h-full rounded-full", s.dot)} style={{ width: `${Math.min(100, t.percent)}%` }} />
          </div>
          <span className="w-16 text-xs tabular-nums text-slate-700">{t.percent}% done</span>
        </div>
        {tone === "behind" && <span className="text-xs text-orange-700">should be about {t.expectedPercent}% by now</span>}
        {today.length > 0 && tone !== "late" && (
          <span className="text-xs text-slate-600">
            Today: {today.map((m) => <span key={m.name} className="mr-2 whitespace-nowrap"><b className="tabular-nums text-slate-900">{qty(m.perDay!, m.unit)}</b> {material(m.name).toLowerCase()}</span>)}
          </span>
        )}
        <button onClick={() => setOpen((o) => !o)} className="ml-auto text-xs font-medium text-slate-500 hover:text-slate-900">{open ? "Hide details" : "Details"}</button>
      </div>

      {open && <Details t={t} />}
    </div>
  );
}

function Details({ t }: { t: DayTask }) {
  const shifted = t.finishVarianceDays;
  return (
    <div className="ml-5 mt-3 grid gap-3 rounded-xl bg-slate-50 p-3 text-xs md:grid-cols-2">
      <dl className="grid grid-cols-[8rem_1fr] gap-y-1">
        <dt className="text-slate-500">Planned</dt><dd className="text-slate-800">{fmtD(t.start)} → {fmtD(t.finish)}</dd>
        <dt className="text-slate-500">Original plan</dt>
        <dd className="text-slate-800">finish {fmtD(t.baselineFinish)}{shifted ? <span className={shifted > 0 ? " text-red-700" : " text-emerald-700"}> ({shifted > 0 ? `${shifted} days later now` : `${-shifted} days earlier now`})</span> : ""}</dd>
        {t.actualStart && <><dt className="text-slate-500">Started</dt><dd className="text-slate-800">{fmtD(t.actualStart)}</dd></>}
        {t.remainingDurationDays != null && <><dt className="text-slate-500">Work left</dt><dd className="text-slate-800">about {t.remainingDurationDays} working days</dd></>}
        {t.cost != null && <><dt className="text-slate-500">Cost</dt><dd className="text-slate-800">{inr(t.cost)}{t.actualCost ? ` · ${inr(t.actualCost)} spent` : ""}</dd></>}
        {t.note && <><dt className="text-slate-500">Remark</dt><dd className="text-slate-800">{t.note}</dd></>}
        {t.wbs && <><dt className="text-slate-500">WBS</dt><dd className="text-slate-800">{t.wbs}</dd></>}
      </dl>
      <div className="space-y-2">
        {t.materials.length > 0 && <MaterialsLeft materials={t.materials} />}
        {t.predecessors.length > 0 && (
          <div>
            <div className="mb-1 font-medium text-slate-600">Waits for</div>
            <ul className="space-y-0.5">
              {t.predecessors.map((p, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className={cx("h-1.5 w-1.5 shrink-0 rounded-full", p.status === "Completed" ? "bg-emerald-500" : p.status === "Overdue" ? "bg-red-500" : "bg-amber-400")} />
                  <span className="min-w-0 flex-1 truncate text-slate-700">{p.name ? nice(p.name) : `Task ${p.uid}`}</span>
                  <span className="text-slate-500">{p.status === "Completed" ? "done" : p.status?.toLowerCase()}</span>
                  <span className="text-slate-400" title={linkText(p)}>{p.type}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function MaterialsLeft({ materials }: { materials: ScheduleMaterial[] }) {
  return (
    <div>
      <div className="mb-1 font-medium text-slate-600">Materials for the whole task</div>
      <ul className="space-y-0.5">
        {materials.map((m) => (
          <li key={m.name} className="flex justify-between gap-2">
            <span className="text-slate-700">{material(m.name)}</span>
            <span className="tabular-nums text-slate-600">{qty(m.actualQuantity, m.unit)} used of {qty(m.quantity, m.unit)} · <b className="text-slate-800">{qty(m.remainingQuantity, m.unit)} left</b></span>
          </li>
        ))}
      </ul>
    </div>
  );
}
