"use client";

import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { ROLE_LABELS, type IntegrationSync, type Project, type Team } from "@/lib/types";
import { PageHeader } from "@/components/AppShell";
import { Badge, Button, Card, Empty, ErrorBox, Loading, Select, Table, Td } from "@/components/ui";

const TYPES = [
  { key: "teams", label: "Teams", hint: "Planning, estimation & execution team members" },
  { key: "planning", label: "Planning", hint: "Schedule, baseline, WBS, dependencies" },
  { key: "estimation", label: "Estimation", hint: "BOQ quantity, rate, cost, planned resources" },
  { key: "execution", label: "Execution", hint: "Daily reports: manpower, machinery, materials" },
];
const TEAM_TONE: Record<string, string> = { Planning: "blue", Estimation: "amber", Execution: "green" };
const STATUS_TONE: Record<string, string> = { Success: "green", Partial: "amber", Failed: "red", Running: "slate" };

function statsSummary(stats?: IntegrationSync["stats"]) {
  if (!stats) return "-";
  return Object.entries(stats).map(([type, s]) => {
    const parts = Object.entries(s)
      .filter(([, v]) => (Array.isArray(v) ? v.length : v))
      .map(([k, v]) => `${k} ${Array.isArray(v) ? v.length : v}`);
    return `${type}: ${parts.join(", ") || "no changes"}`;
  }).join(" · ");
}

export default function IntegrationsPage() {
  const { user } = useAuth();
  const canSync = user?.role === "admin" || user?.role === "project_manager";
  const { data: projects } = useApi<Project[]>("/projects");
  const [projectId, setProjectId] = useState("");
  const pid = projectId || projects?.[0]?._id || "";
  const sources = useApi<{ source: string; mode: "live" | "mock"; baseUrl: string | null }[]>("/integrations/sources");
  const teams = useApi<Team[]>(pid ? `/integrations/teams?project=${pid}` : null);
  const syncs = useApi<IntegrationSync[]>(pid ? `/integrations/syncs?project=${pid}` : null);
  const [types, setTypes] = useState<string[]>(TYPES.map((t) => t.key));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const colab = sources.data?.find((s) => s.source === "colab");

  const sync = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/integrations/colab/sync", { method: "POST", json: { project: pid, types } });
    } catch (e) {
      setError((e as Error).message);
    }
    await Promise.all([teams.reload(), syncs.reload()]);
    setBusy(false);
  };

  return (
    <>
      <PageHeader
        title="Teams & Data Sources"
        subtitle="Planning, estimation and execution team data is pulled from Colab. Site teams add ground-level progress and blockers here."
        actions={
          <Select value={pid} onChange={(e) => setProjectId(e.target.value)} className="w-56">
            {projects?.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
          </Select>
        }
      />
      <div className="space-y-5">
        <Card
          title={<span className="flex items-center gap-2">Colab connector {colab && <Badge tone={colab.mode === "live" ? "green" : "amber"}>{colab.mode === "live" ? "Live API" : "Mock feed"}</Badge>}</span>}
          actions={canSync && <Button onClick={sync} disabled={busy || !pid || !types.length}>{busy ? "Syncing…" : "Sync now"}</Button>}
        >
          {colab?.mode === "mock" && (
            <p className="mb-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
              No Colab API configured yet, so syncing uses sample data in the assumed Colab format. Set <code>COLAB_API_URL</code> and <code>COLAB_API_KEY</code> in <code>backend/.env</code> to pull live data.
            </p>
          )}
          <div className="grid gap-3 md:grid-cols-4">
            {TYPES.map((t) => (
              <label key={t.key} className={`flex cursor-pointer gap-2 rounded-lg border p-3 text-sm ${types.includes(t.key) ? "border-slate-800 bg-slate-50" : "border-slate-200"}`}>
                <input type="checkbox" checked={types.includes(t.key)} disabled={!canSync} onChange={(e) => setTypes(e.target.checked ? [...types, t.key] : types.filter((x) => x !== t.key))} />
                <span><span className="font-medium">{t.label}</span><span className="block text-xs text-slate-500">{t.hint}</span></span>
              </label>
            ))}
          </div>
          <ErrorBox message={error} />
          <p className="mt-3 text-xs text-slate-500">
            Other systems can also push data: <code>POST /api/integrations/import/&lt;teams|planning|estimation|execution&gt;?project=&lt;id&gt;</code> with header <code>x-integration-key</code>.
          </p>
        </Card>

        <Card title="Teams">
          {teams.loading && !teams.data ? <Loading /> : teams.data?.length === 0 ? <Empty>No teams yet. Run a sync to import them.</Empty> : (
            <div className="grid gap-4 md:grid-cols-3">
              {teams.data?.map((t) => (
                <div key={t._id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{t.name}</div>
                    <Badge tone={TEAM_TONE[t.type]}>{t.type}</Badge>
                  </div>
                  <div className="text-xs text-slate-400">{t.code} · from {t.source}{t.lastSyncedAt ? ` · synced ${fmtDateTime(t.lastSyncedAt)}` : ""}</div>
                  <div className="mt-2 text-sm">Lead: <b>{t.lead?.name || "-"}</b></div>
                  <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                    {t.members.map((m) => <li key={m._id}>{m.name} · {ROLE_LABELS[m.role]}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Sync history">
          {syncs.data?.length === 0 ? <Empty>No syncs yet.</Empty> : (
            <Table head={["When", "Source", "Data", "Status", "Result", "By"]}>
              {syncs.data?.map((s) => (
                <tr key={s._id}>
                  <Td className="whitespace-nowrap text-slate-500">{fmtDateTime(s.startedAt)}</Td>
                  <Td>{s.source} <span className="text-xs text-slate-400">({s.mode})</span></Td>
                  <Td>{s.types.join(", ")}</Td>
                  <Td><Badge tone={STATUS_TONE[s.status]}>{s.status}</Badge></Td>
                  <Td className="max-w-xl text-xs text-slate-600">
                    {statsSummary(s.stats)}
                    {s.errorMessages.length > 0 && <div className="mt-1 text-red-600">{s.errorMessages.slice(0, 3).join("; ")}</div>}
                  </Td>
                  <Td className="text-slate-600">{s.triggeredBy?.name || "System"}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
