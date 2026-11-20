"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { API_URL, api, useApi } from "@/lib/api";
import type { GeotechEstimate, GeotechList, GeotechReport, GeotechWeather, Project, SoilClass, WeatherKind } from "@/lib/types";
import { Badge, Button, ErrorBox, Input, Loading, Select } from "@/components/ui";
import { AiMark, CalculatedMark } from "@/components/ai";
import { DailyWorkPlan, Dropzone, EquipmentCards, Icon, PhaseCards, PhaseTimeline, SoilProfile, Spinner, equipmentPhoto, type IconName } from "@/components/geotech";
import { fmtDate, fmtDateTime, fmtWeekday, todayInput } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { canAccess } from "@/lib/navigation";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
const SOIL_COLOR: Record<SoilClass, string> = { soft: "#b9977a", ordinary: "#d9b96a", hard: "#c48b3c", rock: "#5f6b7d" };
const SOIL_TONE: Record<SoilClass, string> = { soft: "amber", ordinary: "green", hard: "blue", rock: "purple" };

function Panel({ title, icon, actions, children, className }: { title?: React.ReactNode; icon?: IconName; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cx("relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04),0_12px_28px_-16px_rgba(15,23,42,.18)]", className)}>
      <div className="h-0.5 bg-gradient-to-r from-amber-400 via-amber-200 to-transparent" />
      {title && (
        <header className="flex flex-wrap items-center justify-between gap-2 px-5 pb-1 pt-4">
          <h2 className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight text-slate-900">
            {icon && <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-amber-100 to-amber-50 text-amber-700 ring-1 ring-amber-200/80"><Icon name={icon} /></span>}
            {title}
          </h2>
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export default function GeotechPage() {
  const { data: projects } = useApi<Project[]>("/projects");
  const [projectId, setProjectId] = useState("");
  const project = projectId || projects?.[0]?._id || "";
  const { data, error, loading, reload, setData } = useApi<GeotechList>(project ? `/geotech?project=${project}` : null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const reports = data?.reports ?? [];
  const selected = reports.find((r) => r._id === selectedId) || reports[0] || null;
  // The upload form stays open while there is nothing to look at.
  const formOpen = showForm || (!!data && !reports.length);

  const onCreated = (report: GeotechReport, replaces?: string) => {
    setData((d) => (d ? { ...d, reports: [report, ...d.reports.filter((r) => r._id !== report._id && r._id !== replaces)] } : d));
    setSelectedId(report._id);
    setShowForm(false);
  };
  const onDeleted = (id: string) => {
    setData((d) => (d ? { ...d, reports: d.reports.filter((r) => r._id !== id) } : d));
    if (selectedId === id) setSelectedId(null);
    reload(); // learning may change when a report with actuals goes
  };
  const onUpdated = (report: GeotechReport) => {
    setData((d) => (d ? { ...d, reports: d.reports.map((r) => (r._id === report._id ? report : r)) } : d));
    reload(); // the learning summary changes when actuals are recorded
  };

  if (!projects) return <Loading />;

  return (
    <div className="space-y-5">
      <AgentHeader
        configured={data?.ai.configured}
        quotaUntil={data?.ai.quota?.blocked ? data.ai.quota.retryAt : undefined}
        report={selected}
        projectPicker={projects.length > 1 ? (
          <Select value={project} onChange={(e) => { setProjectId(e.target.value); setSelectedId(null); }} className="max-w-56 border-white/20 bg-white/10 text-white">
            {projects.map((p) => <option key={p._id} value={p._id} className="text-slate-900">{p.name}</option>)}
          </Select>
        ) : <span className="text-sm text-slate-300">{projects[0]?.name}</span>}
      />
      <ErrorBox message={error} />

      <ReportBar
        reports={reports}
        selectedId={selected?._id}
        onSelect={(id) => { setSelectedId(id); setShowForm(false); }}
        onDeleted={onDeleted}
        formOpen={formOpen}
        canClose={reports.length > 0}
        onToggleForm={() => setShowForm(!showForm)}
      />
      {formOpen && <EstimateForm projectId={project} configured={data?.ai.configured} onCreated={onCreated} />}

      {loading && !data ? <Loading /> : selected ? (
        <ReportView key={selected._id} report={selected} learning={data!.learning} onUpdated={onUpdated} onCreated={onCreated} />
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-slate-100 text-slate-500"><Icon name="layers" className="h-6 w-6" /></span>
          <p className="font-medium text-slate-800">No geotechnical report yet</p>
          <p className="mt-1 text-sm text-slate-500">Upload the soil investigation report above, or load the sample soil profile to see how the estimate works.</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

type StepState = "done" | "current" | "todo" | "stopped";

const STEP_DOT: Record<StepState, string> = {
  done: "bg-emerald-400 text-slate-900",
  current: "bg-amber-400 text-slate-900 ring-4 ring-amber-400/25",
  stopped: "bg-red-400 text-slate-900",
  todo: "bg-white/10 text-slate-300",
};

// Where the selected report stands in the flow: read → calculated → approved → on site.
function AgentHeader({ configured, quotaUntil, report, projectPicker }: { configured?: boolean; quotaUntil?: string; report: GeotechReport | null; projectPicker: React.ReactNode }) {
  const e = report?.estimate;
  const f = report?.extraction.facts;
  const v = report?.verification.status;
  const steps: { icon: IconName; title: string; text: string; state: StepState }[] = [
    {
      icon: "sparkles", title: "AI reads the report",
      text: !report ? "Soil layers, water table, rock, SBC" : f ? `${f.completeness.found} of ${f.completeness.of} key facts found` : "The file could not be read",
      state: !report ? "todo" : f ? "done" : "stopped",
    },
    {
      icon: "calc", title: "Rules calculate",
      text: e && report ? `${plinthDays(e, report.weather)} days · ${e.totals.peakJcbs} JCBs · ${e.totals.peakWorkers} workers` : "JCBs, days and crew per phase",
      state: e ? "done" : "todo",
    },
    {
      icon: "check", title: "Manager approves",
      text: v === "Accepted" || v === "Overridden" ? `Accepted by ${report?.verification.by?.name ?? "a manager"}` : v === "Rejected" ? "Rejected, nothing sent to site" : e ? "Waiting for a decision" : "Accept or reject, fully audited",
      state: v === "Accepted" || v === "Overridden" ? "done" : v === "Rejected" ? "stopped" : e ? "current" : "todo",
    },
    {
      icon: "clipboard", title: "Checklist on site",
      text: v === "Accepted" ? "Site team ticks it off day by day" : "Sent when the estimate is accepted",
      state: v === "Accepted" ? "done" : "todo",
    },
  ];
  const ok = configured && !quotaUntil;
  return (
    <div className="overflow-hidden rounded-2xl bg-[radial-gradient(120%_140%_at_0%_0%,#1e293b_0%,#0b1120_55%,#060a14_100%)] text-white shadow-[0_18px_40px_-24px_rgba(2,6,23,.8)]">
      <div className="flex flex-wrap items-start justify-between gap-4 px-6 pt-6">
        <div className="min-w-0">
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-300 ring-1 ring-inset ring-amber-400/30">
            <Icon name="sparkles" className="h-3.5 w-3.5" /> Geotech Agent
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Plinth Estimate</h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-300">
            From the soil investigation report to a day-by-day site plan: what the ground is like, how deep to dig, and the machines, crew and days needed up to plinth level.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {projectPicker}
          <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset", ok ? "bg-emerald-400/10 text-emerald-300 ring-emerald-400/30" : "bg-amber-400/10 text-amber-300 ring-amber-400/30")}>
            <span className={cx("h-1.5 w-1.5 rounded-full", ok ? "bg-emerald-400" : "bg-amber-400")} />
            {configured === undefined ? "Checking AI…" : quotaUntil ? `AI quota used up · resets ${fmtDateTime(quotaUntil)}` : configured ? "AI connected" : "AI offline: sample profile only"}
          </span>
        </div>
      </div>
      <ol className="mt-6 grid border-t border-white/10 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((st, i) => (
          <li key={st.title} className={cx("relative flex items-center gap-3 px-6 py-4", i > 0 && "border-white/10 sm:border-l", st.state === "current" && "bg-white/[0.04]")}>
            <span className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-semibold", STEP_DOT[st.state])}>
              {st.state === "done" ? <Icon name="check" className="h-[18px] w-[18px]" /> : st.state === "stopped" ? <Icon name="x" className="h-[18px] w-[18px]" /> : i + 1}
            </span>
            <div className="min-w-0">
              <div className={cx("text-sm font-medium", st.state === "todo" ? "text-slate-300" : "text-white")}>{st.title}</div>
              <div className={cx("truncate text-xs", st.state === "current" ? "text-amber-200" : "text-slate-400")}>{st.text}</div>
            </div>
            {st.state === "current" && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-amber-400" />}
          </li>
        ))}
      </ol>
    </div>
  );
}

function UnitInput({ unit, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { unit: string }) {
  return (
    <div className="relative">
      <Input {...props} className="pr-10 tabular-nums" />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-400">{unit}</span>
    </div>
  );
}

function EstimateForm({ projectId, configured, onCreated }: { projectId: string; configured?: boolean; onCreated: (r: GeotechReport) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [area, setArea] = useState("");
  const [depth, setDepth] = useState("");
  const [weather, setWeather] = useState<File | null>(null);
  const [busy, setBusy] = useState<"upload" | "sample" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async (mode: "upload" | "sample") => {
    setErr(null);
    if (area && !(Number(area) > 0)) return setErr("Plinth area must be more than 0 m².");
    if (mode === "upload" && !file) return setErr("Choose the geotechnical report (PDF or photo).");
    if (file && file.size > 12 * 1024 * 1024 && mode === "upload") return setErr("The file is larger than 12 MB.");
    if (weather && weather.size > 12 * 1024 * 1024) return setErr("The weather report is larger than 12 MB.");
    setBusy(mode);
    try {
      let report: GeotechReport;
      if (mode === "upload") {
        const body = new FormData();
        body.append("file", file!);
        body.append("project", projectId);
        if (area) body.append("plinthAreaSqm", area);
        if (depth) body.append("depthM", depth);
        if (weather) body.append("weather", weather);
        report = await api<GeotechReport>("/geotech", { method: "POST", body });
      } else {
        report = await api<GeotechReport>("/geotech/sample", {
          method: "POST", json: { project: projectId, plinthAreaSqm: area ? Number(area) : null, depthM: depth ? Number(depth) : null },
        });
        if (weather) {
          const body = new FormData();
          body.append("file", weather);
          report = await api<GeotechReport>(`/geotech/${report._id}/weather`, { method: "POST", body });
        }
      }
      setWeather(null);
      onCreated(report);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel title="New estimate" icon="upload" actions={<span className="text-xs text-slate-500">Soil report required · weather report optional</span>}>
      <form className="grid gap-5 md:grid-cols-[1.2fr_1fr]" onSubmit={(e) => { e.preventDefault(); run("upload"); }}>
        <Dropzone file={file} onFile={setFile} disabled={!!busy} />
        <div className="flex flex-col gap-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600">Plinth area <span className="font-normal text-slate-400">(optional)</span></span>
            <UnitInput unit="m²" type="number" min="1" step="any" value={area} onChange={(e) => setArea(e.target.value)} placeholder="from report, else 400" />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600">Excavation depth <span className="font-normal text-slate-400">(optional)</span></span>
            <UnitInput unit="m" type="number" min="0.3" max="15" step="0.1" value={depth} onChange={(e) => setDepth(e.target.value)} placeholder="from report, else 1.5" />
          </label>
          <div className="space-y-1">
            <span className="block text-xs font-medium text-slate-600">Weather report <span className="font-normal text-slate-400">(optional, for the rain buffer)</span></span>
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-sm">
              <Icon name="rain" />
              <span className={cx("min-w-0 flex-1 truncate", weather ? "text-slate-800" : "text-slate-400")}>{weather ? weather.name : "IMD or site forecast, PDF or photo"}</span>
              {weather ? (
                <button type="button" className="text-xs text-slate-500 underline" disabled={!!busy} onClick={() => setWeather(null)}>remove</button>
              ) : (
                <label className="cursor-pointer text-xs font-medium text-slate-700 underline">
                  choose
                  <input type="file" accept="application/pdf,image/*" className="hidden" disabled={!!busy} onChange={(ev) => { setWeather(ev.target.files?.[0] ?? null); ev.target.value = ""; }} />
                </label>
              )}
            </div>
          </div>
          <div className="mt-auto flex flex-col gap-2 pt-1 sm:flex-row">
            <Button type="submit" className="flex-1 py-2" disabled={!!busy || !projectId || configured === false}>
              {busy === "upload" ? <><Spinner /> Reading report…</> : <><Icon name="sparkles" /> Run estimate</>}
            </Button>
            <Button type="button" variant="secondary" className="py-2" disabled={!!busy || !projectId} onClick={() => run("sample")}>
              {busy === "sample" ? <><Spinner /> Calculating…</> : "Use sample profile"}
            </Button>
          </div>
        </div>
      </form>
      {busy === "upload" && (
        <div className="mt-4 flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <Spinner className="h-5 w-5 text-amber-500" />
          The AI is reading the report, then the rules calculate each phase. A long PDF can take a minute or two.
        </div>
      )}
      {err && <div className="mt-4"><ErrorBox message={err} /></div>}
    </Panel>
  );
}

const STATE = (r: GeotechReport) => {
  if (!r.estimate) return { label: "Not read", dot: "bg-red-500" };
  return {
    Pending: { label: "Proposed", dot: "bg-amber-400" },
    Accepted: { label: "Accepted", dot: "bg-emerald-500" },
    Rejected: { label: "Rejected", dot: "bg-slate-400" },
    Overridden: { label: "Overridden", dot: "bg-sky-500" },
  }[r.verification.status];
};

const DELETE_ANY = ["admin", "project_manager", "site_manager"];

function ReportBar({ reports, selectedId, onSelect, onDeleted, formOpen, canClose, onToggleForm }: {
  reports: GeotechReport[]; selectedId?: string; onSelect: (id: string) => void; onDeleted: (id: string) => void;
  formOpen: boolean; canClose: boolean; onToggleForm: () => void;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const canDelete = (r: GeotechReport) => Boolean(user && (DELETE_ANY.includes(user.role) || r.uploadedBy?._id === user._id));
  const remove = async (r: GeotechReport) => {
    const name = r.source === "sample" ? "the sample soil profile" : `"${r.file?.originalName}"`;
    const plan = r.verification.status === "Accepted"
      ? "\n\nIt is accepted, so its Plinth Plan and every site update on it will be deleted too."
      : "";
    if (!window.confirm(`Delete ${name} and all its data?${plan}\n\nThis cannot be undone.`)) return;
    setBusy(r._id);
    setErr(null);
    try {
      await api(`/geotech/${r._id}`, { method: "DELETE" });
      onDeleted(r._id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not delete the report");
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,.04),0_12px_28px_-16px_rgba(15,23,42,.18)]">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex shrink-0 items-center gap-2 pl-1 text-sm font-semibold text-slate-900">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-amber-100 to-amber-50 text-amber-700 ring-1 ring-amber-200/80"><Icon name="file" /></span>
          Soil reports
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{reports.length}</span>
        </div>
        <ul className="order-last flex w-full min-w-0 gap-2 overflow-x-auto pb-0.5 sm:order-none sm:w-auto sm:flex-1">
          {reports.map((r) => {
            const st = STATE(r);
            const active = r._id === selectedId;
            return (
              <li key={r._id} className="relative w-72 shrink-0">
                <button
                  onClick={() => onSelect(r._id)}
                  aria-current={active}
                  className={cx(
                    "flex w-full items-center gap-3 rounded-xl border px-2.5 py-2 text-left transition",
                    canDelete(r) && "pr-10",
                    active ? "border-slate-900 bg-slate-900 text-white shadow-md" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                  )}
                >
                  <span className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-lg", active ? "bg-white/10" : r.source === "sample" ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600")}>
                    <Icon name={r.source === "sample" ? "layers" : "file"} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{r.source === "sample" ? "Sample soil profile" : r.file?.originalName}</span>
                    <span className={cx("flex items-center gap-1.5 truncate text-[11px]", active ? "text-slate-300" : "text-slate-500")}>
                      <span className={cx("h-1.5 w-1.5 shrink-0 rounded-full", st.dot)} />{st.label} · {fmtDateTime(r.createdAt)}
                    </span>
                  </span>
                </button>
                {canDelete(r) && (
                  <button
                    onClick={() => remove(r)}
                    disabled={busy === r._id}
                    title="Delete this report and its data"
                    aria-label="Delete report"
                    className={cx(
                      "absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg transition",
                      active ? "text-slate-300 hover:bg-white/10 hover:text-white" : "text-slate-400 hover:bg-red-50 hover:text-red-600",
                    )}
                  >
                    {busy === r._id ? <Spinner /> : <Icon name="trash" />}
                  </button>
                )}
              </li>
            );
          })}
          {!reports.length && <li className="px-1 py-2 text-sm text-slate-500">No reports yet. Upload the first one below.</li>}
        </ul>
        {(canClose || !formOpen) && (
          <Button variant={formOpen ? "secondary" : "primary"} className="ml-auto shrink-0 py-2" onClick={onToggleForm}>
            {formOpen ? <><Icon name="x" /> Close</> : <><Icon name="plus" /> New estimate</>}
          </Button>
        )}
      </div>
      {err && <div className="mt-2"><ErrorBox message={err} /></div>}
    </section>
  );
}

// ---------------------------------------------------------------------------

type TabKey = "overview" | "soil" | "schedule" | "resources" | "learning";

function ReportView({ report, learning, onUpdated, onCreated }: {
  report: GeotechReport; learning: GeotechList["learning"]; onUpdated: (r: GeotechReport) => void; onCreated: (r: GeotechReport, replaces?: string) => void;
}) {
  const { extraction, estimate: e, narration } = report;
  const facts = extraction.facts;
  const [tab, setTab] = useState<TabKey>("overview");
  const tabsRef = useRef<HTMLDivElement>(null);
  // Switching tabs from far down the page brings the tab bar back into view.
  const openTab = (key: TabKey) => {
    setTab(key);
    const el = tabsRef.current;
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (!e || !facts) return <NotRead report={report} onCreated={onCreated} />;

  const machineCount = e.totals.machines.length + (e.totals.tippers > 0 ? 1 : 0) + e.totals.otherVehicles.length;
  const tabs: { key: TabKey; label: string; icon: IconName; hint?: string }[] = [
    { key: "overview", label: "Overview", icon: "info", hint: e.warnings.length ? `${e.warnings.length} to check` : undefined },
    { key: "soil", label: "Soil report", icon: "layers", hint: `${facts.layers.length} layers` },
    { key: "schedule", label: "Schedule & weather", icon: "calendar", hint: `${plinthDays(e, report.weather)} days` },
    { key: "resources", label: "Machines & crew", icon: "digger", hint: `${machineCount} types` },
    { key: "learning", label: "Learning", icon: "brain" },
  ];

  return (
    <div className="space-y-5">
      <ReportTitle report={report} />
      <Verification report={report} onUpdated={onUpdated} />

      <div ref={tabsRef} className="sticky top-0 z-20 -mx-4 bg-[#f6f7f9]/85 px-4 py-2 backdrop-blur md:-mx-6 md:px-6">
        <div role="tablist" aria-label="Estimate sections" className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white p-1 shadow-sm">
          {tabs.map((t) => {
            const active = t.key === tab;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={active}
                onClick={() => openTab(t.key)}
                className={cx(
                  "flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition",
                  active ? "bg-slate-900 text-white shadow" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                <Icon name={t.icon} />
                {t.label}
                {t.hint && <span className={cx("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", active ? "bg-white/15 text-slate-200" : "bg-slate-100 text-slate-500")}>{t.hint}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Every tab stays mounted, so forms and open sections keep their state when you switch. */}
      <div role="tabpanel" hidden={tab !== "overview"} className="space-y-5">
        <SiteSummary report={report} onCreated={onCreated} />
        <Kpis estimate={e} weather={report.weather} onMachines={() => openTab("resources")} />
        {e.warnings.length > 0 && (
          <Panel title="Check before you approve" icon="alert" actions={<span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{e.warnings.length}</span>}>
            <Warnings warnings={e.warnings} />
          </Panel>
        )}
        <Panel title="What it means" icon="sparkles" actions={narration?.aiGenerated ? <AiMark /> : undefined} className={narration ? "border-violet-200" : undefined}>
          {narration ? (
            <div className="space-y-5">
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-50 via-white to-amber-50/60 p-5 ring-1 ring-violet-100">
                <span className="absolute inset-y-4 left-0 w-1 rounded-r bg-violet-400" />
                <p className="relative pl-2 text-[15px] leading-relaxed text-slate-800">{narration.summary}</p>
              </div>
              {!!narration.recommendations?.length && (
                <div>
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">What to do</div>
                  <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {narration.recommendations.map((rec, i) => (
                      <li key={i} className="relative overflow-hidden rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
                        <span className="pointer-events-none absolute -bottom-3 right-3 text-7xl font-black leading-none text-violet-50">{i + 1}</span>
                        <span className="relative block text-sm font-semibold leading-snug text-slate-900">{rec.action}</span>
                        <span className="relative mt-2 block text-xs leading-relaxed text-slate-500">{rec.rationale}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No AI explanation for this run (AI unavailable). Every figure on this page is calculated by the rules and is complete without it.</p>
          )}
        </Panel>
        <Panel title="Phase timeline" icon="calendar" actions={<CalculatedMark title="Five sequential phases; calendar days are the sum" />}>
          <PhaseTimeline estimate={withWeather(e, report.weather)} />
        </Panel>
      </div>

      <div role="tabpanel" hidden={tab !== "soil"} className="space-y-5">
        <div className="grid gap-5 xl:grid-cols-[1.1fr_1fr]">
          <Panel title="Soil layer view" icon="layers" actions={<span className="text-[11px] text-slate-400">hover a layer for the report text</span>}>
            <SoilProfile facts={facts} depthM={e.inputs.depthM} foundation={e.foundation.type} />
          </Panel>
          <SoilFacts report={report} />
        </div>
        <KeyFindings report={report} />
      </div>

      <div role="tabpanel" hidden={tab !== "schedule"} className="space-y-5">
        <WeatherPanel report={report} onUpdated={onUpdated} />
        <Panel
          title="Daily work plan"
          icon="users"
          actions={<CalculatedMark title="Each phase's total split evenly across its days — a sequencing guide, not a measured record" />}
        >
          <p className="mb-4 rounded-xl bg-slate-50 px-4 py-2.5 text-xs leading-relaxed text-slate-500">
            Day by day: what the crew does, how many workers of each trade, and which machines are needed. Quantities are each
            phase&apos;s total spread evenly across its days — actual daily output on site will vary. Tap a phase to open or close it.
          </p>
          <DailyWorkPlan phases={e.phases} />
        </Panel>
      </div>

      <div role="tabpanel" hidden={tab !== "resources"} className="space-y-5">
        <Panel title="Machines & vehicles" icon="wrench" actions={<span className="text-xs text-slate-500">what each one does, and when it is on site</span>}>
          <EquipmentCards estimate={e} hideTitle />
        </Panel>
        <Panel title="Crew and machines per phase" icon="digger" actions={<span className="flex items-center gap-2"><Badge tone="slate">Confidence {e.confidence}%</Badge><CalculatedMark /></span>}>
          <PhaseCards phases={e.phases} />
          {(e.assumptions.length > 0 || e.confidenceBasis.length > 0) && (
            <div className="mt-4 grid gap-3 text-xs text-slate-600 md:grid-cols-2">
              {e.assumptions.length > 0 && <Note title="Assumptions" lines={e.assumptions} />}
              <Note title={`Why ${e.confidence}% confidence`} lines={e.confidenceBasis} />
            </div>
          )}
        </Panel>
      </div>

      <div role="tabpanel" hidden={tab !== "learning"} className="space-y-5">
        <LearningPanel report={report} learning={learning} onUpdated={onUpdated} />
      </div>
    </div>
  );
}

function Note({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="mb-1 font-medium text-slate-700">{title}</div>
      <ul className="list-disc space-y-0.5 pl-4">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
    </div>
  );
}

const STATUS_PILL: Record<string, string> = {
  Proposed: "bg-amber-50 text-amber-800 ring-amber-200",
  Accepted: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  Rejected: "bg-slate-100 text-slate-600 ring-slate-200",
  Overridden: "bg-sky-50 text-sky-800 ring-sky-200",
  "Not read": "bg-red-50 text-red-700 ring-red-200",
};

function ReportTitle({ report }: { report: GeotechReport }) {
  const facts = report.extraction.facts;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="mb-1 flex items-center gap-2">
          <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", STATUS_PILL[STATE(report).label] ?? "bg-slate-100 text-slate-600 ring-slate-200")}>
            <span className={cx("h-1.5 w-1.5 rounded-full", STATE(report).dot)} />{STATE(report).label}
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Selected report</span>
        </div>
        <h2 className="line-clamp-2 text-lg font-semibold leading-snug text-slate-900" title={facts?.reportTitle || undefined}>{facts?.reportTitle || report.file?.originalName || "Soil report"}</h2>
        <p className="text-xs text-slate-500">
          {report.source === "sample" ? "Built-in sample profile" : report.file?.originalName} · {fmtDateTime(report.createdAt)}{report.uploadedBy ? ` · ${report.uploadedBy.name}` : ""}
        </p>
      </div>
      {report.file && (
        <a href={`${API_URL}${report.file.url}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
          <Icon name="external" /> Open report
        </a>
      )}
    </div>
  );
}

function Kpi({ icon, photo, label, value, sub, accent }: { icon: IconName; photo?: string; label: string; value: React.ReactNode; sub?: React.ReactNode; accent?: boolean }) {
  return (
    <div className={cx("rounded-2xl border p-4 shadow-sm", accent ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white")}>
      <div className="flex items-center justify-between">
        <span className={cx("text-xs font-medium", accent ? "text-slate-300" : "text-slate-500")}>{label}</span>
        <span className={cx("grid h-9 w-9 place-items-center overflow-hidden rounded-lg", accent ? "bg-white/10 text-amber-300" : "bg-slate-100 text-slate-600")}>
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : <Icon name={icon} />}
        </span>
      </div>
      <div className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">{value}</div>
      {sub && <div className={cx("mt-1 text-xs", accent ? "text-slate-400" : "text-slate-500")}>{sub}</div>}
    </div>
  );
}

// Days to plinth including the rain buffer, when there is one.
const plinthDays = (e: GeotechEstimate, w?: GeotechWeather | null) => w?.totalDays ?? e.totals.calendarDays;

// The estimate with each phase stretched by its weather days, for the timeline.
function withWeather(e: GeotechEstimate, w?: GeotechWeather | null): GeotechEstimate {
  if (!w) return e;
  let day = 0;
  const phases = e.phases.map((p) => {
    const days = w.phases.find((x) => x.key === p.key)?.days ?? p.days;
    const out = { ...p, days, startDay: day, endDay: day + days };
    day += days;
    return out;
  });
  return { ...e, phases, totals: { ...e.totals, calendarDays: day } };
}

function Kpis({ estimate: e, weather: w, onMachines }: { estimate: GeotechEstimate; weather?: GeotechWeather | null; onMachines: () => void }) {
  const t = e.totals;
  const busiest = e.phases.find((p) => p.workerTotal === t.peakWorkers)?.name;
  const phases = `${e.phases.filter((p) => !p.insufficientData).length} phases in sequence`;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi accent icon="calendar" label={t.partial ? "Days to plinth (at least)" : "Days to plinth"} value={plinthDays(e, w)} sub={w ? `${phases} · incl. ${w.extraDays} for rain` : phases} />
        <Kpi icon="digger" photo="/equipment/jcb.jpg" label="JCBs" value={t.peakJcbs} sub={`${e.excavation.days} days of excavation`} />
        <Kpi icon="users" label="Peak workers" value={t.peakWorkers} sub={busiest ? `during ${busiest.toLowerCase()}` : undefined} />
        <Kpi icon="truck" photo="/equipment/tipper.jpg" label="Tippers" value={t.tippers} sub={`${e.excavation.looseVolumeM3} m³ to haul`} />
      </div>
      <button
        type="button"
        onClick={onMachines}
        className="group flex w-full flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm transition hover:border-slate-300 hover:shadow-md"
      >
        <span className="mr-1 flex items-center gap-1.5 text-xs font-medium text-slate-500"><Icon name="wrench" className="h-3.5 w-3.5" />On site</span>
        {[...t.machines.map((m) => ({ ...m, kind: "machine" as const })), ...(t.tippers > 0 ? [{ name: "Tipper", count: t.tippers, kind: "vehicle" as const }] : []), ...t.otherVehicles.map((v) => ({ ...v, kind: "vehicle" as const }))].map((m) => (
          <span key={m.name} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 py-0.5 pl-0.5 pr-2.5 text-xs text-slate-700">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={equipmentPhoto(m.name, m.kind)} alt="" className="h-6 w-6 rounded-full object-cover" loading="lazy" />
            <span className="font-semibold tabular-nums">{m.count}</span> {m.name}
          </span>
        ))}
        <span className="ml-auto flex items-center gap-1 text-xs font-medium text-slate-600 group-hover:text-slate-900">Machines &amp; crew <Icon name="right" className="h-3.5 w-3.5" /></span>
      </button>
    </div>
  );
}

const WARN: Record<string, { box: string; icon: IconName; iconCls: string }> = {
  critical: { box: "border-red-200 bg-red-50 text-red-900", icon: "alert", iconCls: "text-red-600" },
  warning: { box: "border-amber-200 bg-amber-50 text-amber-900", icon: "alert", iconCls: "text-amber-600" },
  attention: { box: "border-sky-200 bg-sky-50 text-sky-900", icon: "info", iconCls: "text-sky-600" },
  info: { box: "border-slate-200 bg-slate-50 text-slate-800", icon: "info", iconCls: "text-slate-500" },
};

function Warnings({ warnings }: { warnings: GeotechEstimate["warnings"] }) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {warnings.map((w, i) => {
        const s = WARN[w.level] || WARN.info;
        return (
          <div key={i} className={cx("flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm", s.box)}>
            <span className={cx("mt-0.5", s.iconCls)}><Icon name={s.icon} /></span>
            <span><span className="font-semibold capitalize">{w.level}: </span>{w.text}</span>
          </div>
        );
      })}
    </div>
  );
}

// Where a fact came from: printed in the report (with page), entered by the user, or a default.
type Source = { kind: "report"; page?: number | null; quote?: string | null } | { kind: "entered" } | { kind: "assumed"; why?: string } | { kind: "missing" };

function SourceTag({ source }: { source: Source }) {
  const style = {
    report: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    entered: "bg-sky-50 text-sky-700 ring-sky-200",
    assumed: "bg-amber-50 text-amber-800 ring-amber-200",
    missing: "bg-slate-100 text-slate-500 ring-slate-200",
  }[source.kind];
  const dot = { report: "bg-emerald-500", entered: "bg-sky-500", assumed: "bg-amber-500", missing: "bg-slate-400" }[source.kind];
  const text = source.kind === "report" ? `Report${source.page ? ` · p.${source.page}` : ""}` : source.kind === "entered" ? "Entered" : source.kind === "assumed" ? "Assumed" : "Not in report";
  const title = source.kind === "report" && source.quote ? `“${source.quote}”` : source.kind === "assumed" ? source.why : undefined;
  return (
    <span title={title} className={cx("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset", style, title && "cursor-help")}>
      <span className={cx("h-1.5 w-1.5 rounded-full", dot)} />{text}
    </span>
  );
}

function FactTile({ icon, label, value, source, sub }: { icon: IconName; label: string; value: string | number | null | undefined; source: Source; sub?: string | null }) {
  const missing = value === null || value === undefined;
  const stripe = missing ? "bg-slate-200" : { report: "bg-emerald-400", entered: "bg-sky-400", assumed: "bg-amber-400", missing: "bg-slate-200" }[source.kind];
  return (
    <div className={cx("relative overflow-hidden rounded-2xl border bg-white p-4 pl-5 transition hover:shadow-md", missing ? "border-dashed border-slate-300" : source.kind === "assumed" ? "border-amber-200 bg-amber-50/30" : "border-slate-200")}>
      <span className={cx("absolute inset-y-0 left-0 w-1", stripe)} />
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-100 text-slate-500"><Icon name={icon} className="h-3.5 w-3.5" /></span>{label}
        </span>
        <SourceTag source={missing ? { kind: "missing" } : source} />
      </div>
      <div className={cx("mt-3 text-xl font-semibold tracking-tight", missing ? "text-slate-400" : "text-slate-900")}>{value ?? "Not stated"}</div>
      {sub && !missing && <div className="mt-1 line-clamp-3 text-xs leading-relaxed text-slate-500" title={sub}>{sub}</div>}
    </div>
  );
}

const fromReport = (ev?: { quote?: string | null; page?: number | null } | null): Source => ({ kind: "report", page: ev?.page ?? null, quote: ev?.quote ?? null });

function SoilFacts({ report }: { report: GeotechReport }) {
  const e = report.estimate!;
  const facts = report.extraction.facts!;
  const bc = facts.bearingCapacity;
  const ev = facts.evidence;
  const sample = report.extraction.status === "Sample";
  const src = (s: Source): Source => (sample && s.kind === "report" ? { kind: "assumed", why: "Built-in sample profile" } : s);
  const depthSource: Source = e.inputs.depthSource === "user" ? { kind: "entered" } : e.inputs.depthSource === "report" ? fromReport(ev?.depth) : { kind: "assumed", why: "Not given and not stated in the report: default depth" };
  const firstLayerPage = facts.layers.find((l) => l.page)?.page ?? null;
  return (
    <Panel
      title="What the report says"
      icon="file"
      actions={sample ? <Badge tone="amber">Sample data</Badge> : <span className="flex items-center gap-2"><AiMark /><span className="hidden text-[11px] text-slate-400 sm:inline">hover a tag for the quote</span></span>}
    >
      <div className="mb-4 flex flex-wrap gap-1.5">
        <Badge tone={SOIL_TONE[e.soil.class]}>{e.soil.label}</Badge>
        <Badge tone={e.foundation.source === "report" ? "green" : "amber"}>{e.foundation.label}{e.foundation.source !== "report" ? ` (${e.foundation.source === "rule" ? "by rule" : "assumed"})` : ""}</Badge>
        <Badge tone={e.soil.dewatering ? "blue" : "slate"}>{e.soil.dewatering ? "Dewatering needed" : "No dewatering"}</Badge>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <FactTile
          icon="layers" label="Soil layers"
          value={facts.layers.length ? `${facts.layers.length} layer${facts.layers.length === 1 ? "" : "s"}` : null}
          sub={facts.boreholes ? `from ${facts.boreholes} borehole${facts.boreholes === 1 ? "" : "s"}` : null}
          source={src({ kind: "report", page: firstLayerPage })}
        />
        <FactTile
          icon="droplet" label="Water table"
          value={facts.groundwaterDepthM !== null ? `${facts.groundwaterDepthM} m below ground` : facts.groundwaterNote ? "Not encountered" : null}
          sub={facts.groundwaterNote && facts.groundwaterDepthM !== null ? facts.groundwaterNote : null}
          source={src(fromReport(ev?.groundwater))}
        />
        <FactTile
          icon="mountain" label="Hard rock / boulders"
          value={facts.rockOrBoulderPresent === null ? null : facts.rockOrBoulderPresent ? (facts.rockDepthM !== null ? `From ${facts.rockDepthM} m` : "Present") : "None reported"}
          source={src(fromReport(ev?.rock))}
        />
        <FactTile
          icon="gauge" label="Bearing capacity"
          value={bc ? `${bc.value} ${bc.unit.replace("2", "²")}` : null}
          sub={bc ? [bc.kNm2 !== null && bc.unit !== "kN/m2" ? `${bc.kNm2} kN/m²` : null, bc.depthM !== null ? `at ${bc.depthM} m` : null].filter(Boolean).join(" · ") : null}
          source={src(fromReport({ quote: bc?.sourceText, page: bc?.page }))}
        />
        <FactTile
          icon="foundation" label="Recommended foundation"
          value={facts.recommendedFoundation ? `${facts.recommendedFoundation[0].toUpperCase()}${facts.recommendedFoundation.slice(1)}${facts.recommendedFoundation === "isolated" ? " footings" : ""}` : null}
          sub={facts.recommendedDepthM !== null ? `at ${facts.recommendedDepthM} m` : null}
          source={src(fromReport(ev?.foundation))}
        />
        <FactTile icon="ruler" label="Excavation depth used" value={`${e.inputs.depthM} m`} source={depthSource} />
      </div>
      {facts.notes && <p className="mt-3 text-xs text-slate-500">{facts.notes}</p>}
      <details className="mt-3 text-xs text-slate-600">
        <summary className="cursor-pointer select-none font-medium text-slate-500 hover:text-slate-900">Why {e.soil.label.toLowerCase()} and {e.foundation.label.toLowerCase()}</summary>
        <ul className="mt-2 list-disc space-y-1 pl-4">{[...e.soil.reasons, e.foundation.reason].map((l, i) => <li key={i}>{l}</li>)}</ul>
      </details>
    </Panel>
  );
}

// One plain-English paragraph a site manager can read in ten seconds, built only from the
// facts and the calculated estimate (no model call), plus how much of it came from the report.
function siteSentence(report: GeotechReport) {
  const e = report.estimate!;
  const f = report.extraction.facts!;
  const parts: string[] = [];
  const ground = [
    f.groundwaterDepthM !== null ? `water at ${f.groundwaterDepthM} m` : f.groundwaterNote ? "no groundwater met" : null,
    f.rockOrBoulderPresent ? (f.rockDepthM !== null ? `hard rock from ${f.rockDepthM} m` : "hard rock present") : null,
  ].filter(Boolean);
  parts.push(`${e.soil.label} site${ground.length ? ` with ${ground.join(" and ")}` : ""}.`);
  const bc = f.bearingCapacity;
  parts.push(`${e.foundation.source === "report" ? "The report recommends" : "Estimated with"} ${e.foundation.label.toLowerCase()} at ${e.inputs.depthM} m${bc ? `, bearing capacity ${bc.value} ${bc.unit.replace("2", "²")}` : ""}.`);
  if (e.soil.dewatering) {
    const below = f.groundwaterDepthM !== null && f.groundwaterDepthM < e.inputs.depthM;
    parts.push(`The excavation ${below ? "goes below" : "reaches"} the water table, so a dewatering pump is needed.`);
  }
  parts.push(`${e.totals.partial ? "At least " : ""}${plinthDays(e, report.weather)} days to plinth${report.weather?.extraDays ? ` (including ${report.weather.extraDays} for rain)` : ""} with ${e.totals.peakJcbs} JCB${e.totals.peakJcbs === 1 ? "" : "s"} and up to ${e.totals.peakWorkers} workers.`);
  return parts.join(" ");
}

function SiteSummary({ report, onCreated }: { report: GeotechReport; onCreated: (r: GeotechReport, replaces?: string) => void }) {
  const f = report.extraction.facts!;
  const e = report.estimate!;
  const found = f.completeness.found;
  const of = f.completeness.of;
  const sample = report.extraction.status === "Sample";
  const tone = found >= 4 ? { bar: "bg-emerald-500", text: "text-emerald-700", label: "Good read" } : found >= 2 ? { bar: "bg-amber-400", text: "text-amber-700", label: "Partial read" } : { bar: "bg-red-500", text: "text-red-700", label: "Weak read" };
  const weak = !sample && found < 3 && report.verification.status === "Pending";
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const reread = async () => {
    setBusy(true);
    setErr(null);
    try {
      onCreated(await api<GeotechReport>(`/geotech/${report._id}/retry`, { method: "POST" }), report._id);
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const highlights: { icon: IconName; label: string; value: string; tone: string }[] = [
    { icon: "droplet", label: "Water table", value: f.groundwaterDepthM !== null ? `${f.groundwaterDepthM} m` : f.groundwaterNote ? "Not met" : "—", tone: e.soil.dewatering ? "text-sky-700 bg-sky-50 ring-sky-200" : "text-slate-700 bg-slate-50 ring-slate-200" },
    { icon: "mountain", label: "Hard rock", value: f.rockOrBoulderPresent ? (f.rockDepthM !== null ? `${f.rockDepthM} m` : "Yes") : f.rockOrBoulderPresent === false ? "None" : "—", tone: e.soil.class === "rock" ? "text-violet-700 bg-violet-50 ring-violet-200" : "text-slate-700 bg-slate-50 ring-slate-200" },
    { icon: "gauge", label: "Bearing capacity", value: f.bearingCapacity ? `${f.bearingCapacity.value} ${f.bearingCapacity.unit.replace("2", "²")}` : "—", tone: f.bearingCapacity ? "text-emerald-700 bg-emerald-50 ring-emerald-200" : "text-slate-700 bg-slate-50 ring-slate-200" },
    { icon: "foundation", label: "Foundation", value: `${e.foundation.label}`, tone: e.foundation.source === "report" ? "text-slate-800 bg-slate-50 ring-slate-200" : "text-amber-800 bg-amber-50 ring-amber-200" },
  ];
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-0 lg:grid-cols-[1fr_17rem]">
        <div className="p-5">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Site at a glance</div>
          <p className="text-[15px] leading-relaxed text-slate-800">{siteSentence(report)}</p>
          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
            {highlights.map((h) => (
              <div key={h.label} className={cx("rounded-xl px-3 py-2 ring-1 ring-inset", h.tone)}>
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide opacity-70"><Icon name={h.icon} className="h-3.5 w-3.5" />{h.label}</div>
                <div className="mt-0.5 truncate text-sm font-semibold">{h.value}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="border-t border-slate-100 bg-slate-50/60 p-5 lg:border-l lg:border-t-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Data from the report</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-semibold tabular-nums">{found}<span className="text-lg text-slate-400">/{of}</span></span>
            <span className={cx("text-sm font-medium", tone.text)}>{sample ? "Sample profile" : tone.label}</span>
          </div>
          <div className="mt-2 flex gap-1">
            {Array.from({ length: of }, (_, i) => <span key={i} className={cx("h-1.5 flex-1 rounded-full", i < found ? tone.bar : "bg-slate-200")} />)}
          </div>
          <ul className="mt-3 space-y-1 text-xs text-slate-600">
            <li>{f.layers.length} soil layer{f.layers.length === 1 ? "" : "s"} · {f.keyFindings?.length ?? 0} other finding{(f.keyFindings?.length ?? 0) === 1 ? "" : "s"}</li>
            {f.readQuality && <li>Read {f.readQuality.via === "text" ? "from the PDF text" : "from the file"}{f.readQuality.pages ? ` (${f.readQuality.pages} pages)` : ""}{f.readQuality.attempts > 1 ? ` · ${f.readQuality.attempts} attempts` : ""}</li>}
            {f.completeness.missing.length > 0 && <li className="text-amber-700">Not found: {f.completeness.missing.map((k) => ({ layers: "layers", groundwaterDepthM: "water table", rockOrBoulderPresent: "rock", bearingCapacity: "bearing capacity", recommendedFoundation: "foundation" })[k] ?? k).join(", ")}</li>}
          </ul>
          {weak && (
            <Button className="mt-3 w-full" onClick={reread} disabled={busy}>{busy ? <><Spinner /> Reading again…</> : <><Icon name="retry" /> Re-read report</>}</Button>
          )}
          {err && <div className="mt-2"><ErrorBox message={err} /></div>}
        </div>
      </div>
    </section>
  );
}

function KeyFindings({ report }: { report: GeotechReport }) {
  const items = report.extraction.facts?.keyFindings ?? [];
  if (!items.length) return null;
  return (
    <Panel title="Other findings from the report" icon="file" actions={<span className="flex items-center gap-2"><AiMark /><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{items.length}</span></span>}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((k, i) => {
          const short = k.value.length <= 48;
          return (
            <div key={i} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/70 p-4 pl-5 transition hover:shadow-md">
              <span className="absolute inset-y-0 left-0 w-1 bg-violet-300" />
              <div className="flex items-start justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{k.label}</span>
                <SourceTag source={{ kind: "report", page: k.page }} />
              </div>
              <div className={cx("mt-2.5", short ? "text-lg font-semibold tracking-tight text-slate-900" : "text-[13px] leading-relaxed text-slate-700")} title={k.value}>{k.value}</div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function NotRead({ report, onCreated }: { report: GeotechReport; onCreated: (r: GeotechReport, replaces?: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const retry = async () => {
    setBusy(true);
    setErr(null);
    try {
      onCreated(await api<GeotechReport>(`/geotech/${report._id}/retry`, { method: "POST" }), report._id);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start gap-4">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-red-50 text-red-600"><Icon name="x" className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-slate-900">Report not read: {report.file?.originalName}</h2>
          <p className="mt-1 text-sm text-slate-700">{report.extraction.reason}</p>
          <p className="mt-1 text-xs text-slate-500">No soil data was invented and no estimate was made.{report.inputs.plinthAreaSqm != null && ` ${report.inputs.plinthAreaSqm} m² plinth area is kept for the retry.`}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={retry} disabled={busy}>{busy ? <><Spinner /> Reading again…</> : <><Icon name="retry" /> Try again</>}</Button>
            {report.file && (
              <a href={`${API_URL}${report.file.url}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"><Icon name="external" /> Open file</a>
            )}
          </div>
          {err && <div className="mt-3"><ErrorBox message={err} /></div>}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Weather: rain buffer on the schedule
// ---------------------------------------------------------------------------

const DAY_KIND: Record<WeatherKind, { cell: string; label: string }> = {
  work: { cell: "bg-emerald-400", label: "Working day" },
  light: { cell: "bg-sky-300", label: "Wet day, slower" },
  rain: { cell: "bg-sky-600", label: "Rain, work stopped" },
  recovery: { cell: "bg-amber-400", label: "Dry-out after rain" },
  buffer: { cell: "bg-slate-300", label: "Buffer for expected rain" },
};

const rainIcon = (mm: number): IconName => (mm >= 10 ? "rain" : mm >= 2.5 ? "cloud" : "sun");

function WeatherPanel({ report, onUpdated }: { report: GeotechReport; onUpdated: (r: GeotechReport) => void }) {
  const w = report.weather;
  const up = report.weatherUpload;
  const [busy, setBusy] = useState<"upload" | "refresh" | "remove" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const call = async (kind: "upload" | "refresh" | "remove", fn: () => Promise<GeotechReport>) => {
    setBusy(kind);
    setErr(null);
    setMsg(null);
    try {
      const res = await fn();
      if (res.plan?.replanned) setMsg(`Site plan updated: ${res.plan.days} days.`);
      else if (res.plan?.kept) setMsg("The site plan already has work recorded, so it was not changed. The new buffer is shown here.");
      onUpdated(res);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const upload = (file: File) => {
    if (file.size > 12 * 1024 * 1024) return setErr("The file is larger than 12 MB.");
    const body = new FormData();
    body.append("file", file);
    call("upload", () => api<GeotechReport>(`/geotech/${report._id}/weather`, { method: "POST", body }));
  };
  const refresh = () => call("refresh", () => api<GeotechReport>(`/geotech/${report._id}/weather/refresh`, { method: "POST" }));
  const remove = () => call("remove", () => api<GeotechReport>(`/geotech/${report._id}/weather`, { method: "DELETE" }));

  const known = w?.known.filter((d) => d.date >= (w.start as string).slice(0, 10)).slice(0, 16) ?? [];
  const accepted = report.verification.status === "Accepted";

  return (
    <Panel
      title="Weather & rain buffer"
      icon="rain"
      actions={<span className="flex items-center gap-2"><CalculatedMark title="Rain days from the forecast or your weather report; the days lost are calculated by the rules" />
        <Button variant="secondary" className="py-1 text-xs" disabled={!!busy} onClick={refresh}>{busy === "refresh" ? <><Spinner /> Updating…</> : <><Icon name="retry" /> Refresh forecast</>}</Button></span>}
    >
      {w ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
            <div>
              <div className="text-3xl font-semibold tabular-nums">{w.extraDays > 0 ? `+${w.extraDays}` : "0"} <span className="text-base font-medium text-slate-500">days for rain</span></div>
              <div className="text-xs text-slate-500">{w.totalDays} days to plinth · {fmtDate(w.start)} → {fmtDate(w.end)}{accepted ? "" : " if started today; worked out again for the start date you accept with"}</div>
            </div>
            <div className="text-xs text-slate-500">
              <div>{w.location.name}{w.location.source === "rules" ? " (default site)" : ""}</div>
              <div>{up?.status === "Read" ? `Uploaded report for ${up.days?.length ?? 0} days, then ` : ""}{w.forecast.error ? <span className="text-amber-700">{w.forecast.error}</span> : `forecast to ${fmtDate(w.forecast.to)}`}, then monthly averages</div>
            </div>
          </div>

          {known.length > 0 && (
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Rain in the coming days</div>
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8 lg:grid-cols-[repeat(16,minmax(0,1fr))]">
                {known.map((d) => (
                  <div key={d.date} title={`${fmtDate(d.date)}: ${d.rainMm} mm${d.probability != null ? `, ${d.probability}% chance` : ""} (${d.source === "upload" ? "your weather report" : "forecast"})`}
                    className={cx("rounded-lg px-1 py-1.5 text-center ring-1 ring-inset", d.rainMm >= 10 ? "bg-sky-100 ring-sky-300" : d.rainMm >= 2.5 ? "bg-sky-50 ring-sky-200" : "bg-slate-50 ring-slate-200")}>
                    <div className="text-[10px] text-slate-500">{fmtWeekday(d.date)}</div>
                    <div className={cx("my-0.5 flex justify-center", d.rainMm >= 2.5 ? "text-sky-700" : "text-amber-500")}><Icon name={rainIcon(d.rainMm)} /></div>
                    <div className="text-[11px] font-medium tabular-nums">{d.rainMm} mm</div>
                    {d.source === "upload" && <div className="text-[9px] font-semibold uppercase text-violet-600">report</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Day by day</div>
            <div className="flex flex-wrap gap-0.5">
              {w.schedule.map((x, i) => (
                <span key={i} title={`Day ${i + 1} · ${fmtDate(x.date)} · ${x.phaseName}: ${x.note ?? DAY_KIND[x.kind].label}`} className={cx("h-4 w-2.5 rounded-sm", DAY_KIND[x.kind].cell)} />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
              {(Object.keys(DAY_KIND) as WeatherKind[]).map((k) => <span key={k} className="flex items-center gap-1.5"><span className={cx("h-2.5 w-2.5 rounded-sm", DAY_KIND[k].cell)} />{DAY_KIND[k].label}</span>)}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {w.phases.map((p) => (
              <div key={p.key} className={cx("rounded-xl px-3 py-2 ring-1 ring-inset", p.extraDays > 0 ? "bg-sky-50/60 ring-sky-200" : "bg-slate-50 ring-slate-200")}>
                <div className="text-xs font-medium text-slate-600">{p.name}</div>
                <div className="text-lg font-semibold tabular-nums">{p.days} days{p.extraDays > 0 && <span className="ml-1 text-xs font-medium text-sky-700">+{p.extraDays}</span>}</div>
                <div className="text-[11px] text-slate-500">
                  {[p.rainDays && `${p.rainDays} rain`, p.lightDays && `${p.lightDays} wet`, p.recoveryDays && `${p.recoveryDays} dry-out`, p.bufferDays && `${p.bufferDays} buffer`].filter(Boolean).join(" · ") || "no rain loss"}
                </div>
              </div>
            ))}
          </div>

          {w.warnings.length > 0 && <Warnings warnings={w.warnings} />}

          <details className="text-xs text-slate-600">
            <summary className="cursor-pointer select-none font-medium text-slate-500 hover:text-slate-900">How the rain buffer is worked out</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">{w.basis.map((b, i) => <li key={i}>{b}</li>)}</ul>
          </details>
        </div>
      ) : (
        <p className="text-sm text-slate-500">No rain buffer yet. Use Refresh forecast to work it out.</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-3">
        <Icon name="upload" />
        <div className="min-w-0 flex-1 text-sm">
          {up?.file ? (
            <>
              <span className="font-medium">{up.file.originalName}</span>
              <span className={cx("ml-2 text-xs", up.status === "Read" ? "text-emerald-700" : "text-red-700")}>
                {up.status === "Read" ? `read: rain for ${up.days?.length ?? 0} days${up.location ? ` · ${up.location}` : ""}` : up.reason}
              </span>
            </>
          ) : (
            <span className="text-slate-600">Have a weather report for the site (IMD, client or consultant)? Upload it. Its rain figures replace the forecast on the days it covers.</span>
          )}
        </div>
        <label className={cx("inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50", busy && "pointer-events-none opacity-50")}>
          {busy === "upload" ? <><Spinner /> Reading…</> : <><Icon name="upload" /> {up?.file ? "Replace" : "Upload weather report"}</>}
          <input type="file" accept="application/pdf,image/*" className="hidden" disabled={!!busy} onChange={(ev) => { const f = ev.target.files?.[0]; ev.target.value = ""; if (f) upload(f); }} />
        </label>
        {up?.file && (
          <>
            <a href={`${API_URL}${up.file.url}`} target="_blank" rel="noreferrer" className="text-sm text-slate-600 underline">Open</a>
            <Button variant="ghost" className="py-1 text-sm" disabled={!!busy} onClick={remove}>{busy === "remove" ? <Spinner /> : "Remove"}</Button>
          </>
        )}
      </div>
      {msg && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</p>}
      {err && <div className="mt-3"><ErrorBox message={err} /></div>}
    </Panel>
  );
}

const STATUS_STYLE: Record<string, { box: string; icon: IconName; title: string }> = {
  Pending: { box: "border-amber-200 bg-amber-50", icon: "info", title: "Awaiting approval" },
  Accepted: { box: "border-emerald-200 bg-emerald-50", icon: "check", title: "Accepted" },
  Rejected: { box: "border-slate-200 bg-slate-100", icon: "x", title: "Rejected" },
  Overridden: { box: "border-sky-200 bg-sky-50", icon: "info", title: "Overridden" },
};

function Verification({ report, onUpdated }: { report: GeotechReport; onUpdated: (r: GeotechReport) => void }) {
  const { user } = useAuth();
  const [note, setNote] = useState("");
  const [startDate, setStartDate] = useState(todayInput());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [published, setPublished] = useState<NonNullable<GeotechReport["plan"]> | null>(null);
  const v = report.verification;
  const s = STATUS_STYLE[v.status];
  const days = report.weather?.totalDays ?? report.estimate?.phases.filter((p) => !p.insufficientData).reduce((n, p) => n + p.days, 0) ?? 0;

  const decide = async (status: "Accepted" | "Rejected") => {
    setBusy(true);
    setErr(null);
    try {
      const res = await api<GeotechReport>(`/geotech/${report._id}/verify`, { method: "PATCH", json: { status, note, ...(status === "Accepted" ? { startDate } : {}) } });
      if (status === "Accepted") setPublished(res.plan ?? null);
      onUpdated(res);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cx("rounded-2xl border px-5 py-4 shadow-sm", s.box)}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-2 text-[15px] font-semibold text-slate-900">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-white/80 ring-1 ring-black/5"><Icon name={s.icon} /></span>
          {v.status === "Pending" ? "Your decision: approve this estimate?" : s.title}
        </span>
        <span className="text-xs text-slate-600">
          {v.status === "Pending" ? "This estimate is a proposal until a manager or engineer approves it." : `by ${v.by?.name ?? "—"} · ${fmtDateTime(v.at)}${v.note ? ` — “${v.note}”` : ""}`}
        </span>
        {v.status === "Accepted" && user && canAccess(user.role, "/plinth-plan") && (
          <Link href="/plinth-plan" className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100">
            <Icon name="clipboard" /> Open the site plan
          </Link>
        )}
      </div>
      {v.status === "Pending" && (
        <form className="mt-3 grid gap-3 border-t border-amber-200/70 pt-3 md:grid-cols-[auto_1fr_auto] md:items-end" onSubmit={(ev) => { ev.preventDefault(); decide("Accepted"); }}>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600">Site plan starts on</span>
            <input type="date" required value={startDate} onChange={(ev) => setStartDate(ev.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm md:w-44" />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600">Note for the audit trail (optional)</span>
            <input className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm" placeholder="e.g. Checked against the structural drawing" value={note} onChange={(ev) => setNote(ev.target.value)} />
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>{busy ? <Spinner /> : <Icon name="check" />} Accept &amp; send to site</Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => decide("Rejected")}>Reject</Button>
          </div>
          {days > 0 && <p className="text-xs text-slate-600 md:col-span-3">Accepting sends a {report.weather ? "" : `${days}-day `}checklist to the site engineers, with the crew and machines for each day{report.weather ? ", and rain days worked out again for the start date you pick" : ""}. They tick items off and record real progress.</p>}
        </form>
      )}
      {published && (published.created ?? 0) > 0 && (
        <p className="mt-2 flex items-center gap-2 rounded-lg bg-white/70 px-3 py-2 text-sm text-emerald-800"><Icon name="check" className="h-4 w-4" /> {published.created}-day plan sent to site engineers.</p>
      )}
      {err && <div className="mt-2"><ErrorBox message={err} /></div>}
    </div>
  );
}

function LearningPanel({ report, learning, onUpdated }: { report: GeotechReport; learning: GeotechList["learning"]; onUpdated: (r: GeotechReport) => void }) {
  const e = report.estimate!;
  const [form, setForm] = useState({ excavationDays: "", jcbCount: "", totalDays: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const canRecord = report.source === "upload" && report.verification.status !== "Rejected";
  const maxRate = Math.max(...Object.values(learning.rates).map((r) => Math.max(r.default, r.used)));

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      onUpdated(await api<GeotechReport>(`/geotech/${report._id}/actuals`, {
        method: "PATCH",
        json: { excavationDays: Number(form.excavationDays), jcbCount: Number(form.jcbCount), totalDays: form.totalDays ? Number(form.totalDays) : null, note: form.note },
      }));
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="How the agent learns" icon="brain" actions={<span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">{learning.observations} recorded job{learning.observations === 1 ? "" : "s"}</span>}>
      <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <p className="mb-5 text-sm leading-relaxed text-slate-600">
            JCB output per day for each soil type. Every finished job moves the rate toward what the site actually achieved; the
            default counts as {learning.priorWeight} jobs, so one unusual job cannot swing it.
          </p>
          <div className="space-y-4">
            {(Object.keys(learning.rates) as SoilClass[]).map((cls) => {
              const r = learning.rates[cls];
              const here = cls === e.soil.class;
              const color = SOIL_COLOR[cls];
              return (
                <div key={cls} className={cx("rounded-2xl border p-3.5 transition", here ? "border-amber-300 bg-amber-50/50 shadow-sm" : "border-slate-200 bg-white")}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-semibold capitalize text-slate-900">
                      <span className="h-3 w-3 rounded-full ring-2 ring-white" style={{ background: color, boxShadow: `0 0 0 1px ${color}` }} />{cls}
                      {here && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">this site</span>}
                    </span>
                    <span className="flex items-baseline gap-1.5 tabular-nums">
                      <span className="text-xl font-bold text-slate-900">{r.used}</span>
                      <span className="text-xs text-slate-500">m³/day</span>
                      <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">{r.observations} job{r.observations === 1 ? "" : "s"}</span>
                    </span>
                  </div>
                  <div className="relative h-3 rounded-full bg-slate-100" title={`Default ${r.default} m³/day, learned ${r.used} m³/day`}>
                    <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(r.used / maxRate) * 100}%`, background: `linear-gradient(90deg, ${color}99, ${color})` }} />
                    <div className="absolute -inset-y-1 w-1 rounded bg-slate-900" style={{ left: `calc(${(r.default / maxRate) * 100}% - 2px)` }} />
                  </div>
                  {r.used !== r.default && <div className="mt-1.5 text-[11px] text-slate-400">default {r.default} m³/day</div>}
                </div>
              );
            })}
          </div>
          <p className="mt-3 flex items-center gap-2 text-[11px] text-slate-400"><span className="h-3 w-1 rounded bg-slate-900" /> default rate · site factor × {learning.siteFactor} · schedule factor × {learning.scheduleFactor}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5 shadow-sm">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-900 text-amber-300"><Icon name="check" className="h-4 w-4" /></span>
            <div className="font-semibold text-slate-900">Record what actually happened</div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-white px-2.5 py-1 font-medium text-slate-600 ring-1 ring-slate-200">Estimated · {e.excavation.days} days</span>
            <span className="rounded-full bg-white px-2.5 py-1 font-medium text-slate-600 ring-1 ring-slate-200">{e.excavation.jcbs} JCB{e.excavation.jcbs === 1 ? "" : "s"}</span>
            <span className="rounded-full bg-white px-2.5 py-1 font-medium text-slate-600 ring-1 ring-slate-200">{e.totals.calendarDays} days to plinth</span>
          </div>
          <p className="mt-2 text-xs text-slate-500">After excavation, enter the real figures so the next estimate is closer.</p>
          {report.actual?.excavationDays ? (
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-emerald-200">
              <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0" />
              Recorded: {report.actual.excavationDays} excavation days with {report.actual.jcbCount} JCB(s){report.actual.totalDays ? `, ${report.actual.totalDays} days to plinth` : ""}.
            </p>
          ) : null}
          {canRecord ? (
            <form className="mt-4 space-y-3" onSubmit={save}>
              <div className="grid grid-cols-3 gap-2">
                <label className="space-y-1"><span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Excavation</span><UnitInput unit="days" type="number" min="1" step="0.5" required value={form.excavationDays} onChange={(x) => setForm({ ...form, excavationDays: x.target.value })} /></label>
                <label className="space-y-1"><span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">JCBs used</span><Input type="number" min="1" step="1" required value={form.jcbCount} onChange={(x) => setForm({ ...form, jcbCount: x.target.value })} /></label>
                <label className="space-y-1"><span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">To plinth</span><UnitInput unit="days" type="number" min="1" step="1" value={form.totalDays} onChange={(x) => setForm({ ...form, totalDays: x.target.value })} placeholder="opt." /></label>
              </div>
              <div className="flex gap-2">
                <Input placeholder="Note (optional)" value={form.note} onChange={(x) => setForm({ ...form, note: x.target.value })} />
                <Button type="submit" disabled={busy}>{busy ? <Spinner /> : null}{report.actual?.excavationDays ? "Update" : "Save"}</Button>
              </div>
              <ErrorBox message={err} />
            </form>
          ) : (
            <p className="mt-3 text-xs text-slate-500">
              {report.source === "sample" ? "Actuals are recorded against real uploaded reports, not the sample." : "Rejected estimates are not used for learning."}
            </p>
          )}
        </div>
      </div>
    </Panel>
  );
}
