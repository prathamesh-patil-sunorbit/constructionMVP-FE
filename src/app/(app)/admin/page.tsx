"use client";

import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { ROLE_LABELS, type Role, type User } from "@/lib/types";
import { PageHeader } from "@/components/AppShell";
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, Modal, Select, Table, Td } from "@/components/ui";

interface Rules {
  status: { atRiskProgressVariance: number; delayedProgressVariance: number; atRiskDelayDays: number; delayedDelayDays: number };
  forecast: { minProductivityFactor: number };
  risk: { minImpactDaysForAtRisk: number };
  severity: Record<"high" | "medium", { delayDays: number; progressVariance: number; impactDays: number }>;
  escalation: { minSeverity: string; map: Record<string, Role> };
}

function UserForm({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ name: "", email: "", password: "", role: "site_engineer", phone: "" });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api("/users", { method: "POST", json: f });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3">
      <Field label="Name"><Input required value={f.name} onChange={set("name")} /></Field>
      <Field label="Email"><Input type="email" required value={f.email} onChange={set("email")} /></Field>
      <Field label="Password"><Input required value={f.password} onChange={set("password")} /></Field>
      <Field label="Role">
        <Select value={f.role} onChange={set("role")}>{Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
      </Field>
      <Field label="Phone"><Input value={f.phone} onChange={set("phone")} /></Field>
      <div className="col-span-2"><ErrorBox message={error} /></div>
      <div className="col-span-2 flex justify-end"><Button>Create user</Button></div>
    </form>
  );
}

function NumberField({ label, value, onChange, hint, step = 1 }: { label: string; value: number; onChange: (v: number) => void; hint?: string; step?: number }) {
  return <Field label={label} hint={hint}><Input type="number" step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} /></Field>;
}

function RulesEditor() {
  const { data, error } = useApi<Rules>("/settings/rules");
  if (error) return <ErrorBox message={error} />;
  if (!data) return <Loading />;
  return <RulesForm initial={data} />;
}

function RulesForm({ initial }: { initial: Rules }) {
  const [r, setR] = useState<Rules>(initial);
  const [saved, setSaved] = useState("");

  const upd = (fn: (draft: Rules) => void) => {
    const next = structuredClone(r);
    fn(next);
    setR(next);
    setSaved("");
  };
  const save = async () => {
    const res = await api<Rules>("/settings/rules", { method: "PUT", json: r });
    setR(res);
    for (const p of await api<{ _id: string }[]>("/projects")) await api(`/projects/${p._id}/evaluate`, { method: "POST" });
    setSaved("Saved & all projects re-evaluated");
  };

  return (
    <Card title="Business rules (configurable thresholds)" actions={<div className="flex items-center gap-3">{saved && <span className="text-xs text-emerald-600">{saved}</span>}<Button onClick={save}>Save rules</Button></div>}>
      <p className="mb-4 text-xs text-slate-500">Initial values to be validated against actual Krisala operations. Changes apply on the next evaluation.</p>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Activity status classification</h3>
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="At Risk if behind by (%)" value={r.status.atRiskProgressVariance} onChange={(v) => upd((d) => { d.status.atRiskProgressVariance = v; })} />
            <NumberField label="Delayed if behind by (%)" value={r.status.delayedProgressVariance} onChange={(v) => upd((d) => { d.status.delayedProgressVariance = v; })} />
            <NumberField label="At Risk if finish slips (days)" value={r.status.atRiskDelayDays} onChange={(v) => upd((d) => { d.status.atRiskDelayDays = v; })} />
            <NumberField label="Delayed if finish slips (days)" value={r.status.delayedDelayDays} onChange={(v) => upd((d) => { d.status.delayedDelayDays = v; })} />
          </div>
          <h3 className="pt-2 text-sm font-semibold">Forecast & risk creation</h3>
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Min productivity factor" step={0.1} hint="Floor on observed rate vs planned rate" value={r.forecast.minProductivityFactor} onChange={(v) => upd((d) => { d.forecast.minProductivityFactor = v; })} />
            <NumberField label="At Risk raises risk if impact ≥ (days)" value={r.risk.minImpactDaysForAtRisk} onChange={(v) => upd((d) => { d.risk.minImpactDaysForAtRisk = v; })} />
          </div>
        </div>
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Risk severity (any condition met)</h3>
          {(["high", "medium"] as const).map((lvl) => (
            <div key={lvl} className="grid grid-cols-3 gap-3">
              <NumberField label={`${lvl === "high" ? "High" : "Medium"}: delay ≥ days`} value={r.severity[lvl].delayDays} onChange={(v) => upd((d) => { d.severity[lvl].delayDays = v; })} />
              <NumberField label="or behind ≥ %" value={r.severity[lvl].progressVariance} onChange={(v) => upd((d) => { d.severity[lvl].progressVariance = v; })} />
              <NumberField label="or impact ≥ days" value={r.severity[lvl].impactDays} onChange={(v) => upd((d) => { d.severity[lvl].impactDays = v; })} />
            </div>
          ))}
          <p className="text-xs text-slate-500">Otherwise Low. A blocker&apos;s own severity raises the risk to at least that level.</p>
          <h3 className="pt-2 text-sm font-semibold">Escalation</h3>
          <div className="grid grid-cols-2 gap-3">
            {(["Low", "Medium", "High"] as const).map((sev) => (
              <Field key={sev} label={`${sev === "Low" ? "Low (normal)" : sev} → escalate to`}>
                <Select value={r.escalation.map[sev]} onChange={(e) => upd((d) => { d.escalation.map[sev] = e.target.value as Role; })}>
                  {(["site_engineer", "site_manager", "project_manager"] as Role[]).map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
                </Select>
              </Field>
            ))}
            <Field label="Escalate from severity">
              <Select value={r.escalation.minSeverity} onChange={(e) => upd((d) => { d.escalation.minSeverity = e.target.value; })}>
                {["Low", "Medium", "High"].map((s) => <option key={s}>{s}</option>)}
              </Select>
            </Field>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function AdminPage() {
  const { data: users, reload } = useApi<User[]>("/users");
  const [creating, setCreating] = useState(false);

  const toggle = async (u: User) => {
    await api(`/users/${u._id}`, { method: "PATCH", json: { active: !u.active } });
    reload();
  };
  const changeRole = async (u: User, role: string) => {
    await api(`/users/${u._id}`, { method: "PATCH", json: { role } });
    reload();
  };

  return (
    <>
      <PageHeader title="Admin" subtitle="Users, roles and basic configuration" />
      <div className="space-y-5">
        <Card title="Users & roles" actions={<Button onClick={() => setCreating(true)}>New user</Button>}>
          {!users ? <Loading /> : (
            <Table head={["Name", "Email", "Role", "Status", ""]}>
              {users.map((u) => (
                <tr key={u._id}>
                  <Td className="font-medium">{u.name}</Td>
                  <Td className="text-slate-600">{u.email}</Td>
                  <Td>
                    <Select value={u.role} onChange={(e) => changeRole(u, e.target.value)} className="w-44">
                      {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </Select>
                  </Td>
                  <Td><Badge tone={u.active ? "green" : "slate"}>{u.active ? "Active" : "Inactive"}</Badge></Td>
                  <Td><Button variant="ghost" onClick={() => toggle(u)}>{u.active ? "Deactivate" : "Activate"}</Button></Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
        <RulesEditor />
      </div>
      <Modal open={creating} onClose={() => setCreating(false)} title="New user">
        <UserForm onDone={() => { setCreating(false); reload(); }} />
      </Modal>
    </>
  );
}
