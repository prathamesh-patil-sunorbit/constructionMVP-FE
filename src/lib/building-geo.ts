// A wing's floor plate in metres from the traced drawing: the flat and core rectangles, which of
// their edges are the outside of the building (walls with windows, or balconies), and column points.

import type { BuildingProfile, ProfileUnit, RoomType, Side } from "./types";

export interface Rect { x0: number; z0: number; x1: number; z1: number }
export interface PlanRect extends Rect { kind: "unit" | "core"; unit?: ProfileUnit; name?: string }
export interface Room extends Rect { type: RoomType; name?: string; unit: string }
export interface Seg { x0: number; z0: number; x1: number; z1: number; nx: number; nz: number; kind: "wall" | "balcony"; unit?: string }
export interface WingGeo {
  key: string; // "A", "B"
  mirror: boolean;
  rects: PlanRect[];
  segs: Seg[];
  columns: [number, number][];
  bbox: Rect;
  depth: number; // north-south size of one wing
  width: number;
  centerZ: number; // where the wing's plan centre sits
  rooms: Room[];
}

const SIDE_NORMAL: Record<Side, [number, number]> = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] };
const FLIP: Record<Side, Side> = { N: "S", S: "N", E: "E", W: "W" };

/** Wing letter from a tower name: "A-Wing" -> "A". */
export const wingKey = (name: string) => (/^([A-Z])\b|^([A-Z])-/i.exec(name)?.slice(1).find(Boolean) ?? name).toUpperCase();

export function wingGeometry(p: BuildingProfile, key: string, index: number, count: number): WingGeo {
  const s = p.pxToM;
  const cx = (p.plan.x0 + p.plan.x1) / 2;
  const cy = (p.plan.y0 + p.plan.y1) / 2;
  const width = (p.plan.x1 - p.plan.x0) * s;
  const depth = (p.plan.y1 - p.plan.y0) * s;
  const mirror = p.wings[key]?.mirror ?? index % 2 === 1;
  // Wings stand back to back north-south: the first to the north, the next to the south.
  const offset = (index - (count - 1) / 2) * (depth + p.wingGapM);
  const X = (px: number) => (px - cx) * s;
  const Z = (py: number) => (mirror ? -(py - cy) : py - cy) * s + offset;
  const rect = (r: [number, number, number, number]): Rect => {
    const [a, b] = [Z(r[1]), Z(r[3])];
    return { x0: X(r[0]), x1: X(r[2]), z0: Math.min(a, b), z1: Math.max(a, b) };
  };
  const rects: PlanRect[] = [
    ...p.units.map((u) => ({ ...rect(u.rect), kind: "unit" as const, unit: u })),
    ...p.core.map((c) => ({ ...rect(c.rect), kind: "core" as const, name: c.name })),
  ];
  const inside = (x: number, z: number) => rects.some((r) => x > r.x0 - 1e-6 && x < r.x1 + 1e-6 && z > r.z0 - 1e-6 && z < r.z1 + 1e-6);

  // Walk every edge of every flat; the parts with nothing outside them are the facade.
  const segs: Seg[] = [];
  const STEP = 0.25;
  for (const r of rects) {
    if (r.kind !== "unit") continue;
    const u = r.unit!;
    const balconies = u.balconies.map((b) => {
      const side = mirror ? FLIP[b.side] : b.side;
      const along = b.side === "N" || b.side === "S" ? [X(b.from), X(b.to)] : [Z(b.from), Z(b.to)];
      return { side, a: Math.min(...along), b: Math.max(...along) };
    });
    const edges: { side: Side; fixed: number; a: number; b: number }[] = [
      { side: "N", fixed: r.z0, a: r.x0, b: r.x1 },
      { side: "S", fixed: r.z1, a: r.x0, b: r.x1 },
      { side: "W", fixed: r.x0, a: r.z0, b: r.z1 },
      { side: "E", fixed: r.x1, a: r.z0, b: r.z1 },
    ];
    for (const e of edges) {
      const [nx, nz] = SIDE_NORMAL[e.side];
      let run: { a: number; kind: Seg["kind"] } | null = null;
      const flush = (end: number) => {
        if (run && end - run.a > 0.6) {
          const horizontal = e.side === "N" || e.side === "S";
          segs.push(horizontal
            ? { x0: run.a, x1: end, z0: e.fixed, z1: e.fixed, nx, nz, kind: run.kind, unit: u.no }
            : { x0: e.fixed, x1: e.fixed, z0: run.a, z1: end, nx, nz, kind: run.kind, unit: u.no });
        }
        run = null;
      };
      for (let t = e.a; t <= e.b + 1e-6; t += STEP) {
        const px = e.side === "N" || e.side === "S" ? t : e.fixed + nx * 0.2;
        const pz = e.side === "N" || e.side === "S" ? e.fixed + nz * 0.2 : t;
        const outside = !inside(px, pz);
        const kind: Seg["kind"] = balconies.some((b) => b.side === e.side && t >= b.a && t <= b.b) ? "balcony" : "wall";
        if (!outside) { flush(t); continue; }
        if (run && run.kind !== kind) flush(t);
        if (!run) run = { a: t, kind };
      }
      flush(e.b);
    }
  }

  // Columns: rectangle corners plus points along long edges (about every 4.5 m), shared points merged.
  const seen = new Set<string>();
  const columns: [number, number][] = [];
  const add = (x: number, z: number) => {
    const k = `${Math.round(x * 2)}:${Math.round(z * 2)}`;
    if (seen.has(k)) return;
    seen.add(k);
    columns.push([x, z]);
  };
  for (const r of rects) {
    const nx = Math.max(1, Math.round((r.x1 - r.x0) / 4.5));
    const nz = Math.max(1, Math.round((r.z1 - r.z0) / 4.5));
    for (let i = 0; i <= nx; i++) { add(r.x0 + ((r.x1 - r.x0) * i) / nx, r.z0); add(r.x0 + ((r.x1 - r.x0) * i) / nx, r.z1); }
    for (let j = 1; j < nz; j++) { add(r.x0, r.z0 + ((r.z1 - r.z0) * j) / nz); add(r.x1, r.z0 + ((r.z1 - r.z0) * j) / nz); }
  }

  const bbox = {
    x0: Math.min(...rects.map((r) => r.x0)), x1: Math.max(...rects.map((r) => r.x1)),
    z0: Math.min(...rects.map((r) => r.z0)), z1: Math.max(...rects.map((r) => r.z1)),
  };
  const rooms: Room[] = p.units.flatMap((u) => (u.rooms ?? []).map((r) => ({ ...rect(r.rect), type: r.type, name: r.name, unit: u.no })));
  return { key, mirror, rects, segs, columns, bbox, depth, width, centerZ: offset, rooms };
}

/** Flats on a level: none below floor 1; refuge floors leave out the refuge flat(s). */
export function flatsOn(p: BuildingProfile, levelKey: string) {
  if (!/^F\d+$/.test(levelKey)) return [];
  const floor = Number(levelKey.slice(1));
  const refuge = p.refugeFloors.includes(floor);
  return p.units
    .filter((u) => !(refuge && p.refugeOmits.includes(u.no)))
    .map((u) => ({ ...u, flatNo: `${floor}${u.no}`, floor, refuge }));
}

export function floorKind(p: BuildingProfile, levelKey: string): "typical" | "refuge" | "unconfirmed" | null {
  if (!/^F\d+$/.test(levelKey)) return null;
  const f = Number(levelKey.slice(1));
  if (p.refugeFloors.includes(f)) return "refuge";
  if (p.typicalFloors.includes(f)) return "typical";
  return "unconfirmed";
}

/** The drawing sheet for a wing and floor (refuge sheet on refuge floors when there is one). */
export function drawingFor(p: BuildingProfile, key: string, levelKey: string) {
  const d = p.drawings?.[key];
  if (!d) return null;
  const refuge = floorKind(p, levelKey) === "refuge";
  return (refuge && d.refuge) || d.typical;
}

/** Map a point traced on the profile's plan (Wing A sheet pixels) onto a drawing sheet's pixels. */
export function toSheet(p: BuildingProfile, sheet: { bbox: [number, number, number, number]; mirrored: boolean }, ax: number, ay: number): [number, number] {
  const [bx0, by0, bx1, by1] = sheet.bbox;
  const sx = (bx1 - bx0) / (p.plan.x1 - p.plan.x0);
  const sy = (by1 - by0) / (p.plan.y1 - p.plan.y0);
  return [bx0 + (ax - p.plan.x0) * sx, sheet.mirrored ? by1 - (ay - p.plan.y0) * sy : by0 + (ay - p.plan.y0) * sy];
}
