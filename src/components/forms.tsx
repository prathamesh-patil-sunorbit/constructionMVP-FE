"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { todayInput } from "@/lib/format";
import { BLOCKER_TYPES, SEVERITIES } from "@/lib/types";
import { Button, ErrorBox, Field, Input, Select, Textarea } from "./ui";

interface ActivityLite {
  _id: string;
  name: string;
  plannedQuantity?: number;
  unit?: string;
  actualProgress?: number;
}

function BlockerFields({ value, onChange }: { value: BlockerInput; onChange: (v: BlockerInput) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Blocker type">
        <Select value={value.type} onChange={(e) => onChange({ ...value, type: e.target.value })}>
          {BLOCKER_TYPES.map((t) => <option key={t}>{t}</option>)}
        </Select>
      </Field>
      <Field label="Severity">
        <Select value={value.severity} onChange={(e) => onChange({ ...value, severity: e.target.value })}>
          {SEVERITIES.map((s) => <option key={s}>{s}</option>)}
        </Select>
      </Field>
      <div className="col-span-2">
        <Field label="Description"><Textarea rows={2} required value={value.description} onChange={(e) => onChange({ ...value, description: e.target.value })} placeholder="e.g. Shuttering material unavailable" /></Field>
      </div>
      <Field label="Expected resolution"><Input type="date" value={value.expectedResolution} onChange={(e) => onChange({ ...value, expectedResolution: e.target.value })} /></Field>
    </div>
  );
}

interface BlockerInput { type: string; severity: string; description: string; expectedResolution: string }
const emptyBlocker = (): BlockerInput => ({ type: "Material", severity: "Medium", description: "", expectedResolution: "" });

export function ProgressUpdateForm({ activity, onDone }: { activity: ActivityLite; onDone: () => void }) {
  const [date, setDate] = useState(todayInput());
  const [mode, setMode] = useState<"percent" | "quantity">(activity.plannedQuantity ? "quantity" : "percent");
  const [percent, setPercent] = useState(String(activity.actualProgress ?? 0));
  const [qty, setQty] = useState("");
  const [status, setStatus] = useState("");
  const [comment, setComment] = useState("");
  const [blocker, setBlocker] = useState(emptyBlocker());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const derived = mode === "quantity" && qty && activity.plannedQuantity ? Math.min(100, Math.round((Number(qty) / activity.plannedQuantity) * 100)) : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/activities/${activity._id}/progress`, {
        method: "POST",
        json: {
          date, comment, status: status || undefined,
          ...(mode === "quantity" ? { actualQuantity: qty } : { actualProgress: percent }),
          ...(status === "Blocked" ? { blocker } : {}),
        },
      });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="text-sm text-slate-600">
        <span className="font-medium text-slate-900">{activity.name}</span>
        {activity.plannedQuantity ? <> · Planned {activity.plannedQuantity} {activity.unit}</> : null}
        <> · Last reported {activity.actualProgress ?? 0}%</>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><Input type="date" value={date} max={todayInput()} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Report as">
          <Select value={mode} onChange={(e) => setMode(e.target.value as "percent" | "quantity")}>
            <option value="percent">Cumulative %</option>
            {activity.plannedQuantity ? <option value="quantity">Cumulative quantity ({activity.unit})</option> : null}
          </Select>
        </Field>
        {mode === "percent" ? (
          <Field label="Actual progress (%)"><Input type="number" min={0} max={100} required value={percent} onChange={(e) => setPercent(e.target.value)} /></Field>
        ) : (
          <Field label={`Actual quantity (${activity.unit})`} hint={derived !== null ? `= ${derived}% complete` : undefined}>
            <Input type="number" min={0} step="any" required value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
        )}
        <Field label="Status (optional)">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Auto (rules engine)</option>
            <option>In Progress</option>
            <option>Completed</option>
            <option value="Blocked">Blocked: report a blocker</option>
          </Select>
        </Field>
      </div>
      {status === "Blocked" && (
        <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-3">
          <BlockerFields value={blocker} onChange={setBlocker} />
        </div>
      )}
      <Field label="Comment"><Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="e.g. Material received late." /></Field>
      <ErrorBox message={error} />
      <div className="flex justify-end"><Button disabled={busy}>{busy ? "Saving…" : "Submit update"}</Button></div>
    </form>
  );
}

export function BlockerForm({ activityId, onDone }: { activityId: string; onDone: () => void }) {
  const [blocker, setBlocker] = useState(emptyBlocker());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/blockers", { method: "POST", json: { activity: activityId, ...blocker } });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <BlockerFields value={blocker} onChange={setBlocker} />
      <ErrorBox message={error} />
      <div className="flex justify-end"><Button variant="danger" disabled={busy}>Report blocker</Button></div>
    </form>
  );
}
