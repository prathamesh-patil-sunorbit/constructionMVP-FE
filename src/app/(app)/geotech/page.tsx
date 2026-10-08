"use client";

import Link from "next/link";
import { useState } from "react";
import { API_URL, api, useApi } from "@/lib/api";
import type { GeotechEstimate, GeotechList, GeotechReport, Project, SoilClass } from "@/lib/types";
import { Badge, Button, ErrorBox, Input, Loading, Select } from "@/components/ui";
import { AiMark, CalculatedMark } from "@/components/ai";
import { DailyWorkPlan, Dropzone, EquipmentCards, Icon, PhaseCards, PhaseTimeline, SoilProfile, Spinner, type IconName } from "@/components/geotech";
import { fmtDateTime, todayInput } from "@/lib/format";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
const SOIL_TONE: Record<SoilClass, string> = { soft: "amber", ordinary: "green", hard: "blue", rock: "purple" };

function Panel({ title, icon, actions, children, className }: { title?: React.ReactNode; icon?: IconName; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-2xl border border-slate-200 bg-white shadow-sm", className)}>
      {title && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            {icon && <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-100 text-slate-600"><Icon name={icon} /></span>}
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
  const selected = data?.reports.find((r) => r._id === selectedId) || data?.reports[0] || null;

  const onCreated = (report: GeotechReport, replaces?: string) => {
    setData((d) => (d ? { ...d, reports: [report, ...d.reports.filter((r) => r._id !== report._id && r._id !== replaces)] } : d));
    setSelectedId(report._id);
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
        jobs={data?.learning.observations ?? 0}
        projectPicker={projects.length > 1 ? (
          <Select value={project} onChange={(e) => { setProjectId(e.target.value); setSelectedId(null); }} className="max-w-56 border-white/20 bg-white/10 text-white">
            {projects.map((p) => <option key={p._id} value={p._id} className="text-slate-900">{p.name}</option>)}
          </Select>
        ) : <span className="text-sm text-slate-300">{projects[0]?.name}</span>}
      />
      <ErrorBox message={error} />

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <EstimateForm projectId={project} configured={data?.ai.configured} onCreated={onCreated} />
        <History reports={data?.reports || []} selectedId={selected?._id} onSelect={setSelectedId} />
      </div>

      {loading && !data ? <Loading /> : selected ? (
        <ReportView key={selected._id} report={selected} learning={data!.learning} onUpdated={onUpdated} onCreated={onCreated} />
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-slate-100 text-slate-500"><Icon name="layers" className="h-6 w-6" /></span>
          <p className="font-medium text-slate-800">No geotechnical report yet</p>
          <p className="mt-1 text-sm text-slate-500">Upload one above, or load the sample soil profile to see how the estimate works.</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function AgentHeader({ configured, quotaUntil, jobs, projectPicker }: { configured?: boolean; quotaUntil?: string; jobs: number; projectPicker: React.ReactNode }) {
  const steps: { icon: IconName; title: string; text: string }[] = [
    { icon: "sparkles", title: "AI reads the report", text: "Soil layers, water table, rock, SBC" },
    { icon: "calc", title: "Rules calculate", text: "JCBs, days and crew per phase" },
    { icon: "brain", title: "Learns from site", text: `${jobs} recorded job${jobs === 1 ? "" : "s"} so far` },
    { icon: "check", title: "You approve", text: "Accept or reject, fully audited" },
  ];
  return (
    <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 text-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 px-6 pt-6">
        <div>
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-300 ring-1 ring-inset ring-amber-400/30">
            <Icon name="sparkles" className="h-3.5 w-3.5" /> Geotech Agent
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Plinth Estimate</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-300">Upload a soil investigation report. The agent works out the excavation, footings and backfill up to plinth level, with the machines, crew and days each phase needs.</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {projectPicker}
          {(() => {
            const ok = configured && !quotaUntil;
            return (
              <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset", ok ? "bg-emerald-400/10 text-emerald-300 ring-emerald-400/30" : "bg-amber-400/10 text-amber-300 ring-amber-400/30")}>
                <span className={cx("h-1.5 w-1.5 rounded-full", ok ? "bg-emerald-400" : "bg-amber-400")} />
                {configured === undefined ? "Checking AI…" : quotaUntil ? `AI quota used up · resets ${fmtDateTime(quotaUntil)}` : configured ? "AI connected" : "AI offline: sample profile only"}
              </span>
            );
          })()}
        </div>
      </div>
      <ol className="mt-6 grid gap-px border-t border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.title} className="flex items-center gap-3 bg-slate-900/60 px-6 py-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10 text-amber-300"><Icon name={s.icon} className="h-[18px] w-[18px]" /></span>
            <div className="min-w-0">
              <div className="text-sm font-medium"><span className="mr-1 text-slate-400">{i + 1}.</span>{s.title}</div>
              <div className="truncate text-xs text-slate-400">{s.text}</div>
            </div>
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
  const [busy, setBusy] = useState<"upload" | "sample" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async (mode: "upload" | "sample") => {
    setErr(null);
    if (!(Number(area) > 0)) return setErr("Enter the plinth area in m².");
    if (mode === "upload" && !file) return setErr("Choose the geotechnical report (PDF or photo).");
    if (file && file.size > 12 * 1024 * 1024 && mode === "upload") return setErr("The file is larger than 12 MB.");
    setBusy(mode);
    try {
      let report: GeotechReport;
      if (mode === "upload") {
        const body = new FormData();
        body.append("file", file!);
        body.append("project", projectId);
        body.append("plinthAreaSqm", area);
        if (depth) body.append("depthM", depth);
        report = await api<GeotechReport>("/geotech", { method: "POST", body });
      } else {
        report = await api<GeotechReport>("/geotech/sample", {
          method: "POST", json: { project: projectId, plinthAreaSqm: Number(area), depthM: depth ? Number(depth) : null },
        });
      }
      onCreated(report);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel title="New estimate" icon="upload">
      <form className="grid gap-5 md:grid-cols-[1.2fr_1fr]" onSubmit={(e) => { e.preventDefault(); run("upload"); }}>
        <Dropzone file={file} onFile={setFile} disabled={!!busy} />
        <div className="flex flex-col gap-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600">Plinth area</span>
            <UnitInput unit="m²" type="number" min="1" step="any" value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. 400" required />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600">Excavation depth <span className="font-normal text-slate-400">(optional)</span></span>
            <UnitInput unit="m" type="number" min="0.3" max="15" step="0.1" value={depth} onChange={(e) => setDepth(e.target.value)} placeholder="from report, else 1.5" />
          </label>
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

function History({ reports, selectedId, onSelect }: { reports: GeotechReport[]; selectedId?: string; onSelect: (id: string) => void }) {
  return (
    <Panel title="Reports" icon="file" actions={<span className="text-xs text-slate-400">{reports.length}</span>} className="flex flex-col">
      {reports.length ? (
        <ul className="-mx-2 max-h-64 space-y-1 overflow-y-auto">
          {reports.map((r) => {
            const s = STATE(r);
            const active = r._id === selectedId;
            return (
              <li key={r._id}>
                <button onClick={() => onSelect(r._id)} className={cx("flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition", active ? "bg-slate-900 text-white" : "hover:bg-slate-50")}>
                  <span className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-lg", active ? "bg-white/10" : r.source === "sample" ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600")}>
                    <Icon name={r.source === "sample" ? "layers" : "file"} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{r.source === "sample" ? "Sample soil profile" : r.file?.originalName}</span>
                    <span className={cx("flex items-center gap-1.5 text-[11px]", active ? "text-slate-300" : "text-slate-500")}>
                      <span className={cx("h-1.5 w-1.5 rounded-full", s.dot)} />{s.label} · {r.inputs.plinthAreaSqm} m² · {fmtDateTime(r.createdAt)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : <p className="text-sm text-slate-500">No reports yet.</p>}
    </Panel>
  );
}

// ---------------------------------------------------------------------------

function ReportView({ report, learning, onUpdated, onCreated }: {
  report: GeotechReport; learning: GeotechList["learning"]; onUpdated: (r: GeotechReport) => void; onCreated: (r: GeotechReport, replaces?: string) => void;
}) {
  const { extraction, estimate: e, narration } = report;
  const facts = extraction.facts;

  if (!e || !facts) return <NotRead report={report} onCreated={onCreated} />;

  return (
    <div className="space-y-5">
      <ReportTitle report={report} />
      <SiteSummary report={report} onCreated={onCreated} />
      <Kpis estimate={e} />
      <Verification report={report} onUpdated={onUpdated} />
      {e.warnings.length > 0 && <Warnings warnings={e.warnings} />}

      <div className="grid gap-5 xl:grid-cols-[1.1fr_1fr]">
        <Panel title="Soil layer view" icon="layers" actions={<span className="text-[11px] text-slate-400">hover a layer for the report text</span>}>
          <SoilProfile facts={facts} depthM={e.inputs.depthM} foundation={e.foundation.type} />
        </Panel>
        <SoilFacts report={report} />
      </div>

      <KeyFindings report={report} />

      <Panel title="AI explanation" icon="sparkles" actions={narration?.aiGenerated ? <AiMark /> : undefined} className={narration ? "border-violet-200" : undefined}>
        {narration ? (
          <div className="space-y-4 text-sm text-slate-700">
            <p className="text-[15px] leading-relaxed text-slate-800">{narration.summary}</p>
            {!!narration.recommendations?.length && (
              <ol className="grid gap-2 md:grid-cols-2">
                {narration.recommendations.map((r, i) => (
                  <li key={i} className="flex gap-3 rounded-xl bg-violet-50/60 p-3">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-violet-100 text-xs font-semibold text-violet-700">{i + 1}</span>
                    <span><span className="font-medium text-slate-900">{r.action}</span><span className="block text-xs text-slate-500">{r.rationale}</span></span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No AI explanation for this run (AI unavailable). Every figure on this page is calculated by the rules and is complete without it.</p>
        )}
      </Panel>

      <Panel title="Phase timeline" icon="calendar" actions={<CalculatedMark title="Five sequential phases; calendar days are the sum" />}>
        <PhaseTimeline estimate={e} />
      </Panel>

      <Panel
        title="Daily work plan"
        icon="users"
        actions={<CalculatedMark title="Each phase's total split evenly across its days — a sequencing guide, not a measured record" />}
      >
        <p className="mb-3 text-xs text-slate-500">
          Day by day: what the crew does, how many workers of each trade, and which machines are needed. Quantities are each
          phase&apos;s total spread evenly across its days — actual daily output on site will vary.
        </p>
        <DailyWorkPlan phases={e.phases} />
      </Panel>

      <Panel title="Phase breakdown" icon="digger" actions={<span className="flex items-center gap-2"><Badge tone="slate">Confidence {e.confidence}%</Badge><CalculatedMark /></span>}>
        <PhaseCards phases={e.phases} />
        {(e.assumptions.length > 0 || e.confidenceBasis.length > 0) && (
          <div className="mt-4 grid gap-3 text-xs text-slate-600 md:grid-cols-2">
            {e.assumptions.length > 0 && <Note title="Assumptions" lines={e.assumptions} />}
            <Note title={`Why ${e.confidence}% confidence`} lines={e.confidenceBasis} />
          </div>
        )}
      </Panel>

      <LearningPanel report={report} learning={learning} onUpdated={onUpdated} />
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

function ReportTitle({ report }: { report: GeotechReport }) {
  const facts = report.extraction.facts;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 className="truncate text-lg font-semibold text-slate-900">{facts?.reportTitle || report.file?.originalName || "Soil report"}</h2>
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

function Kpis({ estimate: e }: { estimate: GeotechEstimate }) {
  const t = e.totals;
  const busiest = e.phases.find((p) => p.workerTotal === t.peakWorkers)?.name;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi accent icon="calendar" label={t.partial ? "Days to plinth (at least)" : "Days to plinth"} value={t.calendarDays} sub={`${e.phases.filter((p) => !p.insufficientData).length} phases in sequence`} />
        <Kpi icon="digger" photo="/equipment/jcb.jpg" label="JCBs" value={t.peakJcbs} sub={`${e.excavation.days} days of excavation`} />
        <Kpi icon="users" label="Peak workers" value={t.peakWorkers} sub={busiest ? `during ${busiest.toLowerCase()}` : undefined} />
        <Kpi icon="truck" photo="/equipment/tipper.jpg" label="Tippers" value={t.tippers} sub={`${e.excavation.looseVolumeM3} m³ to haul`} />
      </div>
      <EquipmentCards estimate={e} />
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
  const text = source.kind === "report" ? `Report${source.page ? ` · p.${source.page}` : ""}` : source.kind === "entered" ? "Entered" : source.kind === "assumed" ? "Assumed" : "Not in report";
  const title = source.kind === "report" && source.quote ? `“${source.quote}”` : source.kind === "assumed" ? source.why : undefined;
  return <span title={title} className={cx("inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset", style, title && "cursor-help")}>{text}</span>;
}

function FactTile({ icon, label, value, source, sub }: { icon: IconName; label: string; value: string | number | null | undefined; source: Source; sub?: string | null }) {
  const missing = value === null || value === undefined;
  return (
    <div className={cx("rounded-xl border p-3", missing ? "border-dashed border-slate-300 bg-white" : source.kind === "assumed" ? "border-amber-200 bg-amber-50/40" : "border-slate-200 bg-slate-50/50")}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400"><Icon name={icon} className="h-3.5 w-3.5" />{label}</div>
        <SourceTag source={missing ? { kind: "missing" } : source} />
      </div>
      <div className={cx("mt-1.5 text-[15px] font-semibold", missing ? "text-slate-400" : "text-slate-900")}>{value ?? "Not stated"}</div>
      {sub && !missing && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
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
  parts.push(`${e.totals.partial ? "At least " : ""}${e.totals.calendarDays} working days to plinth with ${e.totals.peakJcbs} JCB${e.totals.peakJcbs === 1 ? "" : "s"} and up to ${e.totals.peakWorkers} workers.`);
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
    <Panel title="Other findings from the report" icon="file" actions={<span className="flex items-center gap-2"><AiMark /><span className="text-xs text-slate-400">{items.length}</span></span>}>
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((k, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{k.label}</span>
              <SourceTag source={{ kind: "report", page: k.page }} />
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-900">{k.value}</div>
          </div>
        ))}
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
          <p className="mt-1 text-xs text-slate-500">No soil data was invented and no estimate was made. {report.inputs.plinthAreaSqm} m² plinth area is kept for the retry.</p>
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

const STATUS_STYLE: Record<string, { box: string; icon: IconName; title: string }> = {
  Pending: { box: "border-amber-200 bg-amber-50", icon: "info", title: "Awaiting approval" },
  Accepted: { box: "border-emerald-200 bg-emerald-50", icon: "check", title: "Accepted" },
  Rejected: { box: "border-slate-200 bg-slate-100", icon: "x", title: "Rejected" },
  Overridden: { box: "border-sky-200 bg-sky-50", icon: "info", title: "Overridden" },
};

function Verification({ report, onUpdated }: { report: GeotechReport; onUpdated: (r: GeotechReport) => void }) {
  const [note, setNote] = useState("");
  const [startDate, setStartDate] = useState(todayInput());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [published, setPublished] = useState<NonNullable<GeotechReport["plan"]> | null>(null);
  const v = report.verification;
  const s = STATUS_STYLE[v.status];
  const days = report.estimate?.phases.filter((p) => !p.insufficientData).reduce((n, p) => n + p.days, 0) ?? 0;

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
    <div className={cx("rounded-2xl border px-4 py-3", s.box)}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Icon name={s.icon} /> {s.title}</span>
        <span className="text-xs text-slate-600">
          {v.status === "Pending" ? "This estimate is a proposal until a manager or engineer approves it." : `by ${v.by?.name ?? "—"} · ${fmtDateTime(v.at)}${v.note ? ` — “${v.note}”` : ""}`}
        </span>
        {v.status === "Accepted" && (
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
          {days > 0 && <p className="text-xs text-slate-600 md:col-span-3">Accepting sends a {days}-day checklist to the site engineers, with the crew and machines for each day. They tick items off and record real progress.</p>}
        </form>
      )}
      {published && published.created > 0 && (
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
    <Panel title="How the agent learns" icon="brain" actions={<Badge tone="slate">{learning.observations} recorded job{learning.observations === 1 ? "" : "s"}</Badge>}>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <p className="mb-4 text-sm text-slate-600">
            JCB output per day for each soil type. Every finished job moves the rate toward what the site actually achieved; the
            default counts as {learning.priorWeight} jobs, so one unusual job cannot swing it.
          </p>
          <div className="space-y-3">
            {(Object.keys(learning.rates) as SoilClass[]).map((cls) => {
              const r = learning.rates[cls];
              const here = cls === e.soil.class;
              return (
                <div key={cls}>
                  <div className="mb-1 flex items-baseline justify-between text-sm">
                    <span className={cx("capitalize", here ? "font-semibold text-slate-900" : "text-slate-700")}>
                      {cls}{here && <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800">this site</span>}
                    </span>
                    <span className="tabular-nums text-slate-600"><span className="font-semibold text-slate-900">{r.used}</span> m³/day{r.used !== r.default && <span className="text-slate-400"> · default {r.default}</span>} · {r.observations} job{r.observations === 1 ? "" : "s"}</span>
                  </div>
                  <div className="relative h-2 rounded-full bg-slate-100" title={`Default ${r.default} m³/day, learned ${r.used} m³/day`}>
                    <div className={cx("absolute inset-y-0 left-0 rounded-full", here ? "bg-slate-800" : "bg-slate-400")} style={{ width: `${(r.used / maxRate) * 100}%` }} />
                    <div className="absolute -inset-y-0.5 w-0.5 rounded bg-amber-500" style={{ left: `${(r.default / maxRate) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400"><span className="h-2.5 w-0.5 rounded bg-amber-500" /> default rate · site factor × {learning.siteFactor} · schedule factor × {learning.scheduleFactor}</p>
        </div>

        <div className="rounded-xl bg-slate-50 p-4">
          <div className="font-medium text-slate-900">Record what actually happened</div>
          <p className="mt-0.5 text-xs text-slate-500">After excavation, enter the real figures. Estimated: {e.excavation.days} days with {e.excavation.jcbs} JCB(s), {e.totals.calendarDays} days to plinth.</p>
          {report.actual?.excavationDays ? (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0" />
              Recorded: {report.actual.excavationDays} excavation days with {report.actual.jcbCount} JCB(s){report.actual.totalDays ? `, ${report.actual.totalDays} days to plinth` : ""}.
            </p>
          ) : null}
          {canRecord ? (
            <form className="mt-3 space-y-2" onSubmit={save}>
              <div className="grid grid-cols-3 gap-2">
                <label className="space-y-1"><span className="text-[11px] font-medium text-slate-600">Excavation</span><UnitInput unit="days" type="number" min="1" step="0.5" required value={form.excavationDays} onChange={(x) => setForm({ ...form, excavationDays: x.target.value })} /></label>
                <label className="space-y-1"><span className="text-[11px] font-medium text-slate-600">JCBs used</span><Input type="number" min="1" step="1" required value={form.jcbCount} onChange={(x) => setForm({ ...form, jcbCount: x.target.value })} /></label>
                <label className="space-y-1"><span className="text-[11px] font-medium text-slate-600">To plinth</span><UnitInput unit="days" type="number" min="1" step="1" value={form.totalDays} onChange={(x) => setForm({ ...form, totalDays: x.target.value })} placeholder="opt." /></label>
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
