"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { BuildingModel } from "@/lib/types";
import { Button, Card } from "@/components/ui";

const CAN_UPLOAD = ["admin", "project_manager", "site_manager", "planning_engineer"];

// Upload a DWG / DXF floor plan; the 3D model is rebuilt from it with rooms and furniture.
export function FloorplanUpload({ model, onModel }: { model: BuildingModel; onModel: (m: BuildingModel) => void }) {
  const { user } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [floors, setFloors] = useState("");
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const plan = model.floorplan;
  const typical = plan?.stats?.typical;

  if (!user || !CAN_UPLOAD.includes(user.role)) return null;

  const submit = async () => {
    if (!file) return;
    setBusy("upload");
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      if (floors) body.append("floorCount", floors);
      onModel(await api<BuildingModel>(`/building/projects/${model.project.id}/floorplan`, { method: "POST", body }));
      setFile(null);
      setFloors("");
      if (input.current) input.current.value = "";
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!window.confirm("Go back to the default City Life model?")) return;
    setBusy("remove");
    setError(null);
    try {
      onModel(await api<BuildingModel>(`/building/projects/${model.project.id}/floorplan`, { method: "DELETE" }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card title="Generate from floor plan" className="mb-4">
      <div className="flex flex-wrap items-end gap-3 text-xs">
        <label className="flex flex-col gap-1">
          <span className="text-slate-500">Floor plan (DWG or DXF)</span>
          <input
            ref={input}
            type="file"
            accept=".dwg,.dxf"
            className="max-w-72 text-xs file:mr-2 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-slate-500">Floors above ground</span>
          <input
            type="number"
            min={1}
            max={120}
            placeholder={plan ? String(plan.floorCount) : "from drawing"}
            value={floors}
            onChange={(e) => setFloors(e.target.value)}
            className="w-28 rounded border px-2 py-1"
          />
        </label>
        <Button onClick={submit} disabled={!file || busy !== null}>{busy === "upload" ? "Generating…" : "Generate 3D building"}</Button>
        {plan && <Button variant="ghost" onClick={remove} disabled={busy !== null}>{busy === "remove" ? "Removing…" : "Use default model"}</Button>}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {plan && typical && (
        <p className="mt-3 text-xs text-slate-600">
          Built from <b>{plan.source?.originalName}</b>: {plan.floorCount} floors, plate {typical.widthM} × {typical.depthM} m,{" "}
          {typical.flats} flats, {typical.rooms} rooms, {typical.furniture} furniture items, {typical.openings} doors and windows
          {plan.stats.refuge ? `, plus a separate refuge floor plan (floors ${plan.floors.refuge.join(", ")})` : ""}.
        </p>
      )}
      {!plan && (
        <p className="mt-3 text-xs text-slate-500">
          Upload the architect&apos;s typical floor plan. Walls, doors, windows, rooms and the furniture drawn in each flat are read from the drawing and
          stacked into floors. Where a room has no furniture drawn, a standard layout is added. DWG files are converted on the server.
        </p>
      )}
    </Card>
  );
}
