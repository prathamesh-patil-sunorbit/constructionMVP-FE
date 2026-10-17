"use client";

import { useMemo } from "react";
import type { Room } from "@/lib/building-geo";
import { Boxes, rnd, type Box } from "./schedule-4d-scene";

// Show-flat furnishing for the rooms traced from the floor plans: floor finish per room, partition
// walls with door gaps, and furniture sized to the room (beds, wardrobes, sofas, dining sets, kitchen
// counters, WC and basin, balcony seating, washing machine). Everything is placed relative to the
// room's walls, so it follows each flat's real layout and mirroring.

const COLORS = {
  wood: "#b9935f", tile: "#ebe6dc", wet: "#cdd5d8", deck: "#b39b80",
  partition: "#f3efe9", skirting: "#cfc6b8",
  bedFrame: "#7a5233", mattress: "#f6f3ee", pillow: "#ffffff", blanket0: "#5b7a99", blanket1: "#a65d3a", blanket2: "#3f7d6e",
  wardrobe: "#d2bb98", sideTable: "#6e4b30",
  sofa: "#7d8792", cushion: "#d8a75a", coffee: "#6b4a2f", tvUnit: "#3a3a3a", tv: "#0f1115", rug: "#cbbba2",
  table: "#6f4a2e", chair: "#3d2b1f",
  cabinet: "#e8e3da", counter: "#2e2e33", fridge: "#cfd4da", hob: "#18181b",
  porcelain: "#fbfbfb", vanity: "#8a6a4d", mirror: "#c9d6dd",
  outdoorChair: "#5b4636", pot: "#8b5a2b", plant: "#3f7d20", washer: "#f2f3f5",
} as const;
type C = keyof typeof COLORS;

class Kit {
  out = new Map<C, Box[]>();
  glass: Box[] = [];
  add(c: C, b: Box) { (this.out.get(c) ?? this.out.set(c, []).get(c)!).push(b); }
}

/** A room seen from its own "back" wall: u runs along that wall, v away from it into the room. */
function frameOf(r: Room, back: "x0" | "x1" | "z0" | "z1") {
  const alongX = back === "z0" || back === "z1";
  const len = alongX ? r.x1 - r.x0 : r.z1 - r.z0; // along the back wall
  const deep = alongX ? r.z1 - r.z0 : r.x1 - r.x0; // into the room
  const cu = alongX ? (r.x0 + r.x1) / 2 : (r.z0 + r.z1) / 2;
  const sign = back === "x0" || back === "z0" ? 1 : -1;
  const base = r[back];
  // world centre of an item at u (from the middle of the back wall) and v (from the back wall), size su x sv
  const at = (u: number, v: number, su: number, sv: number, y: number, h: number): Box => alongX
    ? [cu + u, y + h / 2, base + sign * (v + sv / 2), su, h, sv]
    : [base + sign * (v + sv / 2), y + h / 2, cu + u, sv, h, su];
  return { len, deep, at };
}

/** The wall of the room farthest from the flat's centre (usually the outside wall). */
function farWall(r: Room, cx: number, cz: number, longOnly = false): "x0" | "x1" | "z0" | "z1" {
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  const mx = (r.x0 + r.x1) / 2;
  const mz = (r.z0 + r.z1) / 2;
  const xs: ["x0" | "x1", number] = mx < cx ? ["x0", cx - r.x0] : ["x1", r.x1 - cx];
  const zs: ["z0" | "z1", number] = mz < cz ? ["z0", cz - r.z0] : ["z1", r.z1 - cz];
  if (longOnly) return w >= d ? zs[0] : xs[0];
  return xs[1] / Math.max(1, w) > zs[1] / Math.max(1, d) ? xs[0] : zs[0];
}

const opposite = { x0: "x1", x1: "x0", z0: "z1", z1: "z0" } as const;

function floorFinish(k: Kit, r: Room, y: number) {
  const c: C = r.type === "bed" ? "wood" : r.type === "toilet" || r.type === "kitchen" || r.type === "dry" ? "wet" : r.type === "balcony" ? "deck" : "tile";
  k.add(c, [(r.x0 + r.x1) / 2, y + 0.02, (r.z0 + r.z1) / 2, r.x1 - r.x0 - 0.02, 0.04, r.z1 - r.z0 - 0.02]);
}

/** Partition walls around closed rooms, with a door opening on the side facing the flat's centre. */
function partitions(k: Kit, r: Room, y: number, cx: number, cz: number) {
  if (!["bed", "toilet", "kitchen"].includes(r.type)) return;
  const H = 1.4; // cut like a plan section so the rooms stay visible from above
  const T = 0.11;
  const door = farWall(r, cx, cz) ;
  const doorSide = opposite[door];
  const sides: { s: "x0" | "x1" | "z0" | "z1"; horizontal: boolean }[] = [{ s: "z0", horizontal: true }, { s: "z1", horizontal: true }, { s: "x0", horizontal: false }, { s: "x1", horizontal: false }];
  for (const { s, horizontal } of sides) {
    const a = horizontal ? r.x0 : r.z0;
    const b = horizontal ? r.x1 : r.z1;
    const at = r[s] + (s === "x0" || s === "z0" ? T / 2 + 0.04 : -T / 2 - 0.04);
    const pieces: [number, number][] = [];
    if (s === doorSide && b - a > 1.4) {
      const mid = (a + b) / 2;
      pieces.push([a, mid - 0.45], [mid + 0.45, b]);
    } else pieces.push([a, b]);
    for (const [p, q] of pieces) {
      if (q - p < 0.05) continue;
      k.add("partition", horizontal ? [(p + q) / 2, y + H / 2, at, q - p, H, T] : [at, y + H / 2, (p + q) / 2, T, H, q - p]);
    }
  }
}

function furnishRoom(k: Kit, r: Room, y: number, cx: number, cz: number, seed: number) {
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  if (w < 0.6 || d < 0.6) return;
  switch (r.type) {
    case "bed": {
      // Headboard on the inner long wall, window wall to the side; wardrobe on the wall facing the bed.
      const back = opposite[farWall(r, cx, cz, true)];
      const f = frameOf(r, back);
      const bw = Math.min(1.8, f.len - 1.3);
      const bl = Math.min(2.05, f.deep - 0.9);
      if (bw < 0.9 || bl < 1.4) break;
      k.add("bedFrame", f.at(0, 0, bw + 0.1, 0.08, y, 1.05)); // headboard
      k.add("bedFrame", f.at(0, 0.08, bw, bl, y, 0.32));
      k.add("mattress", f.at(0, 0.1, bw - 0.06, bl - 0.06, y + 0.32, 0.2));
      k.add((["blanket0", "blanket1", "blanket2"] as C[])[Math.floor(rnd(seed) * 3)], f.at(0, 0.1 + bl * 0.42, bw - 0.02, bl * 0.56, y + 0.52, 0.06));
      k.add("pillow", f.at(-bw / 4, 0.2, bw / 2 - 0.12, 0.38, y + 0.52, 0.12));
      k.add("pillow", f.at(bw / 4, 0.2, bw / 2 - 0.12, 0.38, y + 0.52, 0.12));
      for (const s of [-1, 1]) if (f.len - bw > 1.1) k.add("sideTable", f.at(s * (bw / 2 + 0.3), 0.02, 0.45, 0.42, y, 0.5));
      const ward = Math.min(2.0, f.len - 1.1);
      if (f.deep - bl > 1.25 && ward > 0.8) k.add("wardrobe", f.at(-(f.len - ward) / 2 + 0.05, f.deep - 0.62, ward, 0.58, y, 2.1));
      k.add("rug", f.at(0, bl * 0.6, bw + 0.6, 1.0, y + 0.04, 0.015));
      break;
    }
    case "living": {
      // Sofa against the far wall, TV unit opposite, coffee table and rug between.
      const back = farWall(r, cx, cz, true);
      const f = frameOf(r, back);
      const sl = Math.min(2.4, f.len - 0.8);
      if (sl > 1.2 && f.deep > 2.4) {
        k.add("sofa", f.at(0, 0.05, sl, 0.85, y, 0.42));
        k.add("sofa", f.at(0, 0.05, sl, 0.22, y + 0.42, 0.42)); // backrest
        for (const s of [-1, 1]) k.add("sofa", f.at(s * (sl / 2 - 0.1), 0.05, 0.2, 0.85, y + 0.42, 0.2)); // arms
        k.add("cushion", f.at(-sl / 4, 0.25, 0.42, 0.14, y + 0.5, 0.36));
        k.add("cushion", f.at(sl / 4, 0.25, 0.42, 0.14, y + 0.5, 0.36));
        k.add("rug", f.at(0, 1.0, sl, Math.min(1.8, f.deep - 2.2), y + 0.04, 0.015));
        k.add("coffee", f.at(0, 1.25, 1.1, 0.6, y, 0.4));
        k.add("tvUnit", f.at(0, f.deep - 0.45, Math.min(1.8, f.len - 0.6), 0.42, y, 0.5));
        k.add("tv", f.at(0, f.deep - 0.2, 1.25, 0.06, y + 0.95, 0.72));
      }
      break;
    }
    case "dining": {
      const cxr = (r.x0 + r.x1) / 2;
      const czr = (r.z0 + r.z1) / 2;
      const tl = Math.min(1.5, Math.max(w, d) - 1.4);
      const tw = Math.min(0.9, Math.min(w, d) - 1.2);
      if (tl < 0.7 || tw < 0.6) break;
      const alongX = w >= d;
      const [sx, sz] = alongX ? [tl, tw] : [tw, tl];
      k.add("table", [cxr, y + 0.72, czr, sx, 0.05, sz]);
      k.add("table", [cxr, y + 0.36, czr, 0.12, 0.7, 0.12]);
      const seats = tl > 1.2 ? [-0.35, 0.35] : [0];
      for (const s of seats) for (const side of [-1, 1]) {
        const [x, z] = alongX ? [cxr + s * tl, czr + side * (tw / 2 + 0.32)] : [cxr + side * (tw / 2 + 0.32), czr + s * tl];
        k.add("chair", [x, y + 0.23, z, 0.42, 0.46, 0.42]);
        k.add("chair", alongX ? [x, y + 0.7, z + side * 0.19, 0.42, 0.5, 0.05] : [x + side * 0.19, y + 0.7, z, 0.05, 0.5, 0.42]);
      }
      break;
    }
    case "kitchen": {
      // L-shaped counter on the far long wall and one end, fridge at the other end.
      const back = farWall(r, cx, cz, true);
      const f = frameOf(r, back);
      const run = f.len - 0.7;
      k.add("cabinet", f.at(-0.35, 0, run, 0.6, y, 0.86));
      k.add("counter", f.at(-0.35, 0, run, 0.62, y + 0.86, 0.04));
      k.add("hob", f.at(-0.35 + run / 4, 0.12, 0.6, 0.4, y + 0.9, 0.02));
      k.add("cabinet", f.at(-0.35, 0, run, 0.35, y + 1.55, 0.7)); // wall units
      if (f.deep > 1.6) {
        k.add("cabinet", f.at(-f.len / 2 + 0.3, 0.6, 0.6, Math.min(1.2, f.deep - 1.5), y, 0.86));
        k.add("counter", f.at(-f.len / 2 + 0.3, 0.6, 0.62, Math.min(1.2, f.deep - 1.5), y + 0.86, 0.04));
      }
      k.add("fridge", f.at(f.len / 2 - 0.35, 0.02, 0.65, 0.65, y, 1.75));
      break;
    }
    case "toilet": {
      const back = farWall(r, cx, cz);
      const f = frameOf(r, back);
      k.add("porcelain", f.at(-f.len / 2 + 0.35, 0, 0.38, 0.55, y, 0.4)); // WC
      k.add("porcelain", f.at(-f.len / 2 + 0.35, 0, 0.42, 0.18, y + 0.4, 0.4)); // cistern
      k.add("vanity", f.at(f.len / 2 - 0.35, 0, 0.55, 0.42, y + 0.45, 0.35));
      k.add("porcelain", f.at(f.len / 2 - 0.35, 0.05, 0.42, 0.32, y + 0.8, 0.06)); // basin
      k.add("mirror", f.at(f.len / 2 - 0.35, 0, 0.5, 0.02, y + 1.15, 0.7));
      if (f.deep > 1.8) k.glass.push(f.at(0, f.deep * 0.55, f.len - 0.1, 0.03, y, 1.9)); // shower screen
      break;
    }
    case "balcony": {
      if (Math.min(w, d) < 1.0) { k.add("pot", [(r.x0 + r.x1) / 2, y + 0.25, (r.z0 + r.z1) / 2, 0.45, 0.5, 0.45]); k.add("plant", [(r.x0 + r.x1) / 2, y + 0.75, (r.z0 + r.z1) / 2, 0.6, 0.55, 0.6]); break; }
      const cxr = (r.x0 + r.x1) / 2;
      const czr = (r.z0 + r.z1) / 2;
      k.add("coffee", [cxr, y + 0.25, czr, 0.5, 0.5, 0.5]);
      for (const s of [-1, 1]) {
        const [x, z] = w >= d ? [cxr + s * 0.75, czr] : [cxr, czr + s * 0.75];
        k.add("outdoorChair", [x, y + 0.22, z, 0.55, 0.44, 0.55]);
      }
      const [px, pz] = w >= d ? [r.x0 + 0.35, czr] : [cxr, r.z0 + 0.35];
      k.add("pot", [px, y + 0.25, pz, 0.45, 0.5, 0.45]);
      k.add("plant", [px, y + 0.8, pz, 0.6, 0.6, 0.6]);
      break;
    }
    case "dry": {
      k.add("washer", [r.x0 + 0.4, y + 0.43, (r.z0 + r.z1) / 2, 0.6, 0.85, 0.6]);
      break;
    }
    case "lobby": {
      const back = farWall(r, cx, cz);
      const f = frameOf(r, back);
      if (f.len > 1) k.add("sideTable", f.at(0, 0, Math.min(1.2, f.len - 0.3), 0.35, y, 0.9)); // shoe cabinet
      break;
    }
  }
}

export function Furnishing({ rooms, y, flats }: { rooms: Room[]; y: number; flats: Set<string> }) {
  const kit = useMemo(() => {
    const k = new Kit();
    const centres = new Map<string, [number, number]>();
    for (const u of new Set(rooms.map((r) => r.unit))) {
      const rs = rooms.filter((r) => r.unit === u);
      centres.set(u, [rs.reduce((n, r) => n + (r.x0 + r.x1) / 2, 0) / rs.length, rs.reduce((n, r) => n + (r.z0 + r.z1) / 2, 0) / rs.length]);
    }
    rooms.forEach((r, i) => {
      if (!flats.has(r.unit)) return; // refuge area stays empty
      const [cx, cz] = centres.get(r.unit)!;
      floorFinish(k, r, y);
      partitions(k, r, y, cx, cz);
      furnishRoom(k, r, y + 0.04, cx, cz, i + 7);
    });
    return k;
  }, [rooms, y, flats]);
  return (
    <group>
      {[...kit.out.entries()].map(([c, items]) => (
        <Boxes key={c} items={items} color={COLORS[c]} roughness={c === "tv" || c === "mirror" || c === "counter" ? 0.25 : c === "porcelain" ? 0.3 : 0.75} shadows={c !== "rug"} />
      ))}
      <Boxes items={kit.glass} color="#cfe8f2" roughness={0.1} transparent opacity={0.35} shadows={false} />
    </group>
  );
}
