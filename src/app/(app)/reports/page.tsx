"use client";

import { useState } from "react";
import { PageHeader, useIsManager } from "@/components/AppShell";
import { api, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Project } from "@/lib/types";
import { Badge, Button, Card, Empty, ErrorBox, Loading, Select } from "@/components/ui";
import { AiMark, CalculatedMark, Narration } from "@/components/ai";
import { fmtDate, fmtDateTime } from "@/lib/format";

const KINDS = [
  ["health", "Project health"],
  ["daily", "Daily"],
  ["weekly", "Weekly"],
  ["delay", "Delay"],
  ["labour", "Labour"],
  ["material", "Material"],
  ["equipment", "Equipment"],
  ["management", "Management"],
];

interface Report {
  _id: string;
  kind: string;
  createdAt: string;
  generatedBy?: { name: string };
  narration?: { aiGenerated?: boolean; summary?: string; headline?: string; findings?: { title: string; detail: string; evidence: string }[]; recommendations?: { action: string; rationale: string }[] };
  data?: { progress?: { overall: number; planned: number; variance: number }; health?: { overall: number } };
}

export default function ReportsPage() {
  const { user } = useAuth();
  const manager = useIsManager() || user?.role === "planning_engineer" || user?.role === "estimation_engineer";
  const { data: projects } = useApi<Project[]>("/projects");
  const [projectId, setProjectId] = useState("");
  const selected = projectId || projects?.[0]?._id || "";
  const { data, error, loading, reload } = useApi<Report[]>(selected ? `/ai/projects/${selected}/reports` : null);
  const [kind, setKind] = useState("health");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true);
    try {
      await api(`/ai/projects/${selected}/reports`, { method: "POST", json: { kind } });
      await reload();
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader
        title="AI reports"
        subtitle="Compiled from project records. Figures are calculated; the write-up is AI-generated when Gemini is configured."
        actions={
          <div className="flex gap-2">
            {projects && projects.length > 1 && (
              <Select value={selected} onChange={(e) => setProjectId(e.target.value)} className="max-w-56">
                {projects.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
              </Select>
            )}
            {manager && (
              <>
                <Select value={kind} onChange={(e) => setKind(e.target.value)}>
                  {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </Select>
                <Button onClick={generate} disabled={busy}>{busy ? "Generating…" : "Generate"}</Button>
              </>
            )}
          </div>
        }
      />
      <ErrorBox message={error || msg} />
      {loading && !data ? <Loading /> : !data?.length ? <Empty>No reports yet.</Empty> : (
        <div className="space-y-4">
          {data.map((r) => (
            <Card
              key={r._id}
              title={<span className="capitalize">{r.kind} report</span>}
              actions={<span className="text-xs text-slate-400">{fmtDateTime(r.createdAt)} · {r.generatedBy?.name}</span>}
            >
              <div className="mb-2 flex gap-2">
                {r.narration?.aiGenerated ? <AiMark /> : <CalculatedMark />}
                <Badge tone="slate">Health {r.data?.health?.overall ?? "-"}</Badge>
                {r.data?.progress && <Badge tone="slate">{r.data.progress.overall}% vs {r.data.progress.planned}%</Badge>}
              </div>
              {r.narration && <Narration data={{ ...r.narration, aiGenerated: !!r.narration.aiGenerated, headline: r.narration.headline }} />}
              <p className="mt-2 text-[11px] text-slate-400">Period ending {fmtDate(r.createdAt, true)}</p>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
