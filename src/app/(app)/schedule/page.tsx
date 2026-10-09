"use client";

import { useMemo, useState } from "react";
import { API_URL, api, useApi } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import type { Project, ScheduleImport, ScheduleTask, ScheduleTaskStatus } from "@/lib/types";
import { Button, ErrorBox, Loading, Modal, Select } from "@/components/ui";
import { Icon, Spinner } from "@/components/geotech";
import { Field, MaterialTable, PercentBar, STATUS_STYLE, TaskStatus, Variance, cx, fmtD, fmtDays, inr, linkText } from "@/components/schedule";

const STATUSES: ScheduleTaskStatus[] = ["Overdue", "In Progress", "Not Started", "Completed"];

export default function SchedulePage() {
  const { data: projects } = useApi<Project[]>("/projects");
  const [projectId, setProjectId] = useState("");
  const project = projectId || projects?.[0]?._id || "";
  const { data: imports, error, reload, setData } = useApi<ScheduleImport[]>(project ? `/schedule/imports?project=${project}` : null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId || imports?.[0]?._id || null;

  if (!projects) return <Loading />;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">MPP Schedule</h1>
          <p className="text-sm text-slate-500">Upload the Microsoft Project schedule (.mpp) or its Excel export (.xlsx) and see every task, date and delay.</p>
        </div>
        {projects.length > 1 && (
          <Select value={project} onChange={(e) => { setProjectId(e.target.value); setSelectedId(null); }} className="max-w-60">
            {projects.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
          </Select>
        )}
      </header>
      <ErrorBox message={error} />

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <UploadCard project={project} onUploaded={(doc) => { setData((list) => [doc, ...(list || [])]); setSelectedId(doc._id); }} />
        <Versions imports={imports} selected={selected} onSelect={setSelectedId} />
      </div>

      {selected && <ScheduleView key={selected} id={selected} onDeleted={() => { setSelectedId(null); reload(); }} />}
    </div>
  );
}

function UploadCard({ project, onUploaded }: { project: string; onUploaded: (d: ScheduleImport) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    if (!file) return setErr("Choose the .mpp or .xlsx file.");
    if (!/\.(mpp|xlsx)$/i.test(file.name)) return setErr("Only .mpp (Microsoft Project) or .xlsx files can be read.");
    setBusy(true);
    setErr(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("project", project);
      onUploaded(await api<ScheduleImport>("/schedule/imports", { method: "POST", body }));
      setFile(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Icon name="upload" /> Upload schedule</div>
      <label className={cx("mt-3 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition",
        file ? "border-emerald-300 bg-emerald-50/50" : "border-slate-300 hover:border-slate-400 hover:bg-slate-50")}>
        <Icon name="file" className="h-7 w-7 text-slate-500" />
        {file ? (
          <span className="text-sm font-medium text-slate-900">{file.name} <span className="font-normal text-slate-500">· {(file.size / 1024 / 1024).toFixed(1)} MB</span></span>
        ) : (
          <span className="text-sm text-slate-600"><b>Choose a file</b> — Microsoft Project <b>.mpp</b> or Excel export <b>.xlsx</b>, up to 40 MB</span>
        )}
        <input type="file" accept=".mpp,.xlsx" className="hidden" disabled={busy} onChange={(e) => { setFile(e.target.files?.[0] ?? null); setErr(null); e.target.value = ""; }} />
      </label>
      <div className="mt-3 flex items-center gap-3">
        <Button onClick={submit} disabled={busy || !file || !project}>{busy ? <><Spinner /> Reading schedule…</> : <><Icon name="upload" /> Upload and read</>}</Button>
        <span className="text-xs text-slate-500">The .mpp gives the full detail (every activity, links, resources); the Excel export has the summary rows.</span>
      </div>
      {err && <div className="mt-3"><ErrorBox message={err} /></div>}
    </section>
  );
}

function Versions({ imports, selected, onSelect }: { imports: ScheduleImport[] | null; selected: string | null; onSelect: (id: string) => void }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 text-sm font-semibold text-slate-900">Uploaded schedules</div>
      {!imports ? <Loading /> : !imports.length ? (
        <p className="text-sm text-slate-500">Nothing uploaded yet. Site engineers see their day-wise tasks from the latest upload.</p>
      ) : (
        <ul className="space-y-1">
          {imports.map((d, i) => (
            <li key={d._id}>
              <button onClick={() => onSelect(d._id)} className={cx("w-full rounded-xl px-3 py-2 text-left transition", d._id === selected ? "bg-slate-900 text-white" : "hover:bg-slate-50")}>
                <span className="block truncate text-sm font-medium">{d.file.originalName}</span>
                <span className={cx("text-[11px]", d._id === selected ? "text-slate-300" : "text-slate-500")}>
                  {d.format.toUpperCase()} · {d.summary.tasks} tasks · {fmtDateTime(d.createdAt)}{i === 0 ? " · used by site engineers" : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

function ScheduleView({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const { data: doc, error } = useApi<ScheduleImport>(`/schedule/imports/${id}`);
  const [open, setOpen] = useState<ScheduleTask | null>(null);
  if (error) return <ErrorBox message={error} />;
  if (!doc?.tasks) return <Loading />;
  return (
    <div className="space-y-5">
      <Overview doc={doc} onDeleted={onDeleted} />
      <BudgetAndMaterials doc={doc} />
      <NowOnSite tasks={doc.tasks} onOpen={setOpen} />
      <TaskTable doc={doc} onOpen={setOpen} />
      <TaskModal task={open} tasks={doc.tasks} onClose={() => setOpen(null)} />
    </div>
  );
}

function Overview({ doc, onDeleted }: { doc: ScheduleImport; onDeleted: () => void }) {
  const s = doc.summary;
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    if (!confirm(`Remove ${doc.file.originalName}? Site engineers will then see the previous upload.`)) return;
    setBusy(true);
    try {
      await api(`/schedule/imports/${doc._id}`, { method: "DELETE" });
      onDeleted();
    } finally {
      setBusy(false);
    }
  };
  const tiles: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: string }[] = [
    { label: "Overall complete", value: `${s.percent}%`, sub: <PercentBar percent={s.percent} className="mt-1.5" /> },
    { label: "Finish", value: fmtD(s.finish), sub: <>Baseline {fmtD(s.baselineFinish)} · <Variance days={s.delayDays} /></>, tone: s.delayDays && s.delayDays > 0 ? "text-red-700" : undefined },
    { label: "Work tasks", value: s.workTasks, sub: `${s.summaries} groups · ${s.milestones} milestones` },
    { label: "In progress", value: s.inProgress, sub: `${s.startingThisWeek} starting in the next 7 days` },
    { label: "Overdue", value: s.overdue, sub: "finish date passed, not 100%", tone: s.overdue ? "text-red-700" : undefined },
    { label: "Completed", value: s.completed, sub: `${s.notStarted} not started yet${s.behindPlan ? ` · ${s.behindPlan} behind plan` : ""}` },
  ];
  const total = Math.max(1, s.workTasks);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{doc.title || doc.file.originalName}</h2>
          <p className="text-xs text-slate-500">
            {doc.file.originalName} · {doc.format === "mpp" ? doc.application || "Microsoft Project" : `Excel${doc.sheet ? `, sheet ${doc.sheet}` : ""}`}
            {doc.statusDate ? ` · status date ${fmtD(doc.statusDate)}` : ""}{doc.author ? ` · last saved by ${doc.author}` : ""}
            {" · "}uploaded by {doc.uploadedBy?.name ?? "—"} {fmtDateTime(doc.createdAt)} · {doc.workDaysPerWeek}-day work week
          </p>
        </div>
        <div className="flex gap-2">
          <a href={`${API_URL}${doc.file.url}`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"><Icon name="external" /> Download</a>
          <Button variant="ghost" onClick={remove} disabled={busy}><Icon name="trash" /> Remove</Button>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-inset ring-slate-200">
            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{t.label}</div>
            <div className={cx("mt-0.5 text-xl font-semibold tabular-nums", t.tone || "text-slate-900")}>{t.value}</div>
            {t.sub && <div className="mt-0.5 text-[11px] text-slate-500">{t.sub}</div>}
          </div>
        ))}
      </div>
      <div className="mt-4">
        <div className="flex h-2.5 overflow-hidden rounded-full">
          {STATUSES.map((st) => {
            const n = { Overdue: s.overdue, "In Progress": s.inProgress, "Not Started": s.notStarted, Completed: s.completed }[st];
            return n ? <span key={st} className={STATUS_STYLE[st].bar} style={{ width: `${(n / total) * 100}%` }} title={`${st}: ${n}`} /> : null;
          })}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-4 text-[11px] text-slate-500">
          {STATUSES.map((st) => <span key={st} className="flex items-center gap-1.5"><span className={cx("h-2 w-2 rounded-full", STATUS_STYLE[st].dot)} />{st}</span>)}
          {s.resources.length > 0 && <span className="ml-auto">Resources: {s.resources.join(", ")}</span>}
        </div>
      </div>
    </section>
  );
}

function BudgetAndMaterials({ doc }: { doc: ScheduleImport }) {
  const s = doc.summary;
  const materials = s.materials ?? [];
  if (s.cost == null && !materials.length) return null;
  const spent = s.cost ? Math.round(((s.actualCost ?? 0) / s.cost) * 100) : 0;
  const saving = s.baselineCost != null && s.cost != null ? s.baselineCost - s.cost : null;
  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
      {s.cost != null && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">Budget</div>
          <div className="mt-3 text-2xl font-semibold tabular-nums">{inr(s.cost)}</div>
          <div className="text-xs text-slate-500">current cost · baseline {inr(s.baselineCost)}
            {saving != null && saving !== 0 && <span className={saving > 0 ? " text-emerald-700" : " text-red-700"}> ({saving > 0 ? `${inr(saving)} under` : `${inr(-saving)} over`})</span>}
          </div>
          <div className="mt-4 flex justify-between text-xs"><span className="text-slate-500">Spent so far</span><span className="font-medium tabular-nums">{inr(s.actualCost)} · {spent}%</span></div>
          <PercentBar percent={spent} expected={s.percent} className="mt-1" />
          <div className="mt-1 text-[11px] text-slate-500">Tick = work complete ({s.percent}%). Remaining {inr(s.remainingCost)}.</div>
        </section>
      )}
      {materials.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 text-sm font-semibold text-slate-900">Materials in the schedule <span className="font-normal text-slate-500">planned vs used, all tasks</span></div>
          <MaterialTable materials={materials} />
        </section>
      )}
    </div>
  );
}

function NowOnSite({ tasks, onOpen }: { tasks: ScheduleTask[]; onOpen: (t: ScheduleTask) => void }) {
  const work = tasks.filter((t) => !t.summary);
  const [horizon] = useState(() => Date.now() + 14 * 864e5);
  const groups = [
    { title: "Overdue", tone: "border-red-200", list: work.filter((t) => t.status === "Overdue") },
    { title: "In progress now", tone: "border-sky-200", list: work.filter((t) => t.status === "In Progress") },
    {
      title: "Starting in the next 14 days", tone: "border-slate-200",
      list: work.filter((t) => t.status === "Not Started" && t.start && new Date(t.start).getTime() < horizon).sort((a, b) => (a.start! < b.start! ? -1 : 1)),
    },
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {groups.map((g) => (
        <section key={g.title} className={cx("rounded-2xl border bg-white p-4 shadow-sm", g.tone)}>
          <div className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-900">{g.title}<span className="text-xs font-normal text-slate-500">{g.list.length}</span></div>
          {!g.list.length ? <p className="text-sm text-slate-400">None</p> : (
            <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
              {g.list.map((t) => (
                <li key={t.uid}>
                  <button onClick={() => onOpen(t)} className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-slate-50">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{t.name}</span>
                      <span className="text-xs tabular-nums text-slate-500">{t.percent}%</span>
                    </div>
                    <div className="truncate text-[11px] text-slate-500">{t.path.slice(1).join(" › ")}</div>
                    <div className="text-[11px] text-slate-500">{fmtD(t.start)} → {fmtD(t.finish)} · <Variance days={t.finishVarianceDays} /></div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

function TaskTable({ doc, onOpen }: { doc: ScheduleImport; onOpen: (t: ScheduleTask) => void }) {
  const tasks = doc.tasks!;
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [group, setGroup] = useState("");
  const [critical, setCritical] = useState(false);
  const [late, setLate] = useState(false);
  const minLevel = Math.min(...tasks.map((t) => t.level));
  // Collapsed by default below the work-package level, so the outline opens readable.
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set(tasks.filter((t) => t.summary && t.level >= minLevel + 2).map((t) => t.uid)));
  const groups = tasks.filter((t) => t.level === minLevel + 1);
  const filtering = !!(q || status || critical || late);

  const rows = useMemo(() => {
    const byUid = new Map(tasks.map((t) => [t.uid, t]));
    const inGroup = (t: ScheduleTask) => {
      if (!group) return true;
      let p: ScheduleTask | undefined = t;
      while (p && String(p.uid) !== group) p = p.parentUid != null ? byUid.get(p.parentUid) : undefined;
      return !!p;
    };
    if (filtering) {
      const needle = q.trim().toLowerCase();
      return tasks.filter((t) => inGroup(t) && !t.summary
        && (!needle || t.name.toLowerCase().includes(needle) || (t.wbs ?? "").startsWith(needle) || t.path.some((p) => p.toLowerCase().includes(needle)))
        && (!status || t.status === status) && (!critical || t.critical) && (!late || (t.finishVarianceDays ?? 0) > 0));
    }
    const hidden = (t: ScheduleTask) => {
      let p = t.parentUid != null ? byUid.get(t.parentUid) : undefined;
      while (p) {
        if (collapsed.has(p.uid)) return true;
        p = p.parentUid != null ? byUid.get(p.parentUid) : undefined;
      }
      return false;
    };
    return tasks.filter((t) => inGroup(t) && !hidden(t));
  }, [tasks, q, status, group, critical, late, collapsed, filtering]);

  const toggle = (uid: number) => setCollapsed((s) => { const n = new Set(s); if (n.has(uid)) n.delete(uid); else n.add(uid); return n; });

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-4">
        <div className="mr-auto text-sm font-semibold text-slate-900">All tasks <span className="font-normal text-slate-500">({filtering ? `${rows.length} matching` : `${tasks.length} rows`})</span></div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search task, WBS or area…" className="w-56 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
        <select value={group} onChange={(e) => setGroup(e.target.value)} className="max-w-56 rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
          <option value="">All areas</option>
          {groups.map((g) => <option key={g.uid} value={g.uid}>{g.name}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
          <option value="">Any status</option>
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-slate-600"><input type="checkbox" checked={late} onChange={(e) => setLate(e.target.checked)} /> Behind baseline</label>
        {doc.format === "mpp" && <label className="flex items-center gap-1.5 text-sm text-slate-600"><input type="checkbox" checked={critical} onChange={(e) => setCritical(e.target.checked)} /> Critical</label>}
        {!filtering && (
          <span className="flex gap-1 text-xs">
            <button className="rounded px-2 py-1 text-slate-600 hover:bg-slate-100" onClick={() => setCollapsed(new Set())}>Expand all</button>
            <button className="rounded px-2 py-1 text-slate-600 hover:bg-slate-100" onClick={() => setCollapsed(new Set(tasks.filter((t) => t.summary && t.level > minLevel).map((t) => t.uid)))}>Collapse</button>
          </span>
        )}
      </div>
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_#e2e8f0]">
            <tr className="text-[11px] uppercase tracking-wide text-slate-500">
              {["WBS", "Task", "Duration", "Start", "Finish", "Baseline finish", "Variance", "Cost", "Complete", "Status"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((t) => (
              <tr key={t.uid} onClick={() => onOpen(t)} className={cx("cursor-pointer hover:bg-slate-50", t.summary && "bg-slate-50/70 font-medium")}>
                <td className="whitespace-nowrap px-3 py-1.5 text-xs tabular-nums text-slate-400">{t.wbs ?? "—"}</td>
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-1" style={{ paddingLeft: filtering ? 0 : (t.level - minLevel) * 16 }}>
                    {!filtering && t.summary ? (
                      <button onClick={(e) => { e.stopPropagation(); toggle(t.uid); }} className="grid h-5 w-5 place-items-center rounded text-slate-500 hover:bg-slate-200" aria-label={collapsed.has(t.uid) ? "Expand" : "Collapse"}>
                        <Icon name={collapsed.has(t.uid) ? "right" : "left"} className={cx("h-3.5 w-3.5", !collapsed.has(t.uid) && "-rotate-90")} />
                      </button>
                    ) : <span className="w-5" />}
                    <span className={cx("text-slate-800", t.summary && "font-semibold text-slate-900")}>{t.name}</span>
                    {t.critical && <span className="rounded bg-red-100 px-1 text-[10px] font-semibold text-red-700">CRITICAL</span>}
                    {t.milestone && <span className="rounded bg-violet-100 px-1 text-[10px] font-semibold text-violet-700">MILESTONE</span>}
                    {!!t.materials?.length && <span className="rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800" title={t.materials.map((m) => m.name).join(", ")}>{t.materials.length} MAT</span>}
                  </div>
                  {filtering && <div className="truncate pl-6 text-[11px] text-slate-500">{t.path.slice(1).join(" › ")}</div>}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-slate-600">{fmtDays(t.durationDays)}</td>
                <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{fmtD(t.start)}</td>
                <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{fmtD(t.finish)}</td>
                <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-slate-500">{fmtD(t.baselineFinish)}</td>
                <td className="whitespace-nowrap px-3 py-1.5 text-xs"><Variance days={t.finishVarianceDays} /></td>
                <td className="whitespace-nowrap px-3 py-1.5 text-xs tabular-nums text-slate-600">{t.cost ? inr(t.cost) : "—"}</td>
                <td className="w-32 px-3 py-1.5"><div className="flex items-center gap-2"><PercentBar percent={t.percent} expected={t.plannedPercent} /><span className="w-9 text-right text-xs tabular-nums text-slate-600">{t.percent}%</span></div></td>
                <td className="px-3 py-1.5"><TaskStatus value={t.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="p-6 text-center text-sm text-slate-500">No tasks match these filters.</p>}
      </div>
    </section>
  );
}

function TaskModal({ task, tasks, onClose }: { task: ScheduleTask | null; tasks: ScheduleTask[]; onClose: () => void }) {
  if (!task) return null;
  const byUid = new Map(tasks.map((t) => [t.uid, t]));
  const successors = tasks.filter((t) => t.predecessors.some((p) => p.uid === task.uid));
  const children = tasks.filter((t) => t.parentUid === task.uid);
  return (
    <Modal open wide onClose={onClose} title={task.name}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <TaskStatus value={task.status} />
          {task.wbs && <span>WBS {task.wbs}</span>}
          {task.critical && <span className="rounded bg-red-100 px-1.5 font-semibold text-red-700">Critical path</span>}
          {task.milestone && <span className="rounded bg-violet-100 px-1.5 font-semibold text-violet-700">Milestone</span>}
        </div>
        {task.path.length > 0 && <p className="text-xs text-slate-500">{task.path.join(" › ")}</p>}
        {task.note && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Remark: {task.note}</p>}
        <div>
          <div className="mb-1 flex justify-between text-xs text-slate-500">
            <span>Complete{task.plannedPercent != null ? ` · planned ${task.plannedPercent}% by the status date` : ""}</span>
            <span className="font-medium text-slate-800">{task.percent}%</span>
          </div>
          <PercentBar percent={task.percent} expected={task.plannedPercent} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start">{fmtD(task.start)}</Field>
          <Field label="Finish">{fmtD(task.finish)}</Field>
          <Field label="Baseline start">{fmtD(task.baselineStart)} <span className="text-xs"><Variance days={task.startVarianceDays} /></span></Field>
          <Field label="Baseline finish">{fmtD(task.baselineFinish)} <span className="text-xs"><Variance days={task.finishVarianceDays} /></span></Field>
          <Field label="Actual start">{fmtD(task.actualStart)}</Field>
          <Field label="Actual finish">{fmtD(task.actualFinish)}</Field>
          <Field label="Duration">{fmtDays(task.durationDays)}{task.baselineDurationDays != null && task.baselineDurationDays !== task.durationDays ? <span className="text-xs text-slate-500"> (baseline {fmtDays(task.baselineDurationDays)})</span> : null}</Field>
          <Field label="Total slack">{fmtDays(task.totalSlackDays)}</Field>
          <Field label="Done / remaining">{fmtDays(task.actualDurationDays ?? 0)} / {fmtDays(task.remainingDurationDays)}</Field>
          <Field label="Free slack">{fmtDays(task.freeSlackDays ?? 0)}</Field>
          <Field label="Early start → finish">{fmtD(task.earlyStart)} → {fmtD(task.earlyFinish)}</Field>
          <Field label="Late start → finish">{fmtD(task.lateStart)} → {fmtD(task.lateFinish)}</Field>
          {task.constraint && <Field label="Constraint"><span className="capitalize">{task.constraint.type}</span>{task.constraint.date ? ` ${fmtD(task.constraint.date)}` : ""}</Field>}
        </div>
        {task.cost != null && (
          <div className="grid grid-cols-4 gap-2 rounded-lg bg-slate-50 p-3">
            <Field label="Cost">{inr(task.cost)}</Field>
            <Field label="Baseline">{inr(task.baselineCost)}</Field>
            <Field label="Spent">{inr(task.actualCost)}</Field>
            <Field label="Remaining">{inr(task.remainingCost)}</Field>
          </div>
        )}
        {!!task.materials?.length && <div><div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">Materials</div><MaterialTable materials={task.materials} /></div>}
        {task.resources.length > 0 && <Field label="Resources">{task.resources.join(", ")}</Field>}
        {task.predecessors.length > 0 && (
          <Field label="Depends on">
            <ul className="space-y-0.5">{task.predecessors.map((p, i) => <li key={i}>{byUid.get(p.uid)?.name ?? `Task ${p.uid}`} <span className="text-xs text-slate-500">({linkText(p)}{byUid.get(p.uid) ? `, ${byUid.get(p.uid)!.status.toLowerCase()}` : ""})</span></li>)}</ul>
          </Field>
        )}
        {successors.length > 0 && <Field label="Then starts">{successors.slice(0, 8).map((s) => s.name).join(", ")}{successors.length > 8 ? ` +${successors.length - 8} more` : ""}</Field>}
        {children.length > 0 && <Field label="Contains">{children.length} tasks: {children.slice(0, 6).map((c) => c.name).join(", ")}{children.length > 6 ? "…" : ""}</Field>}
      </div>
    </Modal>
  );
}
