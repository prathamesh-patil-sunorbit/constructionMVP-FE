"use client";

import { useState } from "react";
import { api, API_URL, getToken, useApi } from "@/lib/api";
import { todayInput, fmtDate } from "@/lib/format";
import type { Activity, CameraObs, InventoryItem, InventoryTxn, LabourAttendanceRow, SiteReportRow } from "@/lib/types";
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Select, Table, Td, Textarea } from "./ui";
import { AiMark, CalculatedMark, NoData } from "./ai";

export function InventoryPanel({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const { data, error, reload } = useApi<{ items: InventoryItem[]; transactions: InventoryTxn[] }>(`/resources/inventory?project=${projectId}`);
  const [f, setF] = useState({ name: "", unit: "bags", stock: "", minStock: "", reorderLevel: "", supplier: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/resources/inventory", { method: "POST", json: { ...f, project: projectId, stock: Number(f.stock) || 0, minStock: Number(f.minStock) || 0, reorderLevel: Number(f.reorderLevel) || 0 } });
      setF({ name: "", unit: "bags", stock: "", minStock: "", reorderLevel: "", supplier: "" });
      await reload();
    } catch (err) { setMsg((err as Error).message); } finally { setBusy(false); }
  };

  const fromEstimates = async () => {
    setBusy(true);
    try {
      const r = await api<{ created: number }>(`/resources/inventory/from-estimates`, { method: "POST", json: { project: projectId } });
      setMsg(`Added ${r.created} catalogue item(s) from estimates (stock remains 0 until you record a receipt).`);
      await reload();
    } catch (err) { setMsg((err as Error).message); } finally { setBusy(false); }
  };

  const txn = async (id: string, type: string) => {
    const quantity = Number(prompt("Quantity") || "");
    if (!quantity) return;
    await api(`/resources/inventory/${id}/txn`, { method: "POST", json: { type, quantity } });
    await reload();
  };

  return (
    <div className="space-y-4">
      <Card title="Inventory" actions={<CalculatedMark />}>
        <ErrorBox message={error || msg} />
        {canEdit && (
          <div className="mb-3 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={fromEstimates} disabled={busy}>Create catalogue from estimates</Button>
          </div>
        )}
        {!data?.items.length ? <Empty>No stock recorded. Add items or create the catalogue from estimates (stock starts at 0).</Empty> : (
          <Table head={["Item", "Stock", "Min", "Reorder", "Supplier", ""]}>
            {data.items.map((i) => (
              <tr key={i._id}>
                <Td className="font-medium">{i.name}<div className="text-[11px] text-slate-400">{i.unit}</div></Td>
                <Td>{i.stock}</Td>
                <Td>{i.minStock}</Td>
                <Td>{i.reorderLevel}</Td>
                <Td>{i.supplier || "-"}</Td>
                <Td className="space-x-1">
                  {canEdit && <>
                    <Button variant="ghost" onClick={() => txn(i._id, "received")}>Receive</Button>
                    <Button variant="ghost" onClick={() => txn(i._id, "consumed")}>Consume</Button>
                  </>}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {canEdit && (
        <Card title="Record stock item">
          <form onSubmit={create} className="grid gap-3 sm:grid-cols-3">
            <Field label="Name"><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Unit"><Input required value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} /></Field>
            <Field label="Opening stock"><Input type="number" value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} /></Field>
            <Field label="Minimum"><Input type="number" value={f.minStock} onChange={(e) => setF({ ...f, minStock: e.target.value })} /></Field>
            <Field label="Reorder level"><Input type="number" value={f.reorderLevel} onChange={(e) => setF({ ...f, reorderLevel: e.target.value })} /></Field>
            <Field label="Supplier"><Input value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} /></Field>
            <div className="flex items-end"><Button disabled={busy}>Save item</Button></div>
          </form>
        </Card>
      )}
      {!!data?.transactions.length && (
        <Card title="Recent movements">
          <Table head={["Date", "Type", "Item", "Qty"]}>
            {data.transactions.slice(0, 12).map((t) => (
              <tr key={t._id}>
                <Td>{fmtDate(t.date)}</Td>
                <Td>{t.type}</Td>
                <Td>{t.item?.name}</Td>
                <Td>{t.quantity} {t.item?.unit}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </div>
  );
}

export function AttendancePanel({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const { data, error, reload } = useApi<LabourAttendanceRow[]>(`/resources/attendance?project=${projectId}`);
  const [f, setF] = useState({ date: todayInput(), trade: "Mason", category: "Skilled", planned: "", present: "", contractor: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/resources/attendance", { method: "POST", json: { ...f, project: projectId, planned: Number(f.planned) || 0, present: Number(f.present) || 0 } });
      await reload();
    } catch (err) { setMsg((err as Error).message); } finally { setBusy(false); }
  };

  const fromExec = async () => {
    setBusy(true);
    try {
      await api("/resources/attendance/from-execution", { method: "POST", json: { project: projectId, date: f.date } });
      await reload();
    } catch (err) { setMsg((err as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <Card title="Labour attendance">
        <ErrorBox message={error || msg} />
        {canEdit && (
          <form onSubmit={submit} className="mb-4 grid gap-3 sm:grid-cols-3">
            <Field label="Date"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
            <Field label="Trade"><Input value={f.trade} onChange={(e) => setF({ ...f, trade: e.target.value })} /></Field>
            <Field label="Category">
              <Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
                {["Skilled", "Semi-skilled", "Unskilled"].map((c) => <option key={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label="Planned"><Input type="number" value={f.planned} onChange={(e) => setF({ ...f, planned: e.target.value })} /></Field>
            <Field label="Present"><Input type="number" value={f.present} onChange={(e) => setF({ ...f, present: e.target.value })} /></Field>
            <Field label="Contractor"><Input value={f.contractor} onChange={(e) => setF({ ...f, contractor: e.target.value })} /></Field>
            <div className="flex items-end gap-2">
              <Button disabled={busy}>Save</Button>
              <Button type="button" variant="secondary" disabled={busy} onClick={fromExec}>Copy from execution reports</Button>
            </div>
          </form>
        )}
        {!data?.length ? <Empty>No attendance recorded.</Empty> : (
          <Table head={["Date", "Trade", "Category", "Planned", "Present"]}>
            {data.map((r) => (
              <tr key={r._id}>
                <Td>{fmtDate(r.date)}</Td>
                <Td>{r.trade}</Td>
                <Td>{r.category}</Td>
                <Td>{r.planned}</Td>
                <Td>{r.present}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

export function SiteReportPanel({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const { data, error, reload } = useApi<SiteReportRow[]>(`/resources/site-reports?project=${projectId}`);
  const [remarks, setRemarks] = useState("");
  const [issues, setIssues] = useState("");
  const [weather, setWeather] = useState("");
  const [trade, setTrade] = useState("Mason");
  const [present, setPresent] = useState("");
  const [planned, setPlanned] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/resources/site-reports", {
        method: "POST",
        json: {
          project: projectId, date: todayInput(), remarks, issues, weather,
          labour: present ? [{ trade, category: "Skilled", planned: Number(planned) || 0, present: Number(present) }] : [],
        },
      });
      setRemarks(""); setIssues("");
      await reload();
    } catch (err) { setMsg((err as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {canEdit && (
        <Card title="Submit today's site report">
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
            <Field label="Weather"><Input value={weather} onChange={(e) => setWeather(e.target.value)} placeholder="Clear / rain" /></Field>
            <Field label="Trade on site"><Input value={trade} onChange={(e) => setTrade(e.target.value)} /></Field>
            <Field label="Planned labour"><Input type="number" value={planned} onChange={(e) => setPlanned(e.target.value)} /></Field>
            <Field label="Present labour"><Input type="number" value={present} onChange={(e) => setPresent(e.target.value)} /></Field>
            <div className="sm:col-span-2"><Field label="Work / remarks"><Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} /></Field></div>
            <div className="sm:col-span-2"><Field label="Issues"><Textarea value={issues} onChange={(e) => setIssues(e.target.value)} /></Field></div>
            <div><Button disabled={busy}>{busy ? "Saving…" : "Submit report"}</Button></div>
          </form>
          <ErrorBox message={msg} />
        </Card>
      )}
      <Card title="Site reports">
        <ErrorBox message={error} />
        {!data?.length ? <Empty>No site reports yet.</Empty> : data.map((r) => (
          <div key={r._id} className="mb-3 rounded-lg border border-slate-200 p-3">
            <div className="flex justify-between text-sm">
              <span className="font-medium">{fmtDate(r.date, true)}</span>
              <span className="text-slate-500">{r.reportedBy?.name}</span>
            </div>
            {r.weather && <div className="text-xs text-slate-500">Weather: {r.weather}</div>}
            {r.remarks && <p className="mt-1 text-sm">{r.remarks}</p>}
            {r.issues && <p className="text-sm text-red-700">Issues: {r.issues}</p>}
            {r.aiSummary && (
              <div className="mt-2 rounded bg-slate-50 p-2 text-sm">
                {r.aiSummary.aiGenerated ? <AiMark /> : <Badge tone="slate">figures</Badge>}
                <p className="mt-1">{r.aiSummary.summary || r.aiSummary.headline}</p>
              </div>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}

export function CameraPanel({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const { data, error, reload } = useApi<CameraObs[]>(`/resources/camera?project=${projectId}`);
  const { data: activities } = useApi<Activity[]>(`/activities?project=${projectId}`);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [activity, setActivity] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("project", projectId);
      body.append("caption", caption);
      if (activity) body.append("activity", activity);
      const headers = new Headers();
      const token = getToken();
      if (token) headers.set("Authorization", `Bearer ${token}`);
      const res = await fetch(`${API_URL}/api/resources/camera`, { method: "POST", headers, body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || res.statusText);
      setFile(null); setCaption("");
      await reload();
    } catch (err) { setMsg((err as Error).message); } finally { setBusy(false); }
  };

  const loadDemo = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api("/resources/camera/demo", { method: "POST", json: { project: projectId } });
      await reload();
    } catch (err) { setMsg((err as Error).message); } finally { setBusy(false); }
  };

  const verify = async (id: string, status: string) => {
    await api(`/resources/camera/${id}/verify`, { method: "PATCH", json: { status } });
    await reload();
  };

  return (
    <div className="space-y-4">
      {canEdit && (
        <Card title="Upload site photograph">
          <p className="mb-3 text-xs text-slate-500">Computer-vision results are AI estimates. A person must accept or reject them. Live CCTV is not connected — sample stills are demonstration photographs.</p>
          <form onSubmit={upload} className="grid gap-3 sm:grid-cols-2">
            <Field label="Photo"><Input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} /></Field>
            <Field label="Linked activity">
              <Select value={activity} onChange={(e) => setActivity(e.target.value)}>
                <option value="">None</option>
                {activities?.map((a) => <option key={a._id} value={a._id}>{a.code} · {a.name}</option>)}
              </Select>
            </Field>
            <div className="sm:col-span-2"><Field label="Caption"><Input value={caption} onChange={(e) => setCaption(e.target.value)} /></Field></div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy || !file}>{busy ? "Analysing…" : "Upload & analyse"}</Button>
              <Button type="button" variant="secondary" disabled={busy} onClick={loadDemo}>
                {busy ? "Loading…" : "Load sample site photos"}
              </Button>
            </div>
          </form>
          <ErrorBox message={msg} />
        </Card>
      )}
      <Card title="Camera observations">
        <ErrorBox message={error} />
        {!data?.length ? <Empty>No photographs yet. Use Load sample site photos, or upload a still. Live CCTV is not connected.</Empty> : data.map((o) => (
          <div key={o._id} className="mb-3 grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-[160px_1fr]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${API_URL}${o.url}`} alt={o.caption || "Site photo"} className="h-36 w-full rounded object-cover" />
            <div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{o.caption || o.activity?.name || "Site photo"}</span>
                <AiMark />
                {o.source === "demo" && <Badge tone="blue">sample still</Badge>}
                {o.verification?.status && <Badge tone={o.verification.status === "Accepted" ? "green" : o.verification.status === "Rejected" ? "red" : "amber"}>{o.verification.status}</Badge>}
              </div>
              {o.activity && <div className="text-xs text-slate-500">{o.activity.code} · {o.activity.name}</div>}
              {o.analysis?.insufficientData ? <NoData reason={o.analysis.reason} /> : (
                <ul className="mt-2 space-y-0.5 text-sm text-slate-700">
                  <li>Workers visible: {o.analysis?.workers ?? "-"} · helmets {o.analysis?.helmets ?? "-"} · jackets {o.analysis?.jackets ?? "-"}</li>
                  {!!o.analysis?.machinery?.length && <li>Machinery: {o.analysis.machinery.join(", ")}</li>}
                  {o.analysis?.progressEstimate != null && <li>Visual progress estimate: {o.analysis.progressEstimate}%{o.analysis.progressDelta != null ? ` (${o.analysis.progressDelta > 0 ? "+" : ""}${o.analysis.progressDelta} vs previous)` : ""}</li>}
                  {o.analysis?.notes && <li className="text-slate-500">{o.analysis.notes}</li>}
                </ul>
              )}
              {canEdit && o.verification?.status === "Pending" && (
                <div className="mt-2 flex gap-2">
                  <Button variant="secondary" onClick={() => verify(o._id, "Accepted")}>Accept</Button>
                  <Button variant="ghost" onClick={() => verify(o._id, "Rejected")}>Reject</Button>
                </div>
              )}
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

export function ProjectPicker({ projects, value, onChange }: { projects?: { _id: string; name: string }[]; value: string; onChange: (id: string) => void }) {
  if (!projects || projects.length < 2) return null;
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="max-w-56">
      {projects.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
    </Select>
  );
}
