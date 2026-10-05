"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { API_URL, api, getToken, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { display, fmtDate, fmtDateTime, signed, toInputDate } from "@/lib/format";
import { ROLE_LABELS, isManager, type ActivityDetail, type Blocker, type User } from "@/lib/types";
import { PageHeader } from "@/components/AppShell";
import {
  Badge, BlockerStatusBadge, Button, Card, Empty, ErrorBox, Field, HealthBadge, Input, Loading, Modal, Progress,
  Select, SeverityBadge, StatusBadge, Table, Td, Textarea,
} from "@/components/ui";
import { BlockerForm, ProgressUpdateForm } from "@/components/forms";
import { ExecutionReportsTable, TeamDataCards } from "@/components/team-data";

const NEXT_STATUS: Record<string, string[]> = {
  Open: ["Assigned", "In Progress", "Resolved"],
  Assigned: ["In Progress", "Resolved"],
  "In Progress": ["Resolved"],
  Resolved: ["Closed", "Open"],
  Closed: [],
};

function BlockerRow({ b, manager, onChange }: { b: Blocker; manager: boolean; onChange: () => void }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const move = async (status: string) => {
    try {
      await api(`/blockers/${b._id}`, { method: "PATCH", json: { status, note } });
      setNote("");
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const options = (NEXT_STATUS[b.status] || []).filter((s) => manager || s !== "Closed");
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="purple">{b.type}</Badge>
        <SeverityBadge value={b.severity} />
        <BlockerStatusBadge value={b.status} />
        <span className="text-sm font-medium">{b.description}</span>
      </div>
      <div className="mt-1 text-xs text-slate-500">
        Reported {fmtDate(b.reportedDate)} by {b.reportedBy?.name} · Expected resolution {fmtDate(b.expectedResolution)}
        {b.assignedTo && <> · Assigned to {b.assignedTo.name}</>}
        {b.resolutionNote && <> · Resolution: {b.resolutionNote}</>}
      </div>
      <ol className="mt-2 flex flex-wrap gap-x-3 text-[11px] text-slate-500">
        {b.history.map((h, i) => <li key={i}>• {h.status} {fmtDate(h.at)}{h.by ? ` (${h.by.name})` : ""}{h.note ? `: ${h.note}` : ""}</li>)}
      </ol>
      {options.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input className="max-w-xs" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          {options.map((s) => (
            <Button key={s} variant={s === "Resolved" ? "primary" : "secondary"} onClick={() => move(s)}>{s === "Open" ? "Reopen" : `Mark ${s}`}</Button>
          ))}
        </div>
      )}
      <ErrorBox message={error} />
    </div>
  );
}

function EditPlanForm({ a, onDone }: { a: ActivityDetail; onDone: () => void }) {
  const { data: users } = useApi<User[]>("/users?role=site_engineer");
  const [f, setF] = useState({
    name: a.name, plannedStart: toInputDate(a.plannedStart), plannedFinish: toInputDate(a.plannedFinish),
    plannedQuantity: a.plannedQuantity?.toString() || "", unit: a.unit || "", responsible: a.responsible?._id || "", priority: a.priority, comment: "",
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api(`/activities/${a._id}`, { method: "PATCH", json: f });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3">
      <div className="col-span-2"><Field label="Name"><Input value={f.name} onChange={set("name")} /></Field></div>
      <Field label="Planned start"><Input type="date" value={f.plannedStart} onChange={set("plannedStart")} /></Field>
      <Field label="Planned finish"><Input type="date" value={f.plannedFinish} onChange={set("plannedFinish")} /></Field>
      <Field label="Planned quantity"><Input type="number" step="any" value={f.plannedQuantity} onChange={set("plannedQuantity")} /></Field>
      <Field label="Unit"><Input value={f.unit} onChange={set("unit")} /></Field>
      <Field label="Responsible">
        <Select value={f.responsible} onChange={set("responsible")}>
          <option value="">-</option>
          {users?.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
        </Select>
      </Field>
      <Field label="Priority"><Select value={f.priority} onChange={set("priority")}>{["Low", "Medium", "High", "Critical"].map((p) => <option key={p}>{p}</option>)}</Select></Field>
      <div className="col-span-2"><Field label="Reason for change (audit)"><Textarea rows={2} value={f.comment} onChange={set("comment")} /></Field></div>
      <div className="col-span-2"><ErrorBox message={error} /></div>
      <div className="col-span-2 flex justify-end"><Button>Save plan</Button></div>
    </form>
  );
}

export default function ActivityPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const manager = isManager(user?.role);
  const { data: a, error, reload } = useApi<ActivityDetail>(`/activities/${id}`);
  const [modal, setModal] = useState<"" | "update" | "blocker" | "edit">("");
  const [comment, setComment] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [tab, setTab] = useState<"history" | "execution" | "comments" | "audit">("history");

  if (error) return <ErrorBox message={error} />;
  if (!a) return <Loading />;

  const m = a.metrics;
  const canUpdate = manager || a.responsible?._id === user?._id;
  const done = () => { setModal(""); reload(); };

  const addComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;
    await api(`/activities/${id}/comments`, { method: "POST", json: { text: comment } });
    setComment("");
    reload();
  };

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    const body = new FormData();
    body.append("file", file);
    body.append("caption", caption);
    await fetch(`${API_URL}/api/activities/${id}/attachments`, { method: "POST", body, headers: { Authorization: `Bearer ${getToken()}` } });
    setFile(null);
    setCaption("");
    (e.target as HTMLFormElement).reset();
    reload();
  };

  const openRisk = a.risks.find((r) => r.status === "Open");

  return (
    <>
      <div className="mb-2 text-xs text-slate-500">
        <Link href={`/projects/${a.project._id}`} className="hover:underline">{a.project.name}</Link> › {a.location}
      </div>
      <PageHeader
        title={a.name}
        subtitle={<>{a.code} · WBS {a.wbs || "-"} · Responsible: {a.responsible?.name || "-"} · Priority {a.priority}</>}
        actions={
          <>
            {manager && <Button variant="secondary" onClick={() => setModal("edit")}>Edit plan</Button>}
            {canUpdate && a.status !== "Completed" && <Button variant="secondary" onClick={() => setModal("blocker")}>Report blocker</Button>}
            {canUpdate && <Button onClick={() => setModal("update")}>Update progress</Button>}
          </>
        }
      />

      {openRisk && (
        <div className={`mb-5 rounded-xl border p-4 ${openRisk.severity === "High" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
          <div className="flex items-center gap-2 text-sm font-semibold"><SeverityBadge value={openRisk.severity} /> Early warning</div>
          <p className="mt-1 text-sm">⚠ {openRisk.message}</p>
          <p className="mt-1 text-xs text-slate-600">Escalated to {openRisk.escalatedTo?.name} ({openRisk.escalatedTo && ROLE_LABELS[openRisk.escalatedTo.role]}) · Expected impact +{openRisk.expectedImpactDays}d</p>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Plan vs actual" className="lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <StatusBadge value={a.status} /><HealthBadge value={a.health} />
            <span className="text-sm text-slate-600">{m.healthReason}</span>
          </div>
          <div className="mb-4">
            <div className="mb-1 flex justify-between text-xs text-slate-500"><span>Actual {m.actualProgress}%</span><span>Planned to date {m.plannedProgress}%</span></div>
            <Progress planned={m.plannedProgress} actual={m.actualProgress} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase text-slate-500"><th className="py-1">Measure</th><th>Planned</th><th>Actual / expected</th><th>Variance</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                <tr><td className="py-2">Progress</td><td>{m.plannedProgress}%</td><td>{m.actualProgress}%</td><td className={m.progressVariance < 0 ? "font-semibold text-red-600" : ""}>{signed(m.progressVariance, "%")}</td></tr>
                <tr><td className="py-2">Quantity</td><td>{a.plannedQuantity ? `${Math.round((a.plannedQuantity * m.plannedProgress) / 100)} / ${a.plannedQuantity} ${a.unit}` : "-"}</td><td>{a.plannedQuantity ? `${m.actualQuantity} ${a.unit}` : "-"}</td><td /></tr>
                <tr><td className="py-2">Start</td><td>{fmtDate(a.plannedStart)}</td><td>{fmtDate(m.actualStart || m.expectedStart)} {m.actualStart ? "(actual)" : "(expected)"}</td><td /></tr>
                <tr><td className="py-2">Finish</td><td>{fmtDate(a.plannedFinish)}</td><td>{fmtDate(m.actualFinish || m.expectedFinish)} {m.actualFinish ? "(actual)" : "(current expected)"}</td><td className={m.scheduleVarianceDays > 0 ? "font-semibold text-red-600" : ""}>{signed(m.scheduleVarianceDays, " days")}</td></tr>
                <tr><td className="py-2">Duration</td><td>{a.plannedDuration} days</td><td /><td /></tr>
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Dependencies & impact">
          <div className="space-y-4 text-sm">
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-slate-500">Depends on (Finish → Start)</div>
              {a.predecessors.length === 0 ? <div className="text-slate-400">None</div> : a.predecessors.map((p) => (
                <Link key={p.dependencyId} href={`/activities/${p.activity._id}`} className="flex items-center justify-between rounded px-1 py-1 hover:bg-slate-50">
                  <span>{p.activity.name} <span className="text-xs text-slate-400">{p.activity.code}</span></span><HealthBadge value={p.activity.health} />
                </Link>
              ))}
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-slate-500">Affects downstream</div>
              {a.successors.length === 0 ? <div className="text-slate-400">None</div> : a.successors.map((s) => (
                <Link key={s.dependencyId} href={`/activities/${s.activity._id}`} className="flex items-center justify-between rounded px-1 py-1 hover:bg-slate-50">
                  <span>
                    {s.activity.name} <span className="text-xs text-slate-400">{s.activity.code}</span>
                    {s.activity.metrics?.scheduleVarianceDays > 0 && <span className="ml-1 text-xs font-semibold text-red-600">+{s.activity.metrics.scheduleVarianceDays}d</span>}
                  </span>
                  <HealthBadge value={s.activity.health} />
                </Link>
              ))}
            </div>
            {m.impactedBy.length > 0 && (
              <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
                Impacted by upstream: {m.impactedBy.map((i) => `${i.name} (+${i.delayDays}d)`).join(", ")}
              </div>
            )}
            {openRisk && openRisk.impacted.length > 0 && (
              <div className="rounded-lg bg-red-50 p-2 text-xs text-red-900">
                Potentially affected ({openRisk.impacted.length}): {openRisk.impacted.map((i) => `${i.name} +${i.delayDays}d`).join(", ")}
              </div>
            )}
          </div>
        </Card>

        <Card title={`Blockers (${a.blockers.length})`} className="lg:col-span-2">
          {a.blockers.length === 0 ? <Empty>No blockers reported.</Empty> : (
            <div className="space-y-3">{a.blockers.map((b) => <BlockerRow key={b._id} b={b} manager={manager} onChange={reload} />)}</div>
          )}
        </Card>

        <Card title="Risk & escalation history">
          {a.risks.length === 0 ? <Empty>No risks raised.</Empty> : (
            <div className="space-y-3 text-sm">
              {a.risks.map((r) => (
                <div key={r._id}>
                  <div className="flex items-center gap-2"><SeverityBadge value={r.severity} /><Badge tone={r.status === "Open" ? "red" : "slate"}>{r.status}</Badge></div>
                  <ol className="mt-1 space-y-1 border-l border-slate-200 pl-3 text-xs text-slate-600">
                    {r.history.map((h, i) => <li key={i}><span className="text-slate-400">{fmtDateTime(h.at)}</span> · <b>{h.event}</b>{h.message ? `: ${h.message}` : ""}</li>)}
                  </ol>
                </div>
              ))}
              {a.escalations.length > 0 && (
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase text-slate-500">Escalations</div>
                  {a.escalations.map((e) => (
                    <div key={e._id} className="text-xs text-slate-600">
                      {fmtDateTime(e.createdAt)} · <SeverityBadge value={e.severity} /> → {e.escalatedTo?.name} ({ROLE_LABELS[e.level]}) · {e.status}{e.acknowledgedBy ? ` by ${e.acknowledgedBy.name}` : ""}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>

        <TeamDataCards a={a} />

        <div className="lg:col-span-3">
          <div className="mb-3 flex gap-1 rounded-lg border border-slate-200 bg-white p-1 text-sm">
            {([["history", `Progress history (${a.history.length})`], ["execution", `Execution reports (${a.executionLogs.length})`], ["comments", `Comments & evidence (${a.comments.length + a.attachments.length})`], ["audit", "Audit trail"]] as const).map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} className={`flex-1 rounded-md px-3 py-1.5 ${tab === k ? "bg-slate-900 text-white" : "hover:bg-slate-50"}`}>{label}</button>
            ))}
          </div>
          {tab === "history" && (
            <Card>
              {a.history.length === 0 ? <Empty>No progress reported yet.</Empty> : (
                <Table head={["Date", "Planned", "Actual", "Variance", "Quantity", "Status", "Comment", "Reported by"]}>
                  {a.history.map((h) => (
                    <tr key={h._id}>
                      <Td className="whitespace-nowrap">{fmtDate(h.date)}</Td>
                      <Td>{h.plannedProgress}%</Td>
                      <Td className="font-semibold">{h.actualProgress}%</Td>
                      <Td className={h.actualProgress < h.plannedProgress ? "text-red-600" : ""}>{signed(h.actualProgress - h.plannedProgress, "%")}</Td>
                      <Td>{h.actualQuantity ?? "-"} {a.unit}</Td>
                      <Td>{h.status && <StatusBadge value={h.status} />}</Td>
                      <Td className="text-slate-600">{h.comment || "-"}</Td>
                      <Td className="text-slate-600">{h.reportedBy?.name}</Td>
                    </tr>
                  ))}
                </Table>
              )}
            </Card>
          )}
          {tab === "execution" && <Card><ExecutionReportsTable logs={a.executionLogs} unit={a.unit} /></Card>}
          {tab === "comments" && (
            <div className="grid gap-5 md:grid-cols-2">
              <Card title="Comments">
                <form onSubmit={addComment} className="mb-3 flex gap-2">
                  <Input placeholder="Add a comment…" value={comment} onChange={(e) => setComment(e.target.value)} />
                  <Button>Post</Button>
                </form>
                <ul className="space-y-3">
                  {a.comments.map((c) => (
                    <li key={c._id} className="text-sm">
                      <div className="text-xs text-slate-500"><b className="text-slate-700">{c.user?.name}</b> · {c.user && ROLE_LABELS[c.user.role]} · {fmtDateTime(c.createdAt)}</div>
                      <div>{c.text}</div>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card title="Evidence (photos / documents)">
                <form onSubmit={upload} className="mb-3 space-y-2">
                  <Input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                  <div className="flex gap-2"><Input placeholder="Caption" value={caption} onChange={(e) => setCaption(e.target.value)} /><Button disabled={!file}>Upload</Button></div>
                </form>
                {a.attachments.length === 0 ? <Empty>No evidence uploaded.</Empty> : (
                  <div className="grid grid-cols-2 gap-2">
                    {a.attachments.map((f) => (
                      <a key={f._id} href={`${API_URL}${f.url}`} target="_blank" rel="noreferrer" className="block rounded-lg border border-slate-200 p-1 text-xs hover:border-slate-400">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {f.mimetype.startsWith("image/") ? <img src={`${API_URL}${f.url}`} alt={f.caption || f.originalName} className="h-28 w-full rounded object-cover" /> : <div className="flex h-28 items-center justify-center bg-slate-50">📄</div>}
                        <div className="mt-1 truncate">{f.caption || f.originalName}</div>
                        <div className="text-slate-400">{f.uploadedBy?.name} · {fmtDate(f.createdAt)}</div>
                      </a>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}
          {tab === "audit" && (
            <Card>
              <Table head={["When", "User", "Action", "Field", "Previous", "New", "Comment"]}>
                {a.auditLogs.map((l) => (
                  <tr key={l._id}>
                    <Td className="whitespace-nowrap text-slate-500">{fmtDateTime(l.createdAt)}</Td>
                    <Td>{l.userName}</Td>
                    <Td className="font-medium">{l.action}</Td>
                    <Td className="text-slate-500">{l.field || "-"}</Td>
                    <Td className="max-w-40 truncate">{display(l.previousValue)}</Td>
                    <Td className="max-w-40 truncate">{display(l.newValue)}</Td>
                    <Td className="max-w-64 text-slate-600">{l.comment || "-"}</Td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}
        </div>
      </div>

      <Modal open={modal === "update"} onClose={() => setModal("")} title="Daily actual update">
        <ProgressUpdateForm activity={{ _id: a._id, name: a.name, plannedQuantity: a.plannedQuantity, unit: a.unit, actualProgress: m.actualProgress }} onDone={done} />
      </Modal>
      <Modal open={modal === "blocker"} onClose={() => setModal("")} title={`Report blocker · ${a.name}`}>
        <BlockerForm activityId={a._id} onDone={done} />
      </Modal>
      <Modal open={modal === "edit"} onClose={() => setModal("")} title="Edit plan">
        <EditPlanForm a={a} onDone={done} />
      </Modal>
    </>
  );
}
