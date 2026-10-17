"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { Edges, Html, OrbitControls, Sky } from "@react-three/drei";
import { CanvasTexture, InstancedMesh, Object3D, RepeatWrapping, SRGBColorSpace, type Texture } from "three";
import type { Level4D, Model4D } from "@/lib/types";
import { levelState, type LevelState, type Mode, type Phase } from "@/lib/four-d";

// A realistic site, built from the schedule: each level shows what is physically there on the date —
// nothing, columns and props while its slab is cast, a bare concrete frame with scaffolding, brick
// infill, plaster, glazing, then the painted facade. A finished wing gets its landscaping.

const DIMS: Record<Level4D["kind"], { w: number; d: number; h: number }> = {
  basement: { w: 30, d: 26, h: 3.4 },
  podium: { w: 30, d: 26, h: 3.6 },
  floor: { w: 20, d: 15, h: 3 },
  terrace: { w: 20, d: 15, h: 1.2 },
  above: { w: 9, d: 8, h: 5 },
};
const GAP = 38;
export const RANK: Record<Phase, number> = { none: 0, casting: 1, structure: 2, masonry: 3, services: 4, finishes: 5, painting: 6, complete: 7 };
export const SLAB = 0.25;

export interface Pick { tower: number; level: string }

// ---------------------------------------------------------------------------
// Procedural textures (no image files needed)
// ---------------------------------------------------------------------------

// Seeded noise so textures are the same on every load (and render stays pure).
let noiseSeed = 1;
const rand = () => { const x = Math.sin(noiseSeed++ * 78.233) * 43758.5453; return x - Math.floor(x); };

function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, repeat = 1): Texture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d")!, size);
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = SRGBColorSpace;
  return t;
}
const noise = (g: CanvasRenderingContext2D, s: number, base: string, spread: number, n = 2600) => {
  g.fillStyle = base;
  g.fillRect(0, 0, s, s);
  for (let i = 0; i < n; i++) {
    const v = Math.floor(rand() * spread * 2 - spread);
    g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 255})`;
    g.fillRect(rand() * s, rand() * s, 2, 2);
  }
};
export function useTextures() {
  return useMemo(() => ({
    concrete: canvasTexture(128, (g, s) => noise(g, s, "#a9a59d", 26)),
    fresh: canvasTexture(128, (g, s) => noise(g, s, "#7d7870", 30)),
    brick: canvasTexture(256, (g, s) => {
      g.fillStyle = "#cfc6b8";
      g.fillRect(0, 0, s, s);
      const rows = 12;
      const rh = s / rows;
      for (let r = 0; r < rows; r++) {
        for (let c = -1; c < 6; c++) {
          const x = c * (s / 5) + (r % 2 ? s / 10 : 0);
          const shade = 150 + Math.floor(rand() * 40);
          g.fillStyle = `rgb(${shade + 20},${Math.floor(shade * 0.45)},${Math.floor(shade * 0.32)})`;
          g.fillRect(x + 2, r * rh + 2, s / 5 - 4, rh - 3);
        }
      }
    }),
    plaster: canvasTexture(128, (g, s) => noise(g, s, "#c9c5bd", 14)),
    paint: canvasTexture(128, (g, s) => noise(g, s, "#efe4d0", 6, 800)),
    wood: canvasTexture(128, (g, s) => {
      noise(g, s, "#a0703f", 18);
      g.strokeStyle = "rgba(80,50,20,.35)";
      for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(0, i * 15 + 4); g.lineTo(s, i * 15 + 8); g.stroke(); }
    }),
    dirt: canvasTexture(256, (g, s) => noise(g, s, "#b39c7a", 30, 9000), 18),
    grass: canvasTexture(256, (g, s) => noise(g, s, "#6f8a4a", 26, 9000), 30),
  }), []);
}

// ---------------------------------------------------------------------------
// Instanced boxes: every part of one material in a single draw call
// ---------------------------------------------------------------------------

export type Box = [number, number, number, number, number, number, number?, number?]; // x, y, z (centre), sx, sy, sz, rotation about y, about z
const tmp = new Object3D();

export function Boxes({ items, color, map, roughness = 0.85, metalness = 0, transparent, opacity = 1, shadows = true }: {
  items: Box[]; color?: string; map?: Texture; roughness?: number; metalness?: number; transparent?: boolean; opacity?: number; shadows?: boolean;
}) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    items.forEach(([x, y, z, sx, sy, sz, ry = 0, rz = 0], i) => {
      tmp.position.set(x, y, z);
      tmp.rotation.set(0, ry, rz);
      tmp.scale.set(Math.max(sx, 0.001), Math.max(sy, 0.001), Math.max(sz, 0.001));
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [items]);
  if (!items.length) return null;
  return (
    <instancedMesh key={items.length} ref={ref} args={[undefined, undefined, items.length]} castShadow={shadows} receiveShadow raycast={() => null}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={color} map={map} roughness={roughness} metalness={metalness} transparent={transparent} opacity={opacity} />
    </instancedMesh>
  );
}

// ---------------------------------------------------------------------------
// Building the parts of each level
// ---------------------------------------------------------------------------

type Parts = Record<"concrete" | "fresh" | "brick" | "plaster" | "paint" | "accent" | "white" | "glass" | "frame" | "scaffold" | "plank" | "formwork" | "rebar" | "vest" | "helmet" | "railing", Box[]>;
const emptyParts = (): Parts => ({ concrete: [], fresh: [], brick: [], plaster: [], paint: [], accent: [], white: [], glass: [], frame: [], scaffold: [], plank: [], formwork: [], rebar: [], vest: [], helmet: [], railing: [] });

const grid = (len: number, bay: number) => {
  const n = Math.max(1, Math.round(len / bay));
  return Array.from({ length: n + 1 }, (_, i) => -len / 2 + (i * len) / n);
};
// deterministic "random" per level so workers and stacks do not jump around
export const rnd = (seed: number) => { const x = Math.sin(seed * 12.9898) * 43758.5453; return x - Math.floor(x); };

function addLevel(p: Parts, l: Level4D, st: LevelState, x0: number, y: number, seed: number) {
  const { w, d, h } = DIMS[l.kind];
  const r = RANK[st.phase];
  if (r === 0) return;
  const bay = l.kind === "podium" || l.kind === "basement" ? 6 : 5;
  const xs = grid(w, bay);
  const zs = grid(d, bay);
  const top = y + h;
  const casting = st.phase === "casting";
  const deck = casting && st.progress >= 0.5;
  const colH = casting ? (h - SLAB) * Math.min(1, st.progress * 2) : h - SLAB;
  const concrete = casting ? p.fresh : p.concrete;
  const painted = r >= 6;

  // Basement: retaining walls and the slab over it.
  if (l.kind === "basement") {
    const mat = r >= 2 ? p.concrete : p.fresh;
    mat.push([x0, y + h / 2, -d / 2, w, h, 0.4], [x0, y + h / 2, d / 2, w, h, 0.4], [x0 - w / 2, y + h / 2, 0, 0.4, h, d], [x0 + w / 2, y + h / 2, 0, 0.4, h, d]);
    if (r >= 2) p.concrete.push([x0, top - SLAB / 2, 0, w, SLAB, d]);
    return;
  }

  // Columns (perimeter and interior grid).
  for (const cx of xs) for (const cz of zs) {
    concrete.push([x0 + cx, y + colH / 2, cz, 0.45, colH, 0.6]);
    if (casting && !deck) p.rebar.push([x0 + cx, y + colH + 0.6, cz, 0.06, 1.2, 0.06]); // starter bars
  }

  if (deck) {
    // Shuttering props under the deck, plywood deck, rebar mesh, crew on top.
    for (let px = -w / 2 + 1; px < w / 2; px += 1.6) for (let pz = -d / 2 + 1; pz < d / 2; pz += 1.6) {
      p.scaffold.push([x0 + px, y + (h - SLAB) / 2, pz, 0.06, h - SLAB, 0.06]);
    }
    p.formwork.push([x0, top - SLAB + 0.03, 0, w + 0.6, 0.06, d + 0.6]);
    const fill = (st.progress - 0.5) * 2; // rebar laid progressively
    for (let gx = -w / 2; gx <= w / 2; gx += 0.8) p.rebar.push([x0 + gx, top - SLAB + 0.1, 0, 0.04, 0.04, d * Math.min(1, fill + 0.2)]);
    for (let gz = -d / 2; gz <= d / 2; gz += 0.8) p.rebar.push([x0, top - SLAB + 0.12, gz, w * Math.min(1, fill + 0.2), 0.04, 0.04]);
  }
  if (r >= 2 && l.kind !== "above") p.concrete.push([x0, top - SLAB / 2, 0, w, SLAB, d]); // the slab itself

  // Workers wherever the level is being built.
  if (casting || (r >= 3 && r <= 5 && st.active.length)) {
    const n = casting ? 5 : 2;
    for (let i = 0; i < n; i++) {
      const wx = x0 + (rnd(seed + i) - 0.5) * (w - 3);
      const wz = (rnd(seed * 3 + i) - 0.5) * (d - 3);
      const wy = deck ? top + 0.06 : y + 0.06;
      p.vest.push([wx, wy + 0.65, wz, 0.42, 1.0, 0.3]);
      p.helmet.push([wx, wy + 1.4, wz, 0.3, 0.22, 0.3]);
    }
  }

  // Balconies on the front of residential floors: concrete first, painted with glass railings at the end.
  if (l.kind === "floor" && r >= 2) {
    for (let i = 0; i < xs.length - 1; i += 2) {
      const bx = x0 + (xs[i] + xs[i + 1]) / 2;
      const bw = (xs[i + 1] - xs[i]) * 0.85;
      (painted ? p.white : p.concrete).push([bx, top - SLAB / 2, d / 2 + 0.7, bw, SLAB, 1.4]);
      if (r >= 5) p.railing.push([bx, top + 0.5, d / 2 + 1.38, bw, 1.0, 0.05]);
    }
  }

  // Walls with window openings, bay by bay on all four faces.
  if (r >= 3 && l.kind !== "terrace" && l.key !== "STILT") {
    const wallMat = painted ? p.paint : r >= 4 ? p.plaster : p.brick;
    const pierMat = painted ? p.accent : wallMat;
    const wallH = h - SLAB;
    const winRatio = l.kind === "podium" ? 0.7 : 0.55;
    const sill = 0.9;
    const winH = Math.min(1.5, wallH - sill - 0.3);
    const faces: { along: "x" | "z"; at: number }[] = [{ along: "x", at: d / 2 }, { along: "x", at: -d / 2 }, { along: "z", at: w / 2 }, { along: "z", at: -w / 2 }];
    for (const f of faces) {
      const pts = f.along === "x" ? xs : zs;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const len = b - a - 0.45;
        const mid = (a + b) / 2;
        const win = len * winRatio;
        const pier = (len - win) / 2;
        const place = (along: number, yc: number, sx: number, sy: number, mat: Box[]) => {
          if (f.along === "x") mat.push([x0 + along, yc, f.at, sx, sy, 0.22]);
          else mat.push([x0 + f.at, yc, along, 0.22, sy, sx]);
        };
        place(mid, y + sill / 2, len, sill, wallMat); // below the window
        place(mid, y + sill + winH + (wallH - sill - winH) / 2, len, wallH - sill - winH, wallMat); // above it
        place(mid - win / 2 - pier / 2, y + sill + winH / 2, pier, winH, pierMat);
        place(mid + win / 2 + pier / 2, y + sill + winH / 2, pier, winH, pierMat);
        if (r >= 5) {
          place(mid, y + sill + winH / 2, win, winH, p.glass);
          place(mid, y + sill + winH / 2, 0.06, winH, p.frame);
        }
      }
    }
  }

  // Terrace parapet and the lift machine room / water tank block.
  if (l.kind === "terrace" && r >= 2) {
    const m = painted ? p.paint : r >= 4 ? p.plaster : p.concrete;
    m.push([x0, y + 0.55, d / 2, w, 1.1, 0.2], [x0, y + 0.55, -d / 2, w, 1.1, 0.2], [x0 + w / 2, y + 0.55, 0, 0.2, 1.1, d], [x0 - w / 2, y + 0.55, 0, 0.2, 1.1, d]);
  }
  if (l.kind === "above" && r >= 2) {
    const m = painted ? p.paint : r >= 4 ? p.plaster : p.concrete;
    m.push([x0, y + h / 2, 0, w, h, d]);
    (painted ? p.white : p.concrete).push([x0, y + h + 0.9, 0, w * 0.7, 1.8, d * 0.6]); // overhead tank
  }

  // Scaffolding around the level while the outside is being worked on.
  if (r >= 1 && r <= 4 && l.kind !== "above") {
    const off = 1.2;
    const W = w + off * 2;
    const D = d + off * 2;
    const ring = (fx: (t: number) => [number, number], len: number) => {
      for (let t = -len / 2; t <= len / 2 + 0.01; t += 2.5) {
        const [px, pz] = fx(t);
        p.scaffold.push([x0 + px, y + h / 2, pz, 0.07, h, 0.07]);
      }
    };
    ring((t) => [t, D / 2], W);
    ring((t) => [t, -D / 2], W);
    ring((t) => [W / 2, t], D);
    ring((t) => [-W / 2, t], D);
    for (const ly of [y + 0.1, y + h / 2, y + h - 0.1]) {
      p.scaffold.push([x0, ly, D / 2, W, 0.06, 0.06], [x0, ly, -D / 2, W, 0.06, 0.06], [x0 + W / 2, ly, 0, 0.06, 0.06, D], [x0 - W / 2, ly, 0, 0.06, 0.06, D]);
    }
    p.plank.push([x0, y + 0.12, D / 2 - 0.4, W, 0.05, 0.8], [x0, y + 0.12, -D / 2 + 0.4, W, 0.05, 0.8]);
  }
}

// ---------------------------------------------------------------------------
// Site furniture
// ---------------------------------------------------------------------------

function Site({ textures, span, done }: { textures: ReturnType<typeof useTextures>; span: number; done: boolean[] }) {
  const halfW = span / 2 + 28;
  const halfD = 34;
  const stuff = useMemo(() => {
    const fence: Box[] = [];
    for (let x = -halfW; x < halfW; x += 3) if (Math.abs(x) > 6) fence.push([x + 1.5, 1.2, halfD, 2.95, 2.4, 0.08]);
    for (let x = -halfW; x < halfW; x += 3) fence.push([x + 1.5, 1.2, -halfD, 2.95, 2.4, 0.08]);
    for (let z = -halfD; z < halfD; z += 3) fence.push([halfW, 1.2, z + 1.5, 0.08, 2.4, 2.95], [-halfW, 1.2, z + 1.5, 0.08, 2.4, 2.95]);
    const bags: Box[] = [];
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) bags.push([-halfW + 8 + i * 0.75, 0.15 + k * 0.3, halfD - 6 + j * 0.5, 0.7, 0.28, 0.45]);
    const slabs: Box[] = [];
    for (let i = 0; i < 6; i++) slabs.push([-halfW + 16, 0.6, halfD - 8 + i * 0.25, 2.6, 1.2, 0.08]);
    for (let i = 0; i < 4; i++) slabs.push([-halfW + 20, 0.55, halfD - 8 + i * 0.25, 2.2, 1.1, 0.08]);
    const steel: Box[] = [];
    for (let i = 0; i < 18; i++) steel.push([halfW - 12, 0.1 + (i % 3) * 0.12, halfD - 10 + Math.floor(i / 3) * 0.12, 9, 0.08, 0.08]);
    const trunks: Box[] = [];
    const leaves: Box[] = [];
    for (let i = 0; i < 26; i++) {
      const side = i % 2 ? 1 : -1;
      const tx = i < 16 ? -halfW - 6 + (i * (halfW * 2 + 12)) / 15 : side * (halfW + 7);
      const tz = i < 16 ? halfD + 10 + rnd(i) * 4 : -halfD + ((i - 16) / 10) * halfD * 2;
      const s = 4 + rnd(i * 7) * 3;
      trunks.push([tx, 2, tz, 0.5, 4, 0.5]);
      leaves.push([tx, 4 + s / 2, tz, s, s, s]);
    }
    return { fence, bags, slabs, steel, trunks, leaves };
  }, [halfW, halfD]);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
        <planeGeometry args={[900, 900]} />
        <meshStandardMaterial map={textures.grass} roughness={1} />
      </mesh>
      {/* the site itself: dirt, see-through enough to show the basement */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[halfW * 2, halfD * 2]} />
        <meshStandardMaterial map={textures.dirt} roughness={1} transparent opacity={0.82} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, halfD + 5]} receiveShadow>
        <planeGeometry args={[900, 8]} />
        <meshStandardMaterial color="#52525b" roughness={0.95} />
      </mesh>
      {/* landscaped garden in front of each finished wing */}
      {done.map((d, i) => d ? (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[(i - (done.length - 1) / 2) * GAP, 0.03, 22]} receiveShadow>
          <planeGeometry args={[30, 10]} />
          <meshStandardMaterial color="#4d7c0f" roughness={1} />
        </mesh>
      ) : null)}
      <Boxes items={stuff.fence} color="#1d4ed8" roughness={0.6} metalness={0.3} />
      <Boxes items={stuff.bags} color="#d6c7a1" roughness={1} />
      <Boxes items={stuff.slabs} color="#d4d4d8" roughness={0.4} />
      <Boxes items={stuff.steel} color="#57534e" metalness={0.6} roughness={0.5} />
      <Boxes items={stuff.trunks} color="#6b4423" />
      <Boxes items={stuff.leaves} color="#3f6212" roughness={1} />
      <mesh position={[span / 2 + 18, 1, halfD - 8]} castShadow><coneGeometry args={[3.5, 2.2, 18]} /><meshStandardMaterial color="#c2a46d" roughness={1} /></mesh>
    </group>
  );
}

export function Crane({ x, top }: { x: number; top: number }) {
  const mast = Math.max(30, top + 12);
  const lattice: Box[] = useMemo(() => {
    const out: Box[] = [];
    for (let yy = 0; yy < mast; yy += 2) out.push([0, yy + 1, 0, 1.6, 0.08, 0.08], [0, yy + 1, 0, 0.08, 0.08, 1.6]);
    for (const [cx, cz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) out.push([cx, mast / 2, cz, 0.14, mast, 0.14]);
    out.push([-12, mast + 0.6, 0, 30, 0.5, 0.9], [9, mast + 0.6, 0, 8, 0.5, 0.9]);
    return out;
  }, [mast]);
  return (
    <group position={[x + 19, 0, -10]}>
      <Boxes items={lattice} color="#eab308" metalness={0.3} roughness={0.5} />
      <mesh position={[11, mast - 0.6, 0]} castShadow><boxGeometry args={[3, 2.2, 2.4]} /><meshStandardMaterial color="#475569" /></mesh>
      <mesh position={[0.6, mast - 1.2, 1.4]}><boxGeometry args={[1.6, 1.6, 1.6]} /><meshStandardMaterial color="#e2e8f0" /></mesh>
      <mesh position={[-20, mast - 6, 0]}><boxGeometry args={[0.06, 12, 0.06]} /><meshStandardMaterial color="#1f2937" /></mesh>
      <mesh position={[-20, mast - 12.4, 0]}><boxGeometry args={[1.2, 0.8, 1.2]} /><meshStandardMaterial color="#b91c1c" /></mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------

export function Scene4D({ model, at, mode, selected, onSelect, onHover }: {
  model: Model4D; at: number; mode: Mode; selected: Pick | null;
  onSelect: (p: Pick) => void; onHover: (p: (Pick & { state: LevelState }) | null) => void;
}) {
  const textures = useTextures();
  const [hover, setHover] = useState<Pick | null>(null);

  const layout = useMemo(() => model.towers.map((tw, i) => {
    let y = 0;
    const base = tw.levels.filter((l) => l.kind === "basement");
    const rest = tw.levels.filter((l) => l.kind !== "basement");
    const placed = [
      ...base.map((l, k) => ({ l, y: -(base.length - k) * DIMS.basement.h })),
      ...rest.map((l) => { const y0 = y; y += DIMS[l.kind].h; return { l, y: y0 }; }),
    ];
    return { tw, i, x: (i - (model.towers.length - 1) / 2) * GAP, placed, height: y };
  }), [model]);

  const { parts, towerInfo } = useMemo(() => {
    const p = emptyParts();
    const towerInfo = layout.map(({ placed, x }, ti) => {
      const states = placed.map(({ l }) => levelState(l, at, mode));
      placed.forEach(({ l, y }, k) => addLevel(p, l, states[k], x, y, ti * 1000 + k));
      const castingIdx = placed.findIndex((pl, k) => states[k].phase === "casting" && pl.l.kind !== "basement");
      const builtTop = placed.reduce((m, pl, k) => (states[k].phase !== "none" ? Math.max(m, pl.y + DIMS[pl.l.kind].h) : m), 0);
      const complete = states.every((s) => s.phase === "complete");
      const structureUnderway = states.some((s, k) => placed[k].l.kind !== "basement" && (s.phase === "casting")) || (builtTop > 0 && states.some((s, k) => s.phase === "none" && placed[k].l.kind !== "basement"));
      return { states, castingIdx, builtTop, complete, structureUnderway };
    });
    return { parts: p, towerInfo };
  }, [layout, at, mode]);

  const span = (model.towers.length - 1) * GAP + 30;

  return (
    <Canvas shadows camera={{ position: [95, 62, 120], fov: 38, near: 1, far: 3000 }} dpr={[1, 2]}>
      <Sky sunPosition={[120, 90, 80]} turbidity={7} rayleigh={1.2} />
      <hemisphereLight args={["#dbeafe", "#a8a29e", 0.55]} />
      <directionalLight position={[90, 130, 80]} intensity={1.7} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-140} shadow-camera-right={140} shadow-camera-top={160} shadow-camera-bottom={-60} shadow-bias={-0.0004} />
      <fog attach="fog" args={["#dfe7ee", 260, 900]} />

      <Site textures={textures} span={span} done={towerInfo.map((t) => t.complete)} />

      <Boxes items={parts.concrete} map={textures.concrete} />
      <Boxes items={parts.fresh} map={textures.fresh} />
      <Boxes items={parts.brick} map={textures.brick} roughness={0.95} />
      <Boxes items={parts.plaster} map={textures.plaster} roughness={0.9} />
      <Boxes items={parts.paint} map={textures.paint} roughness={0.7} />
      <Boxes items={parts.accent} color="#b9673a" roughness={0.7} />
      <Boxes items={parts.white} color="#f8fafc" roughness={0.6} />
      <Boxes items={parts.glass} color="#5b8db8" roughness={0.08} metalness={0.6} shadows={false} />
      <Boxes items={parts.frame} color="#334155" roughness={0.4} metalness={0.5} />
      <Boxes items={parts.railing} color="#a5c8dc" roughness={0.1} metalness={0.3} transparent opacity={0.55} shadows={false} />
      <Boxes items={parts.scaffold} color="#8a8f98" roughness={0.45} metalness={0.7} />
      <Boxes items={parts.plank} map={textures.wood} />
      <Boxes items={parts.formwork} map={textures.wood} roughness={0.8} />
      <Boxes items={parts.rebar} color="#7c2d12" roughness={0.6} metalness={0.5} shadows={false} />
      <Boxes items={parts.vest} color="#f97316" roughness={0.8} />
      <Boxes items={parts.helmet} color="#facc15" roughness={0.4} />

      {layout.map(({ tw, i, x, placed, height }) => {
        const info = towerInfo[i];
        return (
          <group key={tw.uid}>
            {/* Invisible box per level for hover and click; outlines the future floors still to be built. */}
            {placed.map(({ l, y }, k) => {
              const { w, d, h } = DIMS[l.kind];
              const isSel = selected?.tower === i && selected.level === l.key;
              const isHover = hover?.tower === i && hover.level === l.key;
              const ghost = info.states[k].phase === "none";
              return (
                <mesh
                  key={l.key}
                  position={[x, y + h / 2, 0]}
                  onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect({ tower: i, level: l.key }); }}
                  onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHover({ tower: i, level: l.key }); onHover({ tower: i, level: l.key, state: info.states[k] }); }}
                  onPointerOut={() => { setHover(null); onHover(null); }}
                >
                  <boxGeometry args={[w + 0.2, h, d + 0.2]} />
                  <meshBasicMaterial transparent opacity={isSel ? 0.18 : isHover ? 0.1 : ghost ? 0.035 : 0} color={isSel ? "#2563eb" : "#ffffff"} depthWrite={false} />
                  {(isSel || isHover || ghost) && <Edges color={isSel ? "#2563eb" : isHover ? "#0f172a" : "#ffffff"} threshold={15} />}
                </mesh>
              );
            })}
            {info.structureUnderway && <Crane x={x} top={info.builtTop} />}
            <Html position={[x, Math.max(height, info.builtTop) + 5, 0]} center distanceFactor={150} zIndexRange={[10, 0]}>
              <div className={`pointer-events-none whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold text-white shadow ${info.complete ? "bg-emerald-600/90" : "bg-slate-900/85"}`}>
                {tw.name}{info.complete ? " · complete" : info.castingIdx >= 0 ? ` · casting ${placed[info.castingIdx].l.name}` : ""}
              </div>
            </Html>
          </group>
        );
      })}
      <OrbitControls target={[0, 28, 0]} maxPolarAngle={Math.PI / 2.05} minDistance={25} maxDistance={500} enableDamping />
    </Canvas>
  );
}

