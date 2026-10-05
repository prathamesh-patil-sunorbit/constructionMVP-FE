"use client";

import Link from "next/link";
import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import type { Project, User } from "@/lib/types";
import { PageHeader } from "@/components/AppShell";
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Loading, Modal, Select, healthColor } from "@/components/ui";

const HEALTHS = ["On Track", "At Risk", "Delayed", "Blocked"] as const;

function ProjectForm({ onDone }: { onDone: () => void }) {
  const { data: users } = useApi<User[]>("/users");
  const [f, setF] = useState({ code: "", name: "", location: "", projectType: "Residential", startDate: "", plannedCompletionDate: "", status: "Active", projectManager: "", siteManager: "" });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api("/projects", { method: "POST", json: f });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3">
      <Field label="Project ID"><Input required value={f.code} onChange={set("code")} placeholder="KRS-B" /></Field>
      <Field label="Project name"><Input required value={f.name} onChange={set("name")} /></Field>
      <Field label="Location"><Input value={f.location} onChange={set("location")} /></Field>
      <Field label="Project type"><Input value={f.projectType} onChange={set("projectType")} /></Field>
      <Field label="Start date"><Input type="date" value={f.startDate} onChange={set("startDate")} /></Field>
      <Field label="Planned completion"><Input type="date" value={f.plannedCompletionDate} onChange={set("plannedCompletionDate")} /></Field>
      <Field label="Project manager">
        <Select value={f.projectManager} onChange={set("projectManager")}>
          <option value="">-</option>
          {users?.filter((u) => u.role === "project_manager").map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
        </Select>
      </Field>
      <Field label="Site manager">
        <Select value={f.siteManager} onChange={set("siteManager")}>
          <option value="">-</option>
          {users?.filter((u) => u.role === "site_manager").map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
        </Select>
      </Field>
      <div className="col-span-2"><ErrorBox message={error} /></div>
      <div className="col-span-2 flex justify-end"><Button>Create project</Button></div>
    </form>
  );
}

export default function ProjectsPage() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useApi<Project[]>("/projects");
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHeader title="Projects" actions={user?.role === "admin" && <Button onClick={() => setCreating(true)}>New project</Button>} />
      <ErrorBox message={error} />
      {loading && !data ? <Loading /> : data?.length === 0 ? <Empty>No projects yet.</Empty> : (
        <div className="grid gap-4 md:grid-cols-2">
          {data?.map((p) => (
            <Link key={p._id} href={`/projects/${p._id}`}>
              <Card className="transition hover:shadow-md">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs text-slate-400">{p.code}</div>
                    <div className="text-lg font-semibold">{p.name}</div>
                    <div className="text-sm text-slate-500">{p.location} · {p.projectType}</div>
                  </div>
                  <Badge tone={p.status === "Active" ? "green" : "slate"}>{p.status}</Badge>
                </div>
                <div className="mt-3 text-sm text-slate-600">
                  {fmtDate(p.startDate, true)} → {fmtDate(p.plannedCompletionDate, true)} · PM: {p.projectManager?.name || "-"} · SM: {p.siteManager?.name || "-"}
                </div>
                <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-slate-100">
                  {HEALTHS.map((h) => (p.health?.[h] ? <div key={h} className={healthColor(h)} style={{ width: `${(p.health[h]! / (p.totalActivities || 1)) * 100}%` }} /> : null))}
                </div>
                <div className="mt-2 flex gap-3 text-xs text-slate-500">
                  <span>{p.totalActivities} activities</span>
                  {HEALTHS.map((h) => <span key={h}>{h}: {p.health?.[h] || 0}</span>)}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
      <Modal open={creating} onClose={() => setCreating(false)} title="New project">
        <ProjectForm onDone={() => { setCreating(false); reload(); }} />
      </Modal>
    </>
  );
}
