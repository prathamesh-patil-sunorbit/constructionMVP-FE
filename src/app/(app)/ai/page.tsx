"use client";

import { useState } from "react";
import { PageHeader } from "@/components/AppShell";
import { api, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { isManager, type AiInsights, type AiStatus, type Project, type Simulation } from "@/lib/types";
import { Button, Card, ErrorBox, Field, Input, Loading, Select, Stat, Badge, Empty } from "@/components/ui";
import {
  AgentCard, AlertList, CompletionCard, DelayCard, EquipmentCard, GroundCard, HealthCard,
  InventoryCard, LabourCard, MaterialCard, PlanningCard, PredictionRow, SchedulingCard,
  SimulationResult, CalculatedMark,
} from "@/components/ai";
import { fmtDate, signed } from "@/lib/format";

const TABS = ["Overview", "Delay", "Plan", "Resources", "Agents", "What-if", "Predictions"] as const;
type Tab = (typeof TABS)[number];

export default function AiPage() {
  const { user } = useAuth();
  const manager = isManager(user?.role) || user?.role === "planning_engineer";
  const { data: projects } = useApi<Project[]>("/projects");
  const { data: status } = useApi<AiStatus>("/ai/status");
  const [projectId, setProjectId] = useState<string>("");
  const selected = projectId || projects?.[0]?._id || "";
  const { data, error, loading, reload } = useApi<AiInsights>(selected ? `/ai/projects/${selected}/insights` : null);
  const [tab, setTab] = useState<Tab>("Overview");
  const [running, setRunning] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const runAgent = async (key: string) => {
    setRunning(key);
    setActionError(null);
    try {
      await api(`/ai/projects/${selected}/agents/${key}`, { method: "POST" });
      await reload();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setRunning(null);
    }
  };

  const runAll = async () => {
    setRunning("all");
    setActionError(null);
    try {
      await api(`/ai/projects/${selected}/analyze`, { method: "POST", json: { agents: data?.agents.map((a) => a.key) } });
      await reload();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setRunning(null);
    }
  };

  const decide = async (id: string, decision: string, value?: unknown, reason?: string) => {
    await api(`/ai/predictions/${id}/decision`, { method: "PATCH", json: { decision, value, reason } });
    await reload();
  };

  const acknowledge = async (id: string) => {
    await api(`/ai/alerts/${id}/acknowledge`, { method: "PATCH" });
    await reload();
  };

  if (loading && !data) return <Loading />;

  const a = data?.analysis;

  return (
    <>
      <PageHeader
        title="AI Construction Intelligence"
        subtitle={data ? `${data.project.name} · as of ${fmtDate(data.asOf, true)}` : "Project analysis"}
        actions={
          <div className="flex items-center gap-2">
            {projects && projects.length > 1 && (
              <Select value={selected} onChange={(e) => setProjectId(e.target.value)} className="max-w-56">
                {projects.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
              </Select>
            )}
            {manager && <Button onClick={runAll} disabled={!!running}>{running === "all" ? "Analysing…" : "Run all agents"}</Button>}
          </div>
        }
      />
      <ErrorBox message={error || actionError} />

      {status && !status.configured && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span className="font-medium">Gemini is not configured.</span> {status.note} All figures on this page are
          calculated by the rules engine and remain accurate without it; only the written explanations are unavailable.
        </div>
      )}

      {data && a && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Overall progress" value={`${data.progress.overall}%`} />
            <Stat label="Planned progress" value={`${data.progress.planned}%`} />
            <Stat
              label="Variance"
              value={signed(data.progress.variance, "%")}
              tone={data.progress.variance < 0 ? "text-red-600" : "text-emerald-600"}
            />
            <Stat label="Health score" value={`${a.health.overall}/100`} />
          </div>

          <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === t ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === "Overview" && (
            <div className="space-y-4">
              <CompletionCard data={a.completion} confidence={a.confidence} />
              <div className="grid gap-4 lg:grid-cols-2">
                <Card title="Alert centre" actions={<Badge tone="slate">{data.alerts.length} open</Badge>}>
                  <AlertList alerts={data.alerts} onAcknowledge={acknowledge} />
                </Card>
                <HealthCard data={a.health} />
              </div>
              <Card title="Activity status" actions={<CalculatedMark />}>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
                  {Object.entries(data.progress.counts).map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-slate-50 p-2 text-center">
                      <div className="text-lg font-semibold">{v}</div>
                      <div className="text-[11px] text-slate-500">{k}</div>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-slate-400">
                  Progress is weighted by {data.progress.weightBasis}.
                </p>
              </Card>
            </div>
          )}

          {tab === "Delay" && (
            <div className="space-y-4">
              <DelayCard data={a.delay} />
              <GroundCard data={a.ground} />
            </div>
          )}

          {tab === "Plan" && (
            <div className="space-y-4">
              <PlanningCard data={a.planning} />
              <SchedulingCard data={a.scheduling} />
            </div>
          )}

          {tab === "Resources" && (
            <div className="space-y-4">
              <LabourCard data={a.labour} />
              <div className="grid gap-4 lg:grid-cols-2">
                <MaterialCard data={a.material} />
                <EquipmentCard data={a.equipment} />
              </div>
              <InventoryCard data={a.inventory} />
            </div>
          )}

          {tab === "Agents" && (
            <div className="grid gap-4 lg:grid-cols-2">
              {data.agents.map((agent) => (
                <AgentCard
                  key={agent.key}
                  agent={agent}
                  onRun={() => runAgent(agent.key)}
                  running={running === agent.key}
                />
              ))}
            </div>
          )}

          {tab === "What-if" && <WhatIf projectId={selected} status={status} canRun={manager} />}

          {tab === "Predictions" && (
            <Card title="AI predictions" actions={<span className="text-xs text-slate-500">Accept, reject or override — every decision is audited</span>}>
              {data.predictions.length ? (
                <div className="space-y-2">
                  {data.predictions.map((p) => (
                    <PredictionRow key={p._id} prediction={p} canDecide={manager} onDecide={decide} />
                  ))}
                </div>
              ) : <Empty>No predictions yet. Run the agents to generate them.</Empty>}
            </Card>
          )}
        </>
      )}
    </>
  );
}

const SCENARIO_FIELDS: Record<string, { key: string; label: string; type: string }[]> = {
  add_labour: [{ key: "workers", label: "Extra workers", type: "number" }],
  remove_labour: [{ key: "workers", label: "Workers absent", type: "number" }],
  add_equipment: [{ key: "count", label: "Extra machines", type: "number" }],
  material_late: [{ key: "days", label: "Days late", type: "number" }],
  weather_stop: [{ key: "days", label: "Days stopped", type: "number" }],
  rock_found: [{ key: "activityCode", label: "Activity code", type: "text" }],
  increase_hours: [{ key: "hours", label: "Extra hours per day", type: "number" }],
};

function WhatIf({ projectId, status, canRun }: { projectId: string; status: AiStatus | null; canRun: boolean }) {
  const [type, setType] = useState("add_labour");
  const [params, setParams] = useState<Record<string, string>>({ workers: "10" });
  const [result, setResult] = useState<Simulation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const json: Record<string, unknown> = { type };
      for (const f of SCENARIO_FIELDS[type] || []) {
        if (params[f.key]) json[f.key] = f.type === "number" ? Number(params[f.key]) : params[f.key];
      }
      setResult(await api<Simulation>(`/ai/projects/${projectId}/simulate`, { method: "POST", json }));
    } catch (e) {
      setError((e as Error).message);
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  if (!canRun) return <Empty>What-if simulation is available to managers and planning engineers.</Empty>;

  return (
    <div className="space-y-4">
      <Card title="What-if simulation" actions={<CalculatedMark title="The schedule is re-forecast through the dependency chain" />}>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
          <Field label="Scenario">
            <Select value={type} onChange={(e) => { setType(e.target.value); setParams({}); setResult(null); }}>
              {(status?.scenarios || []).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </Select>
          </Field>
          {(SCENARIO_FIELDS[type] || []).map((f) => (
            <Field key={f.key} label={f.label}>
              <Input
                type={f.type}
                value={params[f.key] || ""}
                onChange={(e) => setParams({ ...params, [f.key]: e.target.value })}
                required
              />
            </Field>
          ))}
          <div className="flex items-end">
            <Button disabled={busy}>{busy ? "Calculating…" : "Simulate"}</Button>
          </div>
        </form>
        <ErrorBox message={error} />
        {result && <div className="mt-4"><SimulationResult data={result} /></div>}
      </Card>
    </div>
  );
}
