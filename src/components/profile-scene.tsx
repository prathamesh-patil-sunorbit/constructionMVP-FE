"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Edges, OrbitControls, Sky, useTexture } from "@react-three/drei";
import { CanvasTexture, RepeatWrapping, SRGBColorSpace, Vector3 } from "three";
import type { BuildingProfile, Level4D, Model4D } from "@/lib/types";
import { levelState, type LevelState, type Mode } from "@/lib/four-d";
import { drawingFor, flatsOn, toSheet, wingGeometry, wingKey, type Rect, type Seg, type WingGeo } from "@/lib/building-geo";
import { Boxes, Crane, RANK, SLAB, rnd, useTextures, type Box, type Pick } from "./schedule-4d-scene";
import { Furnishing } from "./furnish";

// The real building: each wing's floor plate traced from the drawings, built up level by level in
// the state the schedule says it is in on the date, finished with the facade from the renders
// (light walls, copper fins, jali panels, louvered podium, copper crown).

const P = () => ({
  concrete: [] as Box[], fresh: [] as Box[], brick: [] as Box[], plaster: [] as Box[], facade: [] as Box[], band: [] as Box[],
  copper: [] as Box[], jali: [] as Box[], crownJali: [] as Box[], louver: [] as Box[], glass: [] as Box[], frame: [] as Box[], railing: [] as Box[],
  scaffold: [] as Box[], plank: [] as Box[], formwork: [] as Box[], rebar: [] as Box[], vest: [] as Box[], helmet: [] as Box[],
});
type Parts = ReturnType<typeof P>;

const BASEMENT_H = 3.4;
const TERRACE_H = 1.2;
const ABOVE_H = 5;

function heightOf(p: BuildingProfile, l: Level4D) {
  return l.kind === "basement" ? BASEMENT_H : l.kind === "podium" ? p.podiumHeightM : l.kind === "terrace" ? TERRACE_H : l.kind === "above" ? ABOVE_H : p.floorHeightM;
}

// Wall material by stage: brick, then plaster, then the painted facade.
const wallOf = (parts: Parts, r: number) => (r >= 6 ? parts.facade : r >= 4 ? parts.plaster : parts.brick);

/** A wall along a facade segment with windows bay by bay (or a plain wall when `windows` is false). */
function wallRun(parts: Parts, s: Seg, y: number, h: number, r: number, opts: { windows: boolean; inset?: number }) {
  const horizontal = s.z0 === s.z1;
  const a = horizontal ? s.x0 : s.z0;
  const b = horizontal ? s.x1 : s.z1;
  const fixed = (horizontal ? s.z0 : s.x0) - (horizontal ? s.nz : s.nx) * (opts.inset ?? 0);
  const len = b - a;
  const wallH = h - SLAB;
  const mat = wallOf(parts, r);
  const place = (along: number, yc: number, l: number, hh: number, m: Box[], depth = 0.22) => {
    if (horizontal) m.push([along, yc, fixed, l, hh, depth]);
    else m.push([fixed, yc, along, depth, hh, l]);
  };
  if (!opts.windows) { place((a + b) / 2, y + wallH / 2, len, wallH, mat); return; }
  const bays = Math.max(1, Math.round(len / 3.3));
  const bay = len / bays;
  const sill = 0.9;
  const winH = Math.min(1.5, wallH - sill - 0.3);
  for (let i = 0; i < bays; i++) {
    const mid = a + bay * (i + 0.5);
    const win = bay * 0.52;
    const pier = (bay - win) / 2;
    place(mid, y + sill / 2, bay, sill, mat);
    place(mid, y + sill + winH + (wallH - sill - winH) / 2, bay, wallH - sill - winH, mat);
    place(mid - win / 2 - pier / 2, y + sill + winH / 2, pier, winH, mat);
    place(mid + win / 2 + pier / 2, y + sill + winH / 2, pier, winH, mat);
    if (r >= 5) {
      place(mid, y + sill + winH / 2, win, winH, parts.glass, 0.08);
      place(mid, y + sill + winH / 2, 0.06, winH, parts.frame, 0.12);
    }
  }
}

function rectProps(parts: Parts, rc: Rect, yBot: number, yTop: number) {
  for (let x = rc.x0 + 1; x < rc.x1; x += 2.4) for (let z = rc.z0 + 1; z < rc.z1; z += 2.4) parts.scaffold.push([x, (yBot + yTop) / 2, z, 0.06, yTop - yBot, 0.06]);
}

function scaffoldRing(parts: Parts, bb: Rect, y: number, h: number, skip?: "N" | "S") {
  const off = 1.3;
  const r = { x0: bb.x0 - off, x1: bb.x1 + off, z0: bb.z0 - off, z1: bb.z1 + off };
  const W = r.x1 - r.x0;
  const D = r.z1 - r.z0;
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  for (let x = r.x0; x <= r.x1 + 0.01; x += 2.5) {
    if (skip !== "N") parts.scaffold.push([x, y + h / 2, r.z0, 0.07, h, 0.07]);
    if (skip !== "S") parts.scaffold.push([x, y + h / 2, r.z1, 0.07, h, 0.07]);
  }
  for (let z = r.z0; z <= r.z1 + 0.01; z += 2.5) parts.scaffold.push([r.x0, y + h / 2, z, 0.07, h, 0.07], [r.x1, y + h / 2, z, 0.07, h, 0.07]);
  for (const ly of [y + 0.1, y + h / 2, y + h - 0.1]) {
    if (skip !== "N") parts.scaffold.push([cx, ly, r.z0, W, 0.06, 0.06]);
    if (skip !== "S") parts.scaffold.push([cx, ly, r.z1, W, 0.06, 0.06]);
    parts.scaffold.push([r.x0, ly, cz, 0.06, 0.06, D], [r.x1, ly, cz, 0.06, 0.06, D]);
  }
  if (skip !== "N") parts.plank.push([cx, y + 0.12, r.z0 + 0.45, W, 0.05, 0.85]);
  if (skip !== "S") parts.plank.push([cx, y + 0.12, r.z1 - 0.45, W, 0.05, 0.85]);
}

function workers(parts: Parts, rc: Rect, y: number, n: number, seed: number) {
  for (let i = 0; i < n; i++) {
    const x = rc.x0 + 1.5 + rnd(seed + i) * (rc.x1 - rc.x0 - 3);
    const z = rc.z0 + 1.5 + rnd(seed * 7 + i) * (rc.z1 - rc.z0 - 3);
    parts.vest.push([x, y + 0.7, z, 0.42, 1.0, 0.3]);
    parts.helmet.push([x, y + 1.45, z, 0.3, 0.22, 0.3]);
  }
}

/** Structure common to every level: columns rising, then props + deck + rebar, then the slab. */
function frame(parts: Parts, rects: Rect[], columns: [number, number][], st: LevelState, y: number, h: number, seed: number, cut = false) {
  const casting = st.phase === "casting";
  const deck = casting && st.progress >= 0.5;
  const colH = casting ? (h - SLAB) * Math.min(1, st.progress * 2) : h - SLAB;
  const top = y + h;
  for (const [cx, cz] of columns) {
    (casting ? parts.fresh : parts.concrete).push([cx, y + colH / 2, cz, 0.45, colH, 0.6]);
    if (casting && !deck) parts.rebar.push([cx, y + colH + 0.6, cz, 0.06, 1.2, 0.06]);
  }
  if (deck) {
    const fill = Math.min(1, (st.progress - 0.5) * 2 + 0.15);
    for (const rc of rects) {
      rectProps(parts, rc, y, top - SLAB);
      parts.formwork.push([(rc.x0 + rc.x1) / 2, top - SLAB + 0.03, (rc.z0 + rc.z1) / 2, rc.x1 - rc.x0 + 0.3, 0.06, rc.z1 - rc.z0 + 0.3]);
      const w = rc.x1 - rc.x0;
      const d = rc.z1 - rc.z0;
      for (let x = rc.x0 + 0.5; x < rc.x1; x += 1.2) parts.rebar.push([x, top - SLAB + 0.1, rc.z0 + (d * fill) / 2, 0.04, 0.04, d * fill]);
      for (let z = rc.z0 + 0.5; z < rc.z1; z += 1.2) parts.rebar.push([rc.x0 + (w * fill) / 2, top - SLAB + 0.12, z, w * fill, 0.04, 0.04]);
    }
    const big = rects.reduce((a, b) => ((b.x1 - b.x0) * (b.z1 - b.z0) > (a.x1 - a.x0) * (a.z1 - a.z0) ? b : a));
    workers(parts, big, top - SLAB + 0.06, 6, seed);
  } else if (casting) {
    workers(parts, rects[0], y, 3, seed);
  }
  if (!casting && !cut) for (const rc of rects) parts.concrete.push([(rc.x0 + rc.x1) / 2, top - SLAB / 2, (rc.z0 + rc.z1) / 2, rc.x1 - rc.x0, SLAB, rc.z1 - rc.z0]);
}

function gridColumns(rc: Rect, step: number): [number, number][] {
  const out: [number, number][] = [];
  const nx = Math.max(1, Math.round((rc.x1 - rc.x0) / step));
  const nz = Math.max(1, Math.round((rc.z1 - rc.z0) / step));
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) out.push([rc.x0 + ((rc.x1 - rc.x0) * i) / nx, rc.z0 + ((rc.z1 - rc.z0) * j) / nz]);
  return out;
}

// ---------------------------------------------------------------------------

function addBasementOrPodium(parts: Parts, l: Level4D, st: LevelState, half: Rect, y: number, h: number, seed: number, seam: "N" | "S" | null) {
  const r = RANK[st.phase];
  if (r === 0) return;
  if (l.kind === "basement") {
    const m = r >= 2 ? parts.concrete : parts.fresh;
    const w = half.x1 - half.x0;
    const d = half.z1 - half.z0;
    const cx = (half.x0 + half.x1) / 2;
    const cz = (half.z0 + half.z1) / 2;
    if (seam !== "N") m.push([cx, y + h / 2, half.z0, w, h, 0.4]);
    if (seam !== "S") m.push([cx, y + h / 2, half.z1, w, h, 0.4]);
    m.push([half.x0, y + h / 2, cz, 0.4, h, d], [half.x1, y + h / 2, cz, 0.4, h, d]);
    if (r >= 2) parts.concrete.push([cx, y + h - SLAB / 2, cz, w, SLAB, d]);
    if (r === 1) workers(parts, half, y, 4, seed);
    return;
  }
  frame(parts, [half], gridColumns(half, 7.5), st, y, h, seed);
  if (r >= 1 && r <= 4) scaffoldRing(parts, half, y, h, seam ?? undefined);
  const stilt = l.key === "STILT";
  const w = half.x1 - half.x0;
  const d = half.z1 - half.z0;
  const cx = (half.x0 + half.x1) / 2;
  const cz = (half.z0 + half.z1) / 2;
  const edges: { a: [number, number]; b: [number, number]; side: "N" | "S" | "E" | "W" }[] = [
    { a: [half.x0, half.z0], b: [half.x1, half.z0], side: "N" },
    { a: [half.x0, half.z1], b: [half.x1, half.z1], side: "S" },
    { a: [half.x0, half.z0], b: [half.x0, half.z1], side: "W" },
    { a: [half.x1, half.z0], b: [half.x1, half.z1], side: "E" },
  ].filter((e) => e.side !== seam) as never;
  if (r >= 2) {
    // Exposed slab edge, painted white at the end.
    (r >= 6 ? parts.band : parts.concrete).push(
      ...(seam !== "N" ? [[cx, y + h - SLAB / 2, half.z0 - 0.05, w + 0.1, SLAB + 0.05, 0.15] as Box] : []),
      ...(seam !== "S" ? [[cx, y + h - SLAB / 2, half.z1 + 0.05, w + 0.1, SLAB + 0.05, 0.15] as Box] : []),
    );
  }
  for (const e of edges) {
    const horizontal = e.side === "N" || e.side === "S";
    const len = horizontal ? w : d;
    const out = e.side === "N" ? -0.35 : e.side === "S" ? 0.35 : e.side === "W" ? -0.35 : 0.35;
    if (stilt) {
      // Ground floor: shopfronts once glazed.
      if (r >= 5) {
        for (let t = 0; t < len; t += 4) {
          const mid = (horizontal ? half.x0 : half.z0) + t + 2;
          if (horizontal) { parts.glass.push([mid, y + (h - SLAB) / 2, e.a[1], 3.8, h - SLAB - 0.2, 0.08]); parts.band.push([mid - 1.95, y + (h - SLAB) / 2, e.a[1], 0.12, h - SLAB, 0.16]); }
          else { parts.glass.push([e.a[0], y + (h - SLAB) / 2, mid, 0.08, h - SLAB - 0.2, 3.8]); parts.band.push([e.a[0], y + (h - SLAB) / 2, mid - 1.95, 0.16, h - SLAB, 0.12]); }
        }
      }
      continue;
    }
    // Parking podium: parapet first, louvers once finished.
    if (r >= 3) {
      const m = wallOf(parts, r);
      if (horizontal) m.push([cx, y + 0.55, e.a[1], len, 1.1, 0.22]); else m.push([e.a[0], y + 0.55, cz, 0.22, 1.1, len]);
    }
    if (r >= 6) {
      for (let t = 0.3; t < len; t += 0.75) {
        const at = (horizontal ? half.x0 : half.z0) + t;
        if (horizontal) parts.louver.push([at, y + (h - SLAB) / 2, e.a[1] + out, 0.14, h - SLAB, 0.4]);
        else parts.louver.push([e.a[0] + out, y + (h - SLAB) / 2, at, 0.4, h - SLAB, 0.14]);
      }
    }
  }
}

function addFloor(parts: Parts, p: BuildingProfile, g: WingGeo, l: Level4D, st: LevelState, y: number, h: number, seed: number, cut = false) {
  const r = RANK[st.phase];
  if (r === 0) return;
  const rects = g.rects;
  if (l.kind === "above") {
    // Lift machine room and overhead tank over the core.
    const core = rects.find((x) => x.kind === "core") ?? rects[0];
    const m = r >= 6 ? parts.facade : r >= 4 ? parts.plaster : r >= 2 ? parts.concrete : parts.fresh;
    const hh = r === 1 ? h * Math.max(0.15, st.progress) : h;
    m.push([(core.x0 + core.x1) / 2, y + hh / 2, (core.z0 + core.z1) / 2, core.x1 - core.x0, hh, core.z1 - core.z0]);
    if (r >= 2) (r >= 6 ? parts.band : parts.concrete).push([(core.x0 + core.x1) / 2, y + h + 1, (core.z0 + core.z1) / 2, (core.x1 - core.x0) * 0.7, 2, (core.z1 - core.z0) * 0.7]);
    return;
  }
  if (l.kind === "terrace") {
    if (r >= 2) for (const s of g.segs) wallRun(parts, s, y, 1.3, r, { windows: false });
    else frame(parts, rects, [], st, y - 0.2, 0.2, seed);
    return;
  }
  const floor = Number(l.key.slice(1));
  const omit = new Set(p.refugeFloors.includes(floor) ? p.refugeOmits : []);
  // The viewed floor is cut at 1.4 m, like a plan section, so every room can be seen from above.
  if (cut) h = 1.4 + SLAB;
  frame(parts, rects, g.columns, st, y, h, seed, cut); // the refuge area keeps its slab; only its walls are left out
  if (r >= 1 && r <= 4) scaffoldRing(parts, g.bbox, y, h);
  if (r >= 3 && r <= 5 && st.active.length) workers(parts, rects[0], y, 2, seed + 50);

  for (const s of g.segs) {
    const refuge = s.unit && omit.has(s.unit);
    const horizontal = s.z0 === s.z1;
    const len = horizontal ? s.x1 - s.x0 : s.z1 - s.z0;
    const mid: [number, number] = [(s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2];
    const rail = (yc: number) => parts.railing.push(horizontal ? [mid[0], yc, mid[1] + s.nz * 0.05, len, 1.05, 0.05] : [mid[0] + s.nx * 0.05, yc, mid[1], 0.05, 1.05, len]);
    if (refuge) { if (r >= 5) rail(y + 0.55); continue; } // refuge area: open, with a guard rail
    if (s.kind === "wall") { if (r >= 3) wallRun(parts, s, y, h, r, { windows: true }); }
    else {
      // Balcony: the room wall set back with a glazed door, glass railing on the edge.
      if (r >= 3) {
        const wallH = h - SLAB;
        const fixedOff = 1.4;
        const fx = horizontal ? mid[0] : s.x0 - s.nx * fixedOff;
        const fz = horizontal ? s.z0 - s.nz * fixedOff : mid[1];
        const m = wallOf(parts, r);
        if (horizontal) m.push([fx, y + wallH - 0.35, fz, len, 0.7, 0.22]); else m.push([fx, y + wallH - 0.35, fz, 0.22, 0.7, len]);
        if (r >= 5) { if (horizontal) parts.glass.push([fx, y + (wallH - 0.7) / 2, fz, len * 0.9, wallH - 0.7, 0.08]); else parts.glass.push([fx, y + (wallH - 0.7) / 2, fz, 0.08, wallH - 0.7, len * 0.9]); }
        else if (r === 3 || r === 4) { if (horizontal) m.push([fx - len * 0.3, y + (wallH - 0.7) / 2, fz, len * 0.4, wallH - 0.7, 0.22]); else m.push([fx, y + (wallH - 0.7) / 2, fz - len * 0.3, 0.22, wallH - 0.7, len * 0.4]); }
      }
      if (r >= 5) rail(y + 0.55);
    }
    // Slab edge band all round, white once painted.
    if (r >= 2 && !cut) {
      const band = r >= 6 ? parts.band : parts.concrete;
      band.push(horizontal ? [mid[0], y + h - SLAB / 2, s.z0 + s.nz * 0.08, len + 0.1, 0.32, 0.18] : [s.x0 + s.nx * 0.08, y + h - SLAB / 2, mid[1], 0.18, 0.32, len + 0.1]);
    }
    // Copper strips framing each flat on the long faces, as in the renders.
    if (r >= 6 && horizontal && !cut) {
      parts.copper.push([s.x0, y + h / 2, s.z0 + s.nz * 0.25, 0.32, h, 0.42], [s.x1, y + h / 2, s.z0 + s.nz * 0.25, 0.32, h, 0.42]);
    }
  }
}

/** Corner copper fins and jali strips, floor by floor, and the copper crown when the top is finished. */
function addTowerFacade(parts: Parts, tb: Rect, y: number, h: number, faces: { north: boolean; south: boolean }) {
  for (const [z, on, sgn] of [[tb.z0, faces.north, -1], [tb.z1, faces.south, 1]] as [number, boolean, number][]) {
    if (!on) continue;
    for (const x of [tb.x0, tb.x1]) parts.copper.push([x, y + h / 2, z + sgn * 0.2, 2.6, h, 1.6]);
    for (const x of [tb.x0 + 2.6, tb.x1 - 2.6]) parts.jali.push([x, y + h / 2, z + sgn * 0.3, 1.9, h, 0.3]);
  }
}

function addCrown(parts: Parts, tb: Rect, top: number) {
  const rise = 9;
  const dip = 3.5;
  const faceV = (length: number, along: (t: number) => [number, number], ry: number) => {
    const half = length / 2 - 1.3;
    const ang = Math.atan2(rise - dip, half);
    const L = Math.hypot(half, rise - dip);
    // two inclined copper bars meeting low in the middle
    for (const sgn of [-1, 1]) {
      const [x, z] = along(sgn * half / 2);
      parts.copper.push([x, top + (rise + dip) / 2, z, L, 0.9, 0.7, ry, sgn * ang]);
    }
    // perforated panels filling below the bars
    for (let t = -half; t < half; t += 1.5) {
      const hh = dip + ((rise - dip) * Math.abs(t + 0.75)) / half - 0.6;
      const [x, z] = along(t + 0.75);
      parts.crownJali.push([x, top + hh / 2, z, ry ? 0.25 : 1.45, hh, ry ? 1.45 : 0.25]);
    }
  };
  const W = tb.x1 - tb.x0;
  const D = tb.z1 - tb.z0;
  const cx = (tb.x0 + tb.x1) / 2;
  const cz = (tb.z0 + tb.z1) / 2;
  faceV(W, (t) => [cx + t, tb.z0 - 0.3], 0);
  faceV(W, (t) => [cx + t, tb.z1 + 0.3], 0);
  faceV(D, (t) => [tb.x0 - 0.3, cz + t], Math.PI / 2);
  faceV(D, (t) => [tb.x1 + 0.3, cz + t], Math.PI / 2);
  for (const x of [tb.x0, tb.x1]) for (const z of [tb.z0, tb.z1]) parts.copper.push([x, top + rise / 2, z, 2.6, rise + 0.5, 1.6]);
}

// ---------------------------------------------------------------------------
// Site and landscaping
// ---------------------------------------------------------------------------

function palm(out: { trunk: Box[]; frond: Box[] }, x: number, z: number, h: number) {
  out.trunk.push([x, h / 2, z, 0.45, h, 0.45]);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    out.frond.push([x + Math.cos(a) * 1.6, h + 0.2, z + Math.sin(a) * 1.6, 3.4, 0.12, 0.7, -a, -0.35]);
  }
}

function SiteProfile({ p, finished, building }: { p: BuildingProfile; finished: boolean; building: boolean }) {
  const tex = useTextures();
  const hw = p.podium.widthM / 2 + 20;
  const hd = p.podium.depthM / 2 + 18;
  const court = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 256; c.height = 448;
    const g = c.getContext("2d")!;
    g.fillStyle = "#1d4ed8"; g.fillRect(0, 0, 256, 448);
    g.fillStyle = "#b91c1c"; g.fillRect(18, 18, 220, 412);
    g.strokeStyle = "#fff"; g.lineWidth = 4;
    g.strokeRect(18, 18, 220, 412); g.beginPath(); g.moveTo(18, 224); g.lineTo(238, 224); g.stroke();
    g.beginPath(); g.arc(128, 224, 36, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(128, 18, 70, 0, Math.PI); g.stroke(); g.beginPath(); g.arc(128, 430, 70, Math.PI, 0); g.stroke();
    const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; return t;
  }, []);
  const play = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const cols = ["#22d3ee", "#a3e635", "#fb923c", "#f472b6"];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = cols[(i + j) % 4]; g.fillRect(i * 32, j * 32, 32, 32); }
    const t = new CanvasTexture(c); t.wrapS = t.wrapT = RepeatWrapping; t.colorSpace = SRGBColorSpace; return t;
  }, []);
  const items = useMemo(() => {
    const fence: Box[] = [];
    const wall: Box[] = [];
    for (let x = -hw; x < hw; x += 3) {
      if (Math.abs(x) > 8) { fence.push([x + 1.5, 1.2, hd, 2.95, 2.4, 0.08]); wall.push([x + 1.5, 0.9, hd, 3, 1.8, 0.3]); }
      fence.push([x + 1.5, 1.2, -hd, 2.95, 2.4, 0.08]); wall.push([x + 1.5, 0.9, -hd, 3, 1.8, 0.3]);
    }
    for (let z = -hd; z < hd; z += 3) { fence.push([hw, 1.2, z + 1.5, 0.08, 2.4, 2.95], [-hw, 1.2, z + 1.5, 0.08, 2.4, 2.95]); wall.push([hw, 0.9, z + 1.5, 0.3, 1.8, 3], [-hw, 0.9, z + 1.5, 0.3, 1.8, 3]); }
    const bags: Box[] = [];
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) bags.push([hw - 12 + i * 0.75, 0.15 + k * 0.3, hd - 8 + j * 0.5, 0.7, 0.28, 0.45]);
    const stone: Box[] = [];
    for (let i = 0; i < 8; i++) stone.push([hw - 6, 0.6, hd - 16 + i * 0.25, 2.6, 1.2, 0.08]);
    const steel: Box[] = [];
    for (let i = 0; i < 18; i++) steel.push([-hw + 10, 0.1 + (i % 3) * 0.12, hd - 10 + Math.floor(i / 3) * 0.12, 9, 0.08, 0.08]);
    const trees = { trunk: [] as Box[], leaf: [] as Box[] };
    for (let i = 0; i < 40; i++) {
      const side = i % 4;
      const t = rnd(i * 3.1);
      const [x, z] = side === 0 ? [-hw - 8 - t * 10, -hd + rnd(i) * hd * 2] : side === 1 ? [hw + 8 + t * 10, -hd + rnd(i + 9) * hd * 2] : side === 2 ? [-hw + rnd(i + 4) * hw * 2, -hd - 8 - t * 10] : [-hw + rnd(i + 2) * hw * 2, hd + 18 + t * 12];
      const s = 4.5 + rnd(i * 5) * 3.5;
      trees.trunk.push([x, 2, z, 0.6, 4, 0.6]);
      trees.leaf.push([x, 4 + s / 2, z, s, s * 0.9, s]);
    }
    const palms = { trunk: [] as Box[], frond: [] as Box[] };
    for (let i = 0; i < 9; i++) palm(palms, -p.podium.widthM / 2 + 4 + i * (p.podium.widthM - 8) / 8, p.podium.depthM / 2 + 6, 7 + rnd(i) * 2);
    for (let i = 0; i < 5; i++) palm(palms, hw - 6, -hd + 12 + i * 10, 7);
    const cars: Box[] = [];
    const carCols: string[] = [];
    for (let i = 0; i < 10; i++) { cars.push([-p.podium.widthM / 2 + 3 + i * 4.6, 0.75, p.podium.depthM / 2 + 2.8, 1.9, 1.5, 4.3]); carCols.push(["#e2e8f0", "#1e293b", "#991b1b", "#94a3b8", "#0f172a"][i % 5]); }
    return { fence, wall, bags, stone, steel, trees, palms, cars };
  }, [hw, hd, p]);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0]} receiveShadow>
        <planeGeometry args={[1400, 1400]} />
        <meshStandardMaterial map={tex.grass} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[hw * 2, hd * 2]} />
        <meshStandardMaterial map={finished ? undefined : tex.dirt} color={finished ? "#65a30d" : "#ffffff"} roughness={1} transparent opacity={finished ? 1 : 0.85} />
      </mesh>
      {/* road in front */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0, hd + 7]} receiveShadow><planeGeometry args={[1400, 10]} /><meshStandardMaterial color="#3f3f46" roughness={0.9} /></mesh>
      {finished ? (
        <>
          {/* driveway around the podium, sports court, play area, palms, parked cars, compound wall */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow><planeGeometry args={[p.podium.widthM + 14, p.podium.depthM + 14]} /><meshStandardMaterial color="#9ca3af" roughness={0.9} /></mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[hw - 9.5, 0.04, -hd + 22]} receiveShadow><planeGeometry args={[13, 24]} /><meshStandardMaterial map={court} roughness={0.8} /></mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-hw + 9, 0.04, -hd + 16]} receiveShadow><planeGeometry args={[12, 12]} /><meshStandardMaterial map={play} roughness={0.9} /></mesh>
          <Boxes items={items.wall} color="#e7e1d6" roughness={0.8} />
          <Boxes items={items.palms.trunk} color="#8b6b4a" />
          <Boxes items={items.palms.frond} color="#3f7d20" roughness={1} />
          <Boxes items={items.cars.filter((_, i) => i % 5 === 0)} color="#e2e8f0" metalness={0.5} roughness={0.3} />
          <Boxes items={items.cars.filter((_, i) => i % 5 === 1)} color="#1e293b" metalness={0.5} roughness={0.3} />
          <Boxes items={items.cars.filter((_, i) => i % 5 === 2)} color="#991b1b" metalness={0.5} roughness={0.3} />
          <Boxes items={items.cars.filter((_, i) => i % 5 >= 3)} color="#94a3b8" metalness={0.5} roughness={0.3} />
          {/* entrance portals at the gate */}
          <Boxes items={[[-9, 3.5, hd, 1.2, 7, 1.2], [9, 3.5, hd, 1.2, 7, 1.2], [0, 7.2, hd, 19.2, 0.8, 2]]} color="#f5f5f4" />
        </>
      ) : (
        <>
          <Boxes items={items.fence} color="#1d4ed8" roughness={0.6} metalness={0.3} />
          {building && <Boxes items={items.bags} color="#d6c7a1" roughness={1} />}
          {building && <Boxes items={items.stone} color="#d4d4d8" roughness={0.4} />}
          {building && <Boxes items={items.steel} color="#57534e" metalness={0.6} roughness={0.5} />}
          {building && <mesh position={[-hw + 8, 1, -hd + 8]} castShadow><coneGeometry args={[3.5, 2.2, 18]} /><meshStandardMaterial color="#c2a46d" roughness={1} /></mesh>}
        </>
      )}
      <Boxes items={items.trees.trunk} color="#6b4423" />
      <Boxes items={items.trees.leaf} color="#3f6212" roughness={1} />
    </group>
  );
}

// ---------------------------------------------------------------------------

export function ProfileScene4D({ model, profile, at, mode, selected, onSelect, onHover, flat, onFlat, furnished = true, marks, labels = true }: {
  model: Model4D; profile: BuildingProfile; at: number; mode: Mode; selected: Pick | null;
  onSelect: (p: Pick) => void; onHover: (p: (Pick & { state: LevelState }) | null) => void;
  flat?: string | null; onFlat?: (tower: number, no: string | null) => void; furnished?: boolean;
  marks?: Map<string, "behind" | "ahead">; // "tower:levelKey" -> highlight
  labels?: boolean;
}) {
  const tex = useTextures();
  const [hover, setHover] = useState<Pick | null>(null);
  const facadeTex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(0,0,0,${0.02 + rnd(i) * 0.03})`; g.fillRect(rnd(i * 2) * 64, rnd(i * 3) * 64, 2, 2); }
    const t = new CanvasTexture(c); t.wrapS = t.wrapT = RepeatWrapping; return t;
  }, []);
  const jaliTex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    g.fillStyle = profile.facade.jali; g.fillRect(0, 0, 64, 64);
    g.fillStyle = "rgba(255,255,255,0.25)";
    for (let x = 4; x < 64; x += 8) for (let y = 4; y < 64; y += 8) { g.beginPath(); g.arc(x, y, 1.6, 0, Math.PI * 2); g.fill(); }
    const t = new CanvasTexture(c); t.wrapS = t.wrapT = RepeatWrapping; t.repeat.set(2, 6); t.colorSpace = SRGBColorSpace; return t;
  }, [profile.facade.jali]);

  const crownTex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    g.fillStyle = profile.facade.crownJali ?? "#a69c94"; g.fillRect(0, 0, 64, 64);
    g.fillStyle = "rgba(40,30,25,0.35)";
    for (let x = 4; x < 64; x += 8) for (let y = 4; y < 64; y += 8) { g.beginPath(); g.arc(x, y, 2, 0, Math.PI * 2); g.fill(); }
    const t = new CanvasTexture(c); t.wrapS = t.wrapT = RepeatWrapping; t.repeat.set(1, 4); t.colorSpace = SRGBColorSpace; return t;
  }, [profile.facade.crownJali]);
  const n = model.towers.length;
  const geos = useMemo(() => model.towers.map((tw, i) => wingGeometry(profile, wingKey(tw.name), i, n)), [model, profile, n]);
  const tb: Rect = useMemo(() => ({
    x0: Math.min(...geos.map((g) => g.bbox.x0)), x1: Math.max(...geos.map((g) => g.bbox.x1)),
    z0: Math.min(...geos.map((g) => g.bbox.z0)), z1: Math.max(...geos.map((g) => g.bbox.z1)),
  }), [geos]);
  const podium = profile.podium;
  const halves: Rect[] = useMemo(() => geos.map((_, i) => ({
    x0: -podium.widthM / 2, x1: podium.widthM / 2,
    z0: -podium.depthM / 2 + (podium.depthM * i) / n, z1: -podium.depthM / 2 + (podium.depthM * (i + 1)) / n,
  })), [geos, podium, n]);

  const layout = useMemo(() => model.towers.map((tw) => {
    let y = 0;
    const base = tw.levels.filter((l) => l.kind === "basement");
    const rest = tw.levels.filter((l) => l.kind !== "basement");
    return [
      ...base.map((l, k) => ({ l, y: -(base.length - k) * BASEMENT_H, h: BASEMENT_H })),
      ...rest.map((l) => { const y0 = y; const h = heightOf(profile, l); y += h; return { l, y: y0, h }; }),
    ];
  }), [model, profile]);

  // Floor view: a clicked residential floor is shown with everything above it cut away.
  const focus = useMemo(() => {
    if (!selected) return null;
    const placed = layout[selected.tower];
    const hit = placed?.find((x) => x.l.key === selected.level);
    if (!hit || hit.l.kind !== "floor") return null;
    return { y: hit.y, h: hit.h, key: hit.l.key };
  }, [selected, layout]);

  const built = useMemo(() => {
    const parts = P();
    const info = layout.map((placed, ti) => {
      const states = placed.map(({ l }) => levelState(l, at, mode));
      const seam = n === 1 ? null : ti === 0 ? "S" : ti === n - 1 ? "N" : null;
      placed.forEach(({ l, y, h }, k) => {
        const st = states[k];
        if (focus && y > focus.y + 0.01) return; // cut away above the floor being viewed
        const cut = !!focus && Math.abs(y - focus.y) < 0.01;
        if (l.kind === "basement" || l.kind === "podium") addBasementOrPodium(parts, l, st, halves[ti], y, h, ti * 1000 + k, seam as "N" | "S" | null);
        else addFloor(parts, profile, geos[ti], l, st, y, h, ti * 1000 + k, cut);
        if (l.kind === "floor" && RANK[st.phase] >= 6 && !cut) addTowerFacade(parts, tb, y, h, { north: ti === 0, south: ti === n - 1 });
      });
      const top = placed.at(-1)!;
      const builtTop = placed.reduce((m, pl, k) => (states[k].phase !== "none" ? Math.max(m, pl.y + pl.h) : m), 0);
      const casting = placed.findIndex((pl, k) => states[k].phase === "casting" && pl.l.kind !== "basement");
      const complete = states.every((s) => s.phase === "complete");
      const upper = states.some((s, k) => s.phase === "none" && placed[k].l.kind !== "basement");
      return { states, top, builtTop, casting, complete, structureGoing: casting >= 0 || (builtTop > 0 && upper), crownReady: RANK[states.at(-1)!.phase] >= 6 };
    });
    const crownTop = Math.max(...layout.map((pl) => { const terrace = pl.find((x) => x.l.kind === "terrace"); return terrace ? terrace.y + terrace.h : 0; }));
    const crown = !focus && info.every((x) => x.crownReady) && crownTop ? crownTop : null;
    if (crown) addCrown(parts, tb, crown);
    return { parts, info, crown };
  }, [layout, at, mode, halves, geos, profile, tb, n, focus]);

  const { parts, info, crown } = built;
  const finished = info.every((x) => x.complete);
  const building = info.some((x) => x.builtTop > 0 || x.states.some((s) => s.phase !== "none"));
  const fac = profile.facade;
  const height = Math.max(...layout.map((pl) => pl.at(-1)!.y + pl.at(-1)!.h));

  return (
    <Canvas shadows camera={{ position: [150, 95, 200], fov: 36, near: 1, far: 4000 }} dpr={[1, 2]}>
      <Sky sunPosition={[160, 110, 120]} turbidity={6} rayleigh={1.1} />
      <hemisphereLight args={["#e0ecff", "#b9b2a6", 0.85]} />
      <directionalLight position={[120, 180, 110]} intensity={1.9} color="#fff6ea" castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-160} shadow-camera-right={160} shadow-camera-top={200} shadow-camera-bottom={-80} shadow-bias={-0.0004} />
      <fog attach="fog" args={["#dfe7ee", 380, 1300]} />

      <SiteProfile p={profile} finished={finished} building={building} />

      <Boxes items={parts.concrete} map={tex.concrete} />
      <Boxes items={parts.fresh} map={tex.fresh} />
      <Boxes items={parts.brick} map={tex.brick} roughness={0.95} />
      <Boxes items={parts.plaster} map={tex.plaster} roughness={0.9} />
      <Boxes items={parts.facade} map={facadeTex} color={fac.wall} roughness={0.75} />
      <Boxes items={parts.band} color={fac.band} roughness={0.6} />
      <Boxes items={parts.copper} color={fac.copper} roughness={0.55} metalness={0} />
      <Boxes items={parts.jali} map={jaliTex} roughness={0.8} />
      <Boxes items={parts.crownJali} map={crownTex} roughness={0.8} />
      <Boxes items={parts.louver} color={fac.louver} roughness={0.6} />
      <Boxes items={parts.glass} color={fac.glass} roughness={0.12} metalness={0.05} shadows={false} />
      <Boxes items={parts.frame} color="#6b7280" roughness={0.5} />
      <Boxes items={parts.railing} color={fac.balconyRail ?? "#55636f"} roughness={0.2} transparent opacity={0.55} shadows={false} />
      <Boxes items={parts.scaffold} color="#8a8f98" roughness={0.45} metalness={0.7} />
      <Boxes items={parts.plank} map={tex.wood} />
      <Boxes items={parts.formwork} map={tex.wood} roughness={0.8} />
      <Boxes items={parts.rebar} color="#7c2d12" roughness={0.6} metalness={0.5} shadows={false} />
      <Boxes items={parts.vest} color="#f97316" roughness={0.8} />
      <Boxes items={parts.helmet} color="#facc15" roughness={0.4} />

      {layout.map((placed, i) => {
        const g = geos[i];
        const tw = model.towers[i];
        const inf = info[i];
        return (
          <group key={tw.uid}>
            {placed.map(({ l, y, h }, k) => {
              if (focus && y > focus.y - 0.01) return null; // the viewed floor is clicked through its flat tags
              const rc = l.kind === "basement" || l.kind === "podium" ? halves[i] : g.bbox;
              const isSel = selected?.tower === i && selected.level === l.key;
              const isHover = hover?.tower === i && hover.level === l.key;
              const ghost = inf.states[k].phase === "none";
              const mark = marks?.get(`${i}:${l.key}`);
              const tint = mark === "behind" ? "#ef4444" : mark === "ahead" ? "#22c55e" : null;
              return (
                <mesh
                  key={l.key}
                  position={[(rc.x0 + rc.x1) / 2, y + h / 2, (rc.z0 + rc.z1) / 2]}
                  onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect({ tower: i, level: l.key }); }}
                  onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHover({ tower: i, level: l.key }); onHover({ tower: i, level: l.key, state: inf.states[k] }); }}
                  onPointerOut={() => { setHover(null); onHover(null); }}
                >
                  <boxGeometry args={[rc.x1 - rc.x0 + 0.3, h, rc.z1 - rc.z0 + 0.3]} />
                  <meshBasicMaterial transparent opacity={isSel ? 0.2 : isHover ? 0.1 : tint ? 0.3 : ghost ? 0.03 : 0} color={isSel ? "#2563eb" : tint ?? "#ffffff"} depthWrite={false} />
                  {(isSel || isHover || ghost || tint) && <Edges color={isSel ? "#2563eb" : isHover ? "#0f172a" : tint ?? "#ffffff"} threshold={15} />}
                </mesh>
              );
            })}
            {inf.structureGoing && <Crane x={podium.widthM / 2 - 12} top={inf.builtTop} />}
            {labels && (
              <Label
                position={[i === 0 ? g.bbox.x0 + 4 : g.bbox.x1 - 4, height + 12 - i * 7, (g.bbox.z0 + g.bbox.z1) / 2]}
                height={3.2}
                bg={inf.complete ? "#059669" : "#0f172a"}
                text={`${tw.name}${inf.complete ? " · complete" : inf.casting >= 0 ? ` · casting ${placed[inf.casting].l.name}` : ""}`}
              />
            )}
          </group>
        );
      })}
      {crown && <Sign y={crown + 5.2} z={tb.z1 + 0.75} />}
      {focus && geos.map((g, i) => {
        const tw = model.towers[i];
        const sheet = drawingFor(profile, g.key, focus.key);
        const flats = flatsOn(profile, focus.key);
        return (
          <group key={`plan-${tw.uid}`}>
            {sheet && (
              <Suspense fallback={null}>
                {/* the drawing only inside the flats and core, not the sheet's margins and tables */}
                {[...profile.units.map((u) => u.rect), ...profile.core.map((c) => c.rect)].map((r, k) => (
                  <DrawingPlane key={k} src={sheet.src} profile={profile} sheet={sheet} rect={r} mirror={g.mirror} z={g.centerZ} y={focus.y + 0.05} />
                ))}
              </Suspense>
            )}
            {furnished && <Furnishing rooms={g.rooms} y={focus.y + 0.06} flats={new Set(flats.map((f) => f.no))} />}
            {g.rects.filter((r) => r.kind === "unit").map((r) => {
              const f = flats.find((x) => x.no === r.unit!.no);
              const sel = !!f && flat === f.no && selected?.tower === i;
              return (
                <group key={r.unit!.no}>
                  {sel && (
                    <mesh position={[(r.x0 + r.x1) / 2, focus.y + 1.2, (r.z0 + r.z1) / 2]}>
                      <boxGeometry args={[r.x1 - r.x0, 2.4, r.z1 - r.z0]} />
                      <meshBasicMaterial color="#2563eb" transparent opacity={0.18} depthWrite={false} />
                      <Edges color="#1d4ed8" />
                    </mesh>
                  )}
                  <Label
                    position={[(r.x0 + r.x1) / 2, focus.y + 3, (r.z0 + r.z1) / 2]}
                    height={0.85}
                    bg={!f ? "#64748b" : sel ? "#2563eb" : "#ffffff"}
                    color={!f || sel ? "#ffffff" : "#0f172a"}
                    text={f ? f.flatNo : "Refuge"}
                    onClick={() => onFlat?.(i, f ? (sel ? null : f.no) : null)}
                  />
                </group>
              );
            })}
          </group>
        );
      })}
      <FocusRig focus={focus ? new Vector3(0, focus.y, 0) : null} />
      <OrbitControls makeDefault target={[0, 45, 0]} maxPolarAngle={Math.PI / 2.05} minDistance={15} maxDistance={800} enableDamping />
    </Canvas>
  );
}

/** The real floor plan sheet laid on the slab, cropped to the plan outline. */
function DrawingPlane({ src, profile, sheet, rect, mirror, z, y }: {
  src: string; profile: BuildingProfile; sheet: NonNullable<ReturnType<typeof drawingFor>>; rect: [number, number, number, number]; mirror: boolean; z: number; y: number;
}) {
  const base = useTexture(src);
  const s = profile.pxToM;
  const cx = (profile.plan.x0 + profile.plan.x1) / 2;
  const cy = (profile.plan.y0 + profile.plan.y1) / 2;
  // world placement of this rectangle (same transform as the wing geometry)
  const wx = ((rect[0] + rect[2]) / 2 - cx) * s;
  const wz = (mirror ? -1 : 1) * ((rect[1] + rect[3]) / 2 - cy) * s + z;
  const w = (rect[2] - rect[0]) * s;
  const d = (rect[3] - rect[1]) * s;
  const tex = useMemo(() => {
    const [a, b] = [toSheet(profile, sheet, rect[0], rect[1]), toSheet(profile, sheet, rect[2], rect[3])];
    const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
    const [y0, y1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
    const t = base.clone();
    t.colorSpace = SRGBColorSpace;
    t.repeat.set((x1 - x0) / sheet.size[0], (y1 - y0) / sheet.size[1]);
    t.offset.set(x0 / sheet.size[0], 1 - y1 / sheet.size[1]);
    t.needsUpdate = true;
    return t;
  }, [base, profile, sheet, rect]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[wx, y, wz]} receiveShadow>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial map={tex} roughness={0.9} />
    </mesh>
  );
}

/** Glide the camera to the viewed floor, and back to the whole building when it is closed. */
function FocusRig({ focus }: { focus: Vector3 | null }) {
  const { camera, controls } = useThree() as unknown as { camera: { position: Vector3 }; controls: { target: Vector3; update: () => void } | null };
  const anim = useRef<{ t: number; fromPos: Vector3; toPos: Vector3; fromTarget: Vector3; toTarget: Vector3 } | null>(null);
  const key = focus ? focus.y.toFixed(2) : "none";
  useEffect(() => {
    if (!controls) return;
    const toTarget = focus ? focus.clone() : new Vector3(0, 45, 0);
    const toPos = focus ? new Vector3(16, focus.y + 34, 40) : new Vector3(150, 95, 200);
    anim.current = { t: 0, fromPos: camera.position.clone(), toPos, fromTarget: controls.target.clone(), toTarget };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, controls]);
  useFrame((_, dt) => {
    const a = anim.current;
    if (!a || !controls) return;
    a.t = Math.min(1, a.t + dt / 1.1);
    const e = a.t < 0.5 ? 2 * a.t * a.t : 1 - (-2 * a.t + 2) ** 2 / 2;
    camera.position.lerpVectors(a.fromPos, a.toPos, e);
    controls.target.lerpVectors(a.fromTarget, a.toTarget, e);
    controls.update();
    if (a.t >= 1) anim.current = null;
  });
  return null;
}

/** The KRISALA name plate in the middle of the crown, as on the front elevation. */
function Sign({ y, z }: { y: number; z: number }) {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 512; c.height = 128;
    const g = c.getContext("2d")!;
    g.fillStyle = "#d9d4cd"; g.fillRect(0, 0, 512, 128);
    g.fillStyle = "#7a4a2a"; g.font = "bold 64px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("KRISALA", 256, 68);
    const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; return t;
  }, []);
  return (
    <mesh position={[0, y, z]}>
      <planeGeometry args={[7.5, 1.9]} />
      <meshStandardMaterial map={tex} roughness={0.6} />
    </mesh>
  );
}

/**
 * A text tag drawn inside the scene (a sprite), so it needs no DOM overlay: always faces the camera,
 * stays on top, and can be clicked.
 */
function Label({ text, position, height = 1, bg = "#0f172a", color = "#ffffff", onClick }: {
  text: string; position: [number, number, number]; height?: number; bg?: string; color?: string; onClick?: () => void;
}) {
  const { tex, aspect } = useMemo(() => {
    const c = document.createElement("canvas");
    const g = c.getContext("2d")!;
    const font = "600 44px ui-sans-serif, system-ui, sans-serif";
    g.font = font;
    const w = Math.ceil(g.measureText(text).width) + 48;
    c.width = w; c.height = 72;
    g.font = font;
    g.fillStyle = bg;
    g.beginPath(); g.roundRect(2, 2, w - 4, 68, 34); g.fill();
    g.strokeStyle = "rgba(15,23,42,0.25)"; g.lineWidth = 2; g.stroke();
    g.fillStyle = color; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(text, w / 2, 38);
    const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.anisotropy = 4;
    return { tex: t, aspect: w / 72 };
  }, [text, bg, color]);
  return (
    <sprite
      position={position}
      scale={[height * aspect, height, 1]}
      renderOrder={10}
      onClick={onClick ? (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onClick(); } : undefined}
      onPointerOver={onClick ? () => { document.body.style.cursor = "pointer"; } : undefined}
      onPointerOut={onClick ? () => { document.body.style.cursor = ""; } : undefined}
    >
      <spriteMaterial map={tex} depthTest={false} transparent />
    </sprite>
  );
}
