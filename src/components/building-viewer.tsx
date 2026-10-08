"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bounds, ContactShadows, Edges, OrbitControls, Sky } from "@react-three/drei";
import { CanvasTexture, DoubleSide, RepeatWrapping, SRGBColorSpace } from "three";
import type { BuildingModel } from "@/lib/types";
import { Badge, Button, Card, Empty, HealthBadge } from "./ui";
import { CalculatedMark } from "./ai";
import { fmtDate, signed } from "@/lib/format";
import type { ThreeEvent } from "@react-three/fiber";

const WALL = "#f2d7b0";
const PAINT = "#f7ebe0";
const CONCRETE = "#c5bfb3";
const SLAB = "#ddd6cb";
const FLOOR = "#d2b48c";
const FRAME = "#5c4033";
const DOOR = "#6b3a2a";
const GLASS = "#8ecae6";
const LIGHT = "#fff6c8";
const GRASS = "#5f8f3e";
const ASPHALT = "#9a9388";
const PARAPET = "#e8d4b0";
const MEP = "#5b8def";

function progressAt(activity: BuildingModel["activities"][number], day: Date) {
  const hist = activity.history.filter((h) => new Date(h.date) <= day);
  if (hist.length) return hist[hist.length - 1].progress;
  if (new Date(activity.plannedStart) > day) return 0;
  return activity.actualProgress;
}

function componentProgress(model: BuildingModel, ids: string[], day: Date) {
  const acts = ids.map((id) => model.activities.find((a) => a.id === id)).filter(Boolean) as BuildingModel["activities"];
  if (!acts.length) return null;
  return acts.reduce((t, a) => t + progressAt(a, day), 0) / acts.length;
}

function appearance(type: string, wallColor: string, night: boolean, selected: boolean) {
  if (selected) return { color: "#1e293b", roughness: 0.5, metalness: 0.1, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
  switch (type) {
    case "wall":
    case "parapet":
      return { color: type === "parapet" ? PARAPET : wallColor || WALL, roughness: 0.92, metalness: 0.02, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "podium":
      return { color: "#3a3d44", roughness: 0.84, metalness: 0.06, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "fin":
      return { color: "#2b2e34", roughness: 0.62, metalness: 0.22, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "marker":
      return { color: "#c81d2d", roughness: 0.45, metalness: 0.08, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "glass":
      return {
        color: "#d5e6ee", roughness: 0.04, metalness: 0.25, opacity: night ? 0.55 : 0.38, transparent: true,
        emissive: night ? "#ffe7b0" : "#f7fbff", emissiveIntensity: night ? 0.6 : 0.15,
      };
    case "flooring":
      return { color: FLOOR, roughness: 0.55, metalness: 0.05, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "slab":
      return { color: SLAB, roughness: 0.85, metalness: 0.02, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "column":
      return { color: CONCRETE, roughness: 0.8, metalness: 0.04, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "mullion":
    case "frame":
      return { color: type === "mullion" ? "#f7f1e8" : "#4a3728", roughness: 0.45, metalness: 0.12, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "railing":
      return { color: "#2f3540", roughness: 0.35, metalness: 0.55, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "furniture":
      return { color: "#8b5a2b", roughness: 0.6, metalness: 0.05, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "bed":
      return { color: "#f7f4ee", roughness: 0.72, metalness: 0.02, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "sofa":
      return { color: "#c4a882", roughness: 0.7, metalness: 0.02, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "dining":
      return { color: "#5e6b78", roughness: 0.45, metalness: 0.12, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "kitchen":
      return { color: "#3f4650", roughness: 0.4, metalness: 0.18, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "wc":
      return { color: "#f8fafc", roughness: 0.28, metalness: 0.08, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "wardrobe":
      return { color: "#b08968", roughness: 0.55, metalness: 0.06, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "lift":
      return { color: "#4b5563", roughness: 0.35, metalness: 0.45, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "canopy":
    case "step":
      return { color: "#c9c2b6", roughness: 0.8, metalness: 0.05, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "band":
      return { color: "#d7c4a3", roughness: 0.75, metalness: 0.04, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "ac":
      return { color: "#9aa3ad", roughness: 0.4, metalness: 0.35, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "hedge":
      return { color: "#4f7a3e", roughness: 0.95, metalness: 0, opacity: 1, emissive: night ? "#1a3318" : "#000", emissiveIntensity: 0 };
    case "tree":
      return { color: "#3f7a32", roughness: 0.9, metalness: 0, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "trunk":
      return { color: "#5c3a21", roughness: 0.9, metalness: 0, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "ground":
      return { color: GRASS, roughness: 1, metalness: 0, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "window":
      return {
        color: "#7ec8e3", roughness: 0.04, metalness: 0.25, opacity: night ? 0.78 : 0.38, transparent: true,
        emissive: night ? "#ffcc66" : "#eaf6ff", emissiveIntensity: night ? 2.2 : 0.25,
      };
    case "door":
      return { color: DOOR, roughness: 0.55, metalness: 0.08, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "light":
      return { color: LIGHT, roughness: 0.2, metalness: 0.3, opacity: 1, emissive: LIGHT, emissiveIntensity: night ? 3.2 : 1.1 };
    case "balcony":
      return { color: "#f7f5f1", roughness: 0.62, metalness: 0.04, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "stair":
      return { color: "#d9d0c3", roughness: 0.62, metalness: 0.04, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "mep":
      return { color: MEP, roughness: 0.45, metalness: 0.25, opacity: 1, emissive: night ? "#8cb4ff" : "#000", emissiveIntensity: night ? 0.4 : 0 };
    case "beam":
      return { color: "#b9b3a8", roughness: 0.72, metalness: 0.06, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "shaft":
      return { color: "#d5dbe6", roughness: 0.25, metalness: 0.12, opacity: 0.22, emissive: "#000", emissiveIntensity: 0 };
    case "cold":
      return { color: "#2f6bff", roughness: 0.32, metalness: 0.5, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "hot":
      return { color: "#e11d2e", roughness: 0.32, metalness: 0.45, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "drain":
      return { color: "#3f3f46", roughness: 0.4, metalness: 0.3, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "conduit":
      return { color: "#f5c542", roughness: 0.38, metalness: 0.22, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "board":
      return { color: "#f8fafc", roughness: 0.45, metalness: 0.25, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "tile":
      return { color: "#f3e6d0", roughness: 0.42, metalness: 0.06, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "parking":
      return { color: ASPHALT, roughness: 0.95, metalness: 0, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    case "base":
      return { color: CONCRETE, roughness: 0.9, metalness: 0, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
    default:
      return { color: type === "column" ? MEP : CONCRETE, roughness: 0.7, metalness: 0.05, opacity: 1, emissive: "#000", emissiveIntensity: 0 };
  }
}

function lookType(c: BuildingModel["components"][number]) {
  if (c.subtype === "glass" || c.subtype === "fin" || c.subtype === "marker" || c.subtype === "lift") return c.subtype;
  if (c.type === "furniture" && c.subtype) return c.subtype;
  if (c.skin === "podium" && (c.type === "wall" || c.type === "parapet" || c.type === "band" || c.type === "column")) return "podium";
  if (c.subtype === "cold" || c.subtype === "hot" || c.subtype === "drain" || c.subtype === "conduit" || c.subtype === "board" || c.subtype === "tile") return c.subtype;
  if (c.type === "beam" || c.type === "shaft" || c.type === "pipe") return c.type === "pipe" ? (c.subtype || "mep") : c.type;
  if (c.category === "mep" && c.type === "column") return "mep";
  if (c.subtype === "trunk") return "trunk";
  if (c.subtype === "crown") return "tree";
  return c.type;
}

const FACADE = new Set(["wall", "window", "door", "frame", "mullion", "band", "canopy"]);

function cutAway(c: BuildingModel["components"][number]) {
  if (c.side === "front" && FACADE.has(c.type)) return true;
  if (c.type === "parapet" && c.position[2] < 0.5) return true;
  if (c.type === "furniture") return true;
  return false;
}

function PartGeometry({ c }: { c: BuildingModel["components"][number] }) {
  const [sx, sy, sz] = c.size;
  const cubic = Math.abs(sx - sy) < 0.12 && Math.abs(sy - sz) < 0.12;
  if (c.type === "tree" && c.subtype === "crown") return <sphereGeometry args={[Math.max(sx, sy, sz) / 2, 18, 14]} />;
  if (c.type === "tree" || c.subtype === "trunk") return <cylinderGeometry args={[sx / 2, sx / 2.3, sy, 8]} />;
  if (c.type === "pipe" || c.subtype === "cold" || c.subtype === "hot" || c.subtype === "drain" || c.subtype === "conduit") {
    return <cylinderGeometry args={[sx / 2, sx / 2, sy, 12]} />;
  }
  if (c.type === "column" && c.category !== "mep") return <cylinderGeometry args={[sx / 2, sx / 2, sy, 8]} />;
  if (c.type === "light" && cubic) return <sphereGeometry args={[Math.max(sx, sz) / 2, 14, 12]} />;
  if (c.type === "light" && sy > sx) return <cylinderGeometry args={[sx / 2, sx / 2.5, sy, 8]} />;
  if (c.type === "railing" && sx <= 0.08 && sz <= 0.08) return <cylinderGeometry args={[sx / 2, sx / 2, sy, 6]} />;
  return <boxGeometry args={c.size} />;
}

function Fit({ color, opacity, roughness = 0.55, metalness = 0.05 }: { color: string; opacity: number; roughness?: number; metalness?: number }) {
  return <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} transparent={opacity < 0.99} opacity={opacity} />;
}

function BedShape({ w, h, d, opacity, tint }: { w: number; h: number; d: number; opacity: number; tint: string | null }) {
  const alongX = w >= d;
  const L = Math.max(w, d);
  const W = Math.min(w, d);
  const y0 = -h / 2;
  const mattressH = Math.min(0.28, h * 0.62);
  return (
    <group rotation={[0, alongX ? 0 : Math.PI / 2, 0]}>
      <mesh position={[0, y0 + mattressH / 2, 0]} receiveShadow>
        <boxGeometry args={[L * 0.9, mattressH, W * 0.88]} />
        <Fit color={tint || "#f7f4ee"} opacity={opacity} />
      </mesh>
      <mesh position={[-L / 2 + 0.045, y0 + h * 0.7, 0]}>
        <boxGeometry args={[0.08, Math.max(h, 0.7), W * 0.94]} />
        <Fit color={tint || "#8d6a45"} opacity={opacity} roughness={0.48} />
      </mesh>
      {[-0.2, 0.2].map((side) => (
        <mesh key={side} position={[-L * 0.28, y0 + mattressH + 0.05, side * W]}>
          <boxGeometry args={[L * 0.2, 0.08, W * 0.3]} />
          <Fit color={tint || "#ffffff"} opacity={opacity} roughness={0.7} />
        </mesh>
      ))}
      <mesh position={[L * 0.1, y0 + mattressH + 0.03, 0]} receiveShadow>
        <boxGeometry args={[L * 0.52, 0.05, W * 0.8]} />
        <Fit color={tint || "#c5d2c4"} opacity={opacity} />
      </mesh>
    </group>
  );
}

function SofaShape({ w, h, d, opacity, tint }: { w: number; h: number; d: number; opacity: number; tint: string | null }) {
  const alongX = w >= d;
  const L = Math.max(w, d);
  const W = Math.min(w, d);
  const y0 = -h / 2;
  const seatH = h * 0.55;
  return (
    <group rotation={[0, alongX ? 0 : Math.PI / 2, 0]}>
      <mesh position={[0, y0 + seatH / 2, W * 0.06]} receiveShadow>
        <boxGeometry args={[L * 0.78, seatH, W * 0.62]} />
        <Fit color={tint || "#c4a882"} opacity={opacity} roughness={0.7} />
      </mesh>
      <mesh position={[0, y0 + h * 0.62, -W * 0.32]}>
        <boxGeometry args={[L * 0.9, h * 0.75, W * 0.22]} />
        <Fit color={tint || "#a68462"} opacity={opacity} roughness={0.68} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * L * 0.44, y0 + h * 0.48, W * 0.02]}>
          <boxGeometry args={[L * 0.12, h * 0.7, W * 0.72]} />
          <Fit color={tint || "#a68462"} opacity={opacity} roughness={0.68} />
        </mesh>
      ))}
      {[-0.25, 0.25].map((side) => (
        <mesh key={`c${side}`} position={[side * L, y0 + seatH + 0.04, W * 0.08]}>
          <boxGeometry args={[L * 0.32, 0.07, W * 0.48]} />
          <Fit color={tint || "#ddc7a6"} opacity={opacity} roughness={0.72} />
        </mesh>
      ))}
    </group>
  );
}

function DiningShape({ w, h, d, opacity, tint }: { w: number; h: number; d: number; opacity: number; tint: string | null }) {
  const y0 = -h / 2;
  const topY = y0 + h * 0.7;
  const legH = Math.max(0.2, topY - y0 - 0.03);
  const chair = Math.min(w, d) * 0.22;
  return (
    <group>
      <mesh position={[0, topY, 0]} receiveShadow>
        <boxGeometry args={[w * 0.58, 0.05, d * 0.55]} />
        <Fit color={tint || "#5c6770"} opacity={opacity} metalness={0.18} roughness={0.38} />
      </mesh>
      {([[-1, -1], [1, -1], [-1, 1], [1, 1]] as const).map(([sx, sz], i) => (
        <mesh key={i} position={[sx * w * 0.2, y0 + legH / 2, sz * d * 0.18]}>
          <cylinderGeometry args={[0.03, 0.03, legH, 8]} />
          <Fit color={tint || "#4b5563"} opacity={opacity} metalness={0.25} roughness={0.4} />
        </mesh>
      ))}
      {([[-1, 0], [1, 0], [0, -1], [0, 1]] as const).map(([sx, sz], i) => (
        <group key={`chair${i}`} position={[sx * w * 0.38, 0, sz * d * 0.36]}>
          <mesh position={[0, y0 + h * 0.32, 0]}>
            <boxGeometry args={[chair, 0.05, chair]} />
            <Fit color={tint || "#e5e7eb"} opacity={opacity} />
          </mesh>
          <mesh position={[-sx * chair * 0.35, y0 + h * 0.5, -sz * chair * 0.35]}>
            <boxGeometry args={[sz !== 0 ? chair : 0.04, h * 0.28, sx !== 0 ? chair : 0.04]} />
            <Fit color={tint || "#d1d5db"} opacity={opacity} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function KitchenShape({ w, h, d, opacity, tint }: { w: number; h: number; d: number; opacity: number; tint: string | null }) {
  const alongX = w >= d;
  const L = Math.max(w, d);
  const W = Math.min(w, d);
  const y0 = -h / 2;
  return (
    <group rotation={[0, alongX ? 0 : Math.PI / 2, 0]}>
      <mesh position={[0, y0 + h * 0.44, 0]} receiveShadow>
        <boxGeometry args={[L * 0.98, h * 0.84, W * 0.94]} />
        <Fit color={tint || "#3f4650"} opacity={opacity} metalness={0.12} roughness={0.42} />
      </mesh>
      <mesh position={[0, y0 + h * 0.9, 0]} receiveShadow>
        <boxGeometry args={[L, 0.045, W]} />
        <Fit color={tint || "#9ca3af"} opacity={opacity} metalness={0.28} roughness={0.32} />
      </mesh>
      <mesh position={[-L * 0.22, y0 + h * 0.94, 0]}>
        <boxGeometry args={[L * 0.26, 0.02, W * 0.5]} />
        <Fit color={tint || "#111827"} opacity={opacity} metalness={0.45} roughness={0.28} />
      </mesh>
      {([[-0.07, -0.14], [-0.07, 0.14], [0.07, -0.14], [0.07, 0.14]] as const).map(([bx, bz], i) => (
        <mesh key={i} position={[-L * 0.22 + bx * L, y0 + h * 0.96, bz * W]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[Math.min(0.08, W * 0.12), Math.min(0.08, W * 0.12), 0.015, 10]} />
          <Fit color={tint || "#1f2937"} opacity={opacity} metalness={0.5} roughness={0.3} />
        </mesh>
      ))}
      <mesh position={[L * 0.24, y0 + h * 0.93, 0]}>
        <boxGeometry args={[L * 0.2, 0.025, W * 0.42]} />
        <Fit color={tint || "#f8fafc"} opacity={opacity} metalness={0.4} roughness={0.22} />
      </mesh>
      <mesh position={[L * 0.24, y0 + h + 0.06, -W * 0.12]}>
        <boxGeometry args={[0.025, 0.14, 0.025]} />
        <Fit color={tint || "#e5e7eb"} opacity={opacity} metalness={0.65} roughness={0.25} />
      </mesh>
    </group>
  );
}

function ToiletShape({ w, h, d, opacity, tint }: { w: number; h: number; d: number; opacity: number; tint: string | null }) {
  const alongZ = d >= w;
  const L = Math.max(w, d);
  const W = Math.min(w, d);
  const y0 = -h / 2;
  return (
    <group rotation={[0, alongZ ? 0 : Math.PI / 2, 0]}>
      <mesh position={[0, y0 + h * 0.42, L * 0.26]}>
        <boxGeometry args={[W * 0.72, h * 0.62, L * 0.34]} />
        <Fit color={tint || "#f8fafc"} opacity={opacity} roughness={0.28} metalness={0.08} />
      </mesh>
      <mesh position={[0, y0 + h * 0.32, -L * 0.08]} receiveShadow>
        <cylinderGeometry args={[W * 0.42, W * 0.34, h * 0.38, 14]} />
        <Fit color={tint || "#f8fafc"} opacity={opacity} roughness={0.25} metalness={0.08} />
      </mesh>
      <mesh position={[0, y0 + h * 0.52, -L * 0.06]}>
        <cylinderGeometry args={[W * 0.3, W * 0.3, 0.035, 14]} />
        <Fit color={tint || "#e2e8f0"} opacity={opacity} roughness={0.3} metalness={0.1} />
      </mesh>
    </group>
  );
}

function WardrobeShape({ w, h, d, opacity, tint }: { w: number; h: number; d: number; opacity: number; tint: string | null }) {
  const thinIsZ = d <= w;
  const L = Math.max(w, d);
  const T = Math.min(w, d);
  return (
    <group rotation={[0, thinIsZ ? 0 : Math.PI / 2, 0]}>
      <mesh receiveShadow>
        <boxGeometry args={[L * 0.96, h * 0.98, T * 0.9]} />
        <Fit color={tint || "#c4a574"} opacity={opacity} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, T * 0.46]}>
        <boxGeometry args={[0.02, h * 0.86, 0.015]} />
        <Fit color={tint || "#8a6240"} opacity={opacity} roughness={0.45} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * L * 0.08, 0, T * 0.48]}>
          <boxGeometry args={[0.025, 0.14, 0.02]} />
          <Fit color={tint || "#e7e5e4"} opacity={opacity} metalness={0.55} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

function DoorShape({ size, opacity, tint }: { size: [number, number, number]; opacity: number; tint: string | null }) {
  const [w, h, d] = size;
  const alongX = d <= w;
  const W = Math.max(0.4, alongX ? w : d);
  const glazed = W > 1.35;
  const frame = tint || "#4a3428";
  const leaf = tint || (glazed ? "#dbe7ee" : "#7a4e32");
  const panel = tint || "#8d5e3e";
  return (
    <group rotation={[0, alongX ? 0 : Math.PI / 2, 0]}>
      <mesh position={[-W / 2 + 0.03, 0, 0]}>
        <boxGeometry args={[0.06, h, 0.08]} />
        <Fit color={frame} opacity={opacity} roughness={0.5} />
      </mesh>
      <mesh position={[W / 2 - 0.03, 0, 0]}>
        <boxGeometry args={[0.06, h, 0.08]} />
        <Fit color={frame} opacity={opacity} roughness={0.5} />
      </mesh>
      <mesh position={[0, h / 2 - 0.03, 0]}>
        <boxGeometry args={[W, 0.06, 0.08]} />
        <Fit color={frame} opacity={opacity} roughness={0.5} />
      </mesh>
      <mesh position={[0, -0.03, 0]}>
        <boxGeometry args={[W - 0.14, h - 0.12, glazed ? 0.02 : 0.04]} />
        <Fit color={leaf} opacity={glazed ? Math.min(opacity, 0.45) : opacity} roughness={glazed ? 0.08 : 0.55} metalness={glazed ? 0.2 : 0.04} />
      </mesh>
      {!glazed && [-0.18, 0.2].map((fy) => (
        <mesh key={fy} position={[0, h * fy, 0.025]}>
          <boxGeometry args={[W * 0.62, h * 0.28, 0.012]} />
          <Fit color={panel} opacity={opacity} roughness={0.5} />
        </mesh>
      ))}
      {glazed && (
        <mesh position={[0, 0, 0.02]}>
          <boxGeometry args={[0.04, h - 0.2, 0.03]} />
          <Fit color={frame} opacity={opacity} />
        </mesh>
      )}
      <mesh position={[W * 0.32, -h * 0.05, 0.045]}>
        <boxGeometry args={[0.11, 0.028, 0.035]} />
        <Fit color={tint || "#e7e5e4"} opacity={opacity} metalness={0.7} roughness={0.25} />
      </mesh>
    </group>
  );
}

function WindowShape({ size, opacity, tint, side, dressed, night }: { size: [number, number, number]; opacity: number; tint: string | null; side?: string; dressed: boolean; night: boolean }) {
  const [w, h, d] = size;
  const alongX = d <= w;
  const W = Math.max(0.4, alongX ? w : d);
  const inside = side === "back" || side === "right" ? -1 : 1;
  const frame = tint || "#f4efe6";
  const glassOpacity = tint ? opacity : Math.min(opacity, night ? 0.55 : 0.32);
  return (
    <group rotation={[0, alongX ? 0 : Math.PI / 2, 0]}>
      {[[-W / 2 + 0.035, 0, 0.07, h], [W / 2 - 0.035, 0, 0.07, h]].map(([x, y, bw, bh], i) => (
        <mesh key={`j${i}`} position={[x, y, 0]}>
          <boxGeometry args={[bw, bh, 0.06]} />
          <Fit color={frame} opacity={opacity} roughness={0.4} />
        </mesh>
      ))}
      <mesh position={[0, h / 2 - 0.03, 0]}>
        <boxGeometry args={[W, 0.06, 0.06]} />
        <Fit color={frame} opacity={opacity} roughness={0.4} />
      </mesh>
      <mesh position={[0, -h / 2 + 0.03, 0]}>
        <boxGeometry args={[W, 0.06, 0.06]} />
        <Fit color={frame} opacity={opacity} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.04, h - 0.1, 0.05]} />
        <Fit color={frame} opacity={opacity} roughness={0.4} />
      </mesh>
      {[-0.25, 0.25].map((fx) => (
        <mesh key={fx} position={[fx * W, 0, 0]}>
          <boxGeometry args={[W * 0.42, h - 0.14, 0.015]} />
          <meshStandardMaterial color={tint || "#d5eaf3"} roughness={0.05} metalness={0.2} transparent opacity={glassOpacity} emissive={night ? "#ffd27a" : "#f7fbff"} emissiveIntensity={night ? 0.45 : 0.12} side={DoubleSide} depthWrite={false} />
        </mesh>
      ))}
      {dressed && h > 1 && W < 4.2 && (
        <group position={[0, 0, inside * 0.55]}>
          <mesh position={[0, h / 2 + 0.04, 0]}>
            <boxGeometry args={[W + 0.16, 0.05, 0.05]} />
            <Fit color={tint || "#9ca3af"} opacity={1} metalness={0.5} roughness={0.3} />
          </mesh>
          {[-1, 1].map((edge) => (
            <mesh key={edge} position={[edge * W * 0.3, -h * 0.04, 0]}>
              <boxGeometry args={[W * 0.34, h * 0.86, 0.08]} />
              <Fit color={tint || (edge < 0 ? "#f7f1e6" : "#eadcc4")} opacity={1} roughness={0.9} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}

const tileTextures: Partial<Record<"bath" | "kitchen", CanvasTexture>> = {};

function tileTexture(kind: "bath" | "kitchen") {
  const cached = tileTextures[kind];
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext("2d");
  const cells = kind === "bath" ? 8 : 4;
  if (g) {
    g.fillStyle = kind === "bath" ? "#9eb0bc" : "#7d6550";
    g.fillRect(0, 0, 256, 256);
    const cell = 256 / cells;
    for (let i = 0; i < cells; i++) {
      for (let j = 0; j < cells; j++) {
        const alt = (i + j) % 2 === 0;
        g.fillStyle = kind === "bath" ? (alt ? "#f7fbfc" : "#d5e6ee") : (alt ? "#f0d7b4" : "#d2a36a");
        g.fillRect(i * cell + 4, j * cell + 4, cell - 8, cell - 8);
      }
    }
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.anisotropy = 8;
  tileTextures[kind] = tex;
  return tex;
}

function TileFloor({ size, kind }: { size: [number, number, number]; kind: "bath" | "kitchen" }) {
  const [w, , d] = size;
  const tile = kind === "bath" ? 0.3 : 0.45;
  const map = useMemo(() => {
    const tex = tileTexture(kind).clone();
    tex.repeat.set(Math.max(1, w / tile), Math.max(1, d / tile));
    tex.needsUpdate = true;
    return tex;
  }, [kind, w, d, tile]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[Math.max(0.2, w), Math.max(0.2, d)]} />
      <meshStandardMaterial map={map} roughness={0.42} metalness={0.04} />
    </mesh>
  );
}

function CurtainShape({ w, h, d, opacity, tint }: { w: number; h: number; d: number; opacity: number; tint: string | null }) {
  const alongX = w >= d;
  const L = Math.max(w, d);
  return (
    <group rotation={[0, alongX ? 0 : Math.PI / 2, 0]}>
      <mesh position={[0, h / 2 - 0.03, 0]}>
        <boxGeometry args={[L, 0.05, 0.05]} />
        <Fit color={tint || "#9ca3af"} opacity={opacity} metalness={0.55} roughness={0.3} />
      </mesh>
      {[-1, 1].map((edge) => (
        <mesh key={edge} position={[edge * L * 0.26, -0.04, 0]}>
          <boxGeometry args={[L * 0.42, h * 0.9, 0.06]} />
          <Fit color={tint || (edge < 0 ? "#fbf7f0" : "#f0e2cc")} opacity={opacity} roughness={0.9} />
        </mesh>
      ))}
      {[-0.38, -0.16, 0.16, 0.38].map((fx) => (
        <mesh key={fx} position={[fx * L, -0.04, 0.02]}>
          <boxGeometry args={[0.02, h * 0.86, 0.015]} />
          <Fit color={tint || "#e4d2b4"} opacity={opacity} roughness={0.92} />
        </mesh>
      ))}
    </group>
  );
}

function SideShape({ w, h, d, opacity, tint }: { w: number; h: number; d: number; opacity: number; tint: string | null }) {
  return (
    <group>
      <mesh position={[0, -h * 0.15, 0]}>
        <boxGeometry args={[w * 0.9, h * 0.7, d * 0.9]} />
        <Fit color={tint || "#c4a574"} opacity={opacity} roughness={0.5} />
      </mesh>
      <mesh position={[0, h * 0.38, 0]}>
        <cylinderGeometry args={[0.04, 0.05, h * 0.35, 8]} />
        <Fit color={tint || "#e7e5e4"} opacity={opacity} roughness={0.4} />
      </mesh>
      <mesh position={[0, h * 0.58, 0]}>
        <sphereGeometry args={[0.09, 10, 8]} />
        <Fit color={tint || "#f8fafc"} opacity={opacity} roughness={0.3} />
      </mesh>
    </group>
  );
}

function TvShape({ w, h, d, opacity, tint }: { w: number; h: number; d: number; opacity: number; tint: string | null }) {
  const alongX = w >= d;
  const L = Math.max(w, d);
  const T = Math.min(w, d);
  return (
    <group rotation={[0, alongX ? 0 : Math.PI / 2, 0]}>
      <mesh position={[0, -h * 0.28, 0]}>
        <boxGeometry args={[L * 0.95, h * 0.35, T * 0.7]} />
        <Fit color={tint || "#d6d3d1"} opacity={opacity} roughness={0.45} />
      </mesh>
      <mesh position={[0, h * 0.12, 0]}>
        <boxGeometry args={[L * 0.72, h * 0.55, 0.04]} />
        <Fit color={tint || "#111827"} opacity={opacity} metalness={0.35} roughness={0.25} />
      </mesh>
    </group>
  );
}

function CoffeeShape({ w, h, d, opacity, tint }: { w: number; h: number; d: number; opacity: number; tint: string | null }) {
  return (
    <group>
      <mesh position={[0, h * 0.2, 0]}>
        <boxGeometry args={[w * 0.9, 0.04, d * 0.9]} />
        <Fit color={tint || "#8d6a45"} opacity={opacity} roughness={0.45} />
      </mesh>
      {([[-1, -1], [1, -1], [-1, 1], [1, 1]] as const).map(([sx, sz], i) => (
        <mesh key={i} position={[sx * w * 0.32, -h * 0.15, sz * d * 0.28]}>
          <boxGeometry args={[0.04, h * 0.55, 0.04]} />
          <Fit color={tint || "#4b5563"} opacity={opacity} metalness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

function BasinShape({ w, h, d, opacity, tint }: { w: number; h: number; d: number; opacity: number; tint: string | null }) {
  return (
    <group>
      <mesh position={[0, -h * 0.1, 0]}>
        <boxGeometry args={[w * 0.95, h * 0.7, d * 0.85]} />
        <Fit color={tint || "#f8fafc"} opacity={opacity} roughness={0.3} metalness={0.08} />
      </mesh>
      <mesh position={[0, h * 0.32, d * 0.05]}>
        <cylinderGeometry args={[Math.min(w, d) * 0.28, Math.min(w, d) * 0.22, 0.08, 12]} />
        <Fit color={tint || "#e2e8f0"} opacity={opacity} roughness={0.2} metalness={0.15} />
      </mesh>
      <mesh position={[0, h * 0.55, -d * 0.2]}>
        <boxGeometry args={[0.03, 0.16, 0.03]} />
        <Fit color={tint || "#d1d5db"} opacity={opacity} metalness={0.65} roughness={0.25} />
      </mesh>
    </group>
  );
}

function FridgeShape({ w, h, d, opacity, tint }: { w: number; h: number; d: number; opacity: number; tint: string | null }) {
  return (
    <group>
      <mesh>
        <boxGeometry args={[w * 0.92, h * 0.96, d * 0.9]} />
        <Fit color={tint || "#f3f4f6"} opacity={opacity} metalness={0.25} roughness={0.35} />
      </mesh>
      <mesh position={[0, h * 0.12, d * 0.46]}>
        <boxGeometry args={[w * 0.8, 0.02, 0.01]} />
        <Fit color={tint || "#9ca3af"} opacity={opacity} />
      </mesh>
      <mesh position={[w * 0.28, h * 0.22, d * 0.48]}>
        <boxGeometry args={[0.03, 0.16, 0.02]} />
        <Fit color={tint || "#6b7280"} opacity={opacity} metalness={0.5} />
      </mesh>
    </group>
  );
}

function FurnitureShape({ subtype, size, opacity, selected }: { subtype?: string; size: [number, number, number]; opacity: number; selected: boolean }) {
  const tint = selected ? "#1e293b" : null;
  const [w, h, d] = size;
  if (subtype === "bed") return <BedShape w={w} h={h} d={d} opacity={opacity} tint={tint} />;
  if (subtype === "sofa") return <SofaShape w={w} h={h} d={d} opacity={opacity} tint={tint} />;
  if (subtype === "dining") return <DiningShape w={w} h={h} d={d} opacity={opacity} tint={tint} />;
  if (subtype === "kitchen") return <KitchenShape w={w} h={h} d={d} opacity={opacity} tint={tint} />;
  if (subtype === "wc") return <ToiletShape w={w} h={h} d={d} opacity={opacity} tint={tint} />;
  if (subtype === "wardrobe") return <WardrobeShape w={w} h={h} d={d} opacity={opacity} tint={tint} />;
  if (subtype === "curtain") return <CurtainShape w={w} h={h} d={d} opacity={opacity} tint={tint} />;
  if (subtype === "side") return <SideShape w={w} h={h} d={d} opacity={opacity} tint={tint} />;
  if (subtype === "tv") return <TvShape w={w} h={h} d={d} opacity={opacity} tint={tint} />;
  if (subtype === "coffee") return <CoffeeShape w={w} h={h} d={d} opacity={opacity} tint={tint} />;
  if (subtype === "basin") return <BasinShape w={w} h={h} d={d} opacity={opacity} tint={tint} />;
  if (subtype === "fridge") return <FridgeShape w={w} h={h} d={d} opacity={opacity} tint={tint} />;
  return (
    <mesh receiveShadow>
      <boxGeometry args={size} />
      <Fit color={tint || "#8b5a2b"} opacity={opacity} />
    </mesh>
  );
}

function Part({
  c, model, day, explode, night, fourD, bim, selected, wallColor, simple, onSelect,
}: {
  c: BuildingModel["components"][number];
  model: BuildingModel;
  day: Date;
  explode: boolean;
  night: boolean;
  fourD: boolean;
  bim: boolean;
  selected: boolean;
  wallColor: string;
  simple: boolean;
  onSelect: (id: string) => void;
}) {
  const y = c.position[1] + (explode && c.floorIndex >= 0 ? c.floorIndex * 1.8 : 0);
  const p = componentProgress(model, c.activityIds, day);
  const siteAlways = c.category === "site" || ["parking", "light", "tree", "hedge", "step", "canopy", "ground"].includes(c.type);
  const built = !fourD || p === null || p >= 8 || siteAlways;
  const ghost = fourD && p !== null && p < 100 && p >= 8 && !siteAlways;
  const look = appearance(lookType(c), wallColor, night, selected);
  const shell = bim && (c.type === "wall" || c.type === "parapet");
  const opacity = !built ? 0 : shell ? 0.2 : ghost ? Math.max(0.4, (p || 0) / 100) : look.opacity;
  if (!built) return null;
  const glass = c.type === "window" || c.type === "shaft" || c.subtype === "glass";
  const edged = c.type === "wall" || c.type === "parapet" || c.type === "frame" || c.type === "slab" || c.type === "beam" || c.type === "shaft";

  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(c.id);
  };

  if (simple && (c.type === "window" || c.type === "door" || c.type === "furniture")) {
    return (
      <mesh position={[c.position[0], y, c.position[2]]} rotation={c.rotation || [0, 0, 0]} onClick={click}>
        <boxGeometry args={c.size} />
        <meshStandardMaterial
          color={c.type === "window" ? "#9fd4ea" : c.type === "door" ? "#6b3a2a" : "#c4a574"}
          transparent={c.type === "window"}
          opacity={c.type === "window" ? 0.45 : 1}
          roughness={c.type === "window" ? 0.08 : 0.6}
          metalness={c.type === "window" ? 0.2 : 0.04}
        />
      </mesh>
    );
  }

  if (c.type === "flooring" && (c.subtype === "bath" || c.subtype === "kitchen-tile")) {
    return (
      <group position={[c.position[0], y, c.position[2]]} onClick={click}>
        <TileFloor size={c.size} kind={c.subtype === "bath" ? "bath" : "kitchen"} />
      </group>
    );
  }

  if (c.type === "furniture" || c.type === "door" || c.type === "window") {
    const tint = selected ? "#1e293b" : null;
    return (
      <group position={[c.position[0], y, c.position[2]]} rotation={c.rotation || [0, 0, 0]} onClick={click}>
        {c.type === "door" && <DoorShape size={c.size} opacity={opacity} tint={tint} />}
        {c.type === "window" && <WindowShape size={c.size} opacity={opacity} tint={tint} side={c.side} dressed={c.subtype === "dressed"} night={night} />}
        {c.type === "furniture" && <FurnitureShape subtype={c.subtype} size={c.size} opacity={opacity} selected={selected} />}
      </group>
    );
  }

  return (
    <mesh
      position={[c.position[0], y, c.position[2]]}
      rotation={c.rotation || [0, 0, 0]}
      castShadow={!simple}
      receiveShadow={!simple}
      onClick={click}
    >
      <PartGeometry c={c} />
      {glass ? (
        <meshStandardMaterial
          color={look.color}
          roughness={0.04}
          metalness={0.22}
          transparent
          opacity={opacity}
          emissive={look.emissive}
          emissiveIntensity={look.emissiveIntensity}
          side={DoubleSide}
          depthWrite={false}
        />
      ) : (
        <meshStandardMaterial
          color={look.color}
          roughness={look.roughness}
          metalness={look.metalness}
          transparent={opacity < 0.99}
          opacity={opacity}
          emissive={look.emissive}
          emissiveIntensity={look.emissiveIntensity}
        />
      )}
      {edged && !simple && <Edges threshold={22} color={c.type === "shaft" ? "#64748b" : "#9a8466"} />}
    </mesh>
  );
}

type FlatHit = {
  key: string;
  floorName: string;
  unit: string;
  floorIndex: number;
  cx: number;
  cy: number;
  cz: number;
  w: number;
  d: number;
};

function flatHitsOf(model: BuildingModel): FlatHit[] {
  const acc = new Map<string, { floorName: string; unit: string; floorIndex: number; minX: number; maxX: number; minZ: number; maxZ: number; y: number }>();
  for (const c of model.components) {
    if (!c.unit || !c.floorName) continue;
    const key = `${c.floorIndex}:${c.unit}`;
    const hx = c.size[0] / 2;
    const hz = c.size[2] / 2;
    const x0 = c.position[0] - hx;
    const x1 = c.position[0] + hx;
    const z0 = c.position[2] - hz;
    const z1 = c.position[2] + hz;
    const cur = acc.get(key);
    if (!cur) {
      acc.set(key, { floorName: c.floorName, unit: c.unit, floorIndex: c.floorIndex, minX: x0, maxX: x1, minZ: z0, maxZ: z1, y: c.position[1] });
    } else {
      cur.minX = Math.min(cur.minX, x0);
      cur.maxX = Math.max(cur.maxX, x1);
      cur.minZ = Math.min(cur.minZ, z0);
      cur.maxZ = Math.max(cur.maxZ, z1);
      cur.y = Math.min(cur.y, c.position[1]);
    }
  }
  return [...acc.values()].map((b) => ({
    key: `${b.floorIndex}:${b.unit}`,
    floorName: b.floorName,
    unit: b.unit,
    floorIndex: b.floorIndex,
    cx: (b.minX + b.maxX) / 2,
    cz: (b.minZ + b.maxZ) / 2,
    cy: b.y,
    w: Math.max(1.2, b.maxX - b.minX),
    d: Math.max(1.2, b.maxZ - b.minZ),
  })).sort((a, b) => a.floorIndex - b.floorIndex || a.unit.localeCompare(b.unit));
}

function FlatCamera({ flat }: { flat: FlatHit | null }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { target: { set: (x: number, y: number, z: number) => void }; update: () => void } | null;
  useEffect(() => {
    if (!flat) return;
    camera.position.set(flat.cx - flat.w * 0.15, flat.cy + 11, flat.cz + Math.max(6, flat.d * 0.85));
    controls?.target.set(flat.cx, flat.cy + 0.4, flat.cz);
    controls?.update();
  }, [flat, camera, controls]);
  return null;
}

function FloorPlanCamera({ floor, model }: { floor: string; model: BuildingModel }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { target: { set: (x: number, y: number, z: number) => void }; update: () => void } | null;
  useEffect(() => {
    if (floor === "all") return;
    const levels = model.towers[0]?.floors ?? [];
    const i = levels.findIndex((f) => f.name === floor);
    if (i < 0 || !levels[i].storey) return;
    const { plateWidthM: w, plateDepthM: d, floorHeightM: h } = model.dimensions;
    const y = i * h + 0.3;
    camera.position.set(w * 0.15, y + Math.max(18, d * 1.4), d * 0.5 + 14);
    controls?.target.set(w / 2, y, d / 2);
    controls?.update();
  }, [floor, camera, controls, model]);
  return null;
}

function ZoomWatch({ floorHeight, enabled, onNear }: { floorHeight: number; enabled: boolean; onNear: (floors: number[] | null) => void }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { target: { distanceTo: (v: { x: number; y: number; z: number }) => number } } | null;
  const last = useRef("");
  useFrame(() => {
    if (!enabled) {
      if (last.current) { last.current = ""; onNear(null); }
      return;
    }
    const dist = controls?.target ? camera.position.distanceTo(controls.target as never) : camera.position.length();
    if (dist > 48) {
      if (last.current !== "far") { last.current = "far"; onNear(null); }
      return;
    }
    const i = Math.max(0, Math.round(camera.position.y / floorHeight));
    const next = [i - 1, i, i + 1].filter((n) => n >= 0);
    const key = next.join(",");
    if (key !== last.current) {
      last.current = key;
      onNear(next);
    }
  });
  return null;
}

function CutawayCamera({ active, model }: { active: boolean; model: BuildingModel }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { target: { set: (x: number, y: number, z: number) => void }; update: () => void } | null;
  const was = useRef(false);
  useEffect(() => {
    if (active && !was.current) {
      const { plateWidthM: w, plateDepthM: d, totalHeightM: h } = model.dimensions;
      camera.position.set(w * 0.2, Math.max(4, h * 0.75), -d * 1.45);
      controls?.target.set(w / 2, h * 0.4, d / 2);
      controls?.update();
    }
    was.current = active;
  }, [active, camera, controls, model.dimensions]);
  return null;
}

export function BuildingViewer({ model }: { model: BuildingModel }) {
  const [dayIndex, setDayIndex] = useState(model.timeline ? model.timeline.days - 1 : 0);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [floor, setFloor] = useState<string>("all");
  const [explode, setExplode] = useState(false);
  const [night, setNight] = useState(false);
  const [fourD, setFourD] = useState(false);
  const [bim, setBim] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [flatMode, setFlatMode] = useState(false);
  const [openFlat, setOpenFlat] = useState<FlatHit | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [nearFloors, setNearFloors] = useState<number[] | null>(null);
  const wallColor = String(model.spec.wallColor || WALL);
  const canvasWrap = useRef<HTMLDivElement>(null);
  const flats = useMemo(() => flatHitsOf(model), [model]);
  const zoomed = Boolean(nearFloors?.length) && floor === "all" && !openFlat;
  const showInterior = floor !== "all" || Boolean(openFlat) || zoomed;
  const onNear = useCallback((next: number[] | null) => {
    setNearFloors((cur) => ((cur?.join(",") ?? "") === (next?.join(",") ?? "") ? cur : next));
  }, []);
  const visible = useMemo(() => model.components.filter((c) => {
    if (hidden[c.category]) return false;
    if (c.engineering && !bim) return false;
    if (bim && cutAway(c)) return false;
    const interior = Boolean(c.unit) || c.type === "furniture" || c.type === "stair" || c.subtype === "lift";
    const near = zoomed && nearFloors!.includes(c.floorIndex);
    if (!showInterior && (interior || (c.label && /core |stair hall|corridor/.test(c.label)))) return false;
    if (openFlat) {
      if (c.floorName && c.floorName !== openFlat.floorName) return false;
      if (c.unit && c.unit !== openFlat.unit) return false;
      if (c.type === "slab" || c.type === "parapet" || c.type === "fin") return false;
      return true;
    }
    if (floor !== "all" && c.floorName && c.floorName !== floor) return false;
    if (floor !== "all" && (c.type === "slab" || c.type === "parapet" || c.type === "fin")) return false;
    if (zoomed && interior && !near) return false;
    if (near && c.side === "front" && (FACADE.has(c.type) || c.type === "balcony" || c.type === "railing")) return false;
    if (near && (c.type === "slab" || c.type === "fin")) return false;
    return true;
  }), [model, hidden, bim, floor, openFlat, showInterior, zoomed, nearFloors]);

  const wheelRef = useRef({ active: () => false, go: (_dir: number) => {} });
  wheelRef.current.active = () => Boolean(openFlat || hoverKey);
  wheelRef.current.go = (dir: number) => {
    if (!flats.length) return;
    if (!openFlat && hoverKey) {
      const hovered = flats.find((f) => f.key === hoverKey);
      if (hovered) {
        setOpenFlat(hovered);
        setFloor(hovered.floorName);
        return;
      }
    }
    const cur = openFlat || flats[0];
    const i = Math.max(0, flats.findIndex((f) => f.key === cur.key));
    const next = flats[(i + dir + flats.length) % flats.length];
    setOpenFlat(next);
    setFloor(next.floorName);
  };

  useEffect(() => {
    const el = canvasWrap.current;
    if (!el || !flatMode) return;
    let lock = false;
    const onWheel = (e: WheelEvent) => {
      if (!wheelRef.current.active()) return;
      e.preventDefault();
      e.stopPropagation();
      if (lock) return;
      lock = true;
      window.setTimeout(() => { lock = false; }, 160);
      wheelRef.current.go(e.deltaY > 0 ? 1 : -1);
    };
    el.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () => el.removeEventListener("wheel", onWheel, { capture: true });
  }, [flatMode]);

  const day = useMemo(() => {
    if (!model.timeline) return new Date();
    const start = new Date(model.timeline.start).getTime();
    return new Date(start + dayIndex * 86400000);
  }, [model.timeline, dayIndex]);

  const selectedComp = model.components.find((c) => c.id === selected);
  const linked = selectedComp
    ? selectedComp.activityIds.map((id) => model.activities.find((a) => a.id === id)).filter(Boolean)
    : [];

  const lights = model.components.filter((c) => c.type === "light").slice(0, 10);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <Card
        title="3D / 4D building"
        actions={<CalculatedMark title={model.disclaimer} />}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-2">
            Floor
            <select className="rounded border px-2 py-1" value={floor} onChange={(e) => { setFloor(e.target.value); setOpenFlat(null); }}>
              <option value="all">All floors</option>
              {model.towers.flatMap((t) => t.floors.map((f) => (
                <option key={f.id} value={f.name}>{t.name} · {f.name}</option>
              )))}
            </select>
          </label>
          {model.categories.map((c) => (
            <button key={c} onClick={() => setHidden({ ...hidden, [c]: !hidden[c] })} className={`rounded-full px-2 py-0.5 ring-1 ${hidden[c] ? "bg-slate-100 text-slate-400" : "bg-white text-slate-700"}`}>
              {c}
            </button>
          ))}
          <Button
            variant={floor !== "all" ? "secondary" : "ghost"}
            onClick={() => {
              if (floor !== "all") setFloor("all");
              else {
                const plan = model.towers.flatMap((t) => t.floors).find((f) => f.storey === 2);
                if (plan) setFloor(plan.name);
              }
            }}
          >
            {floor !== "all" ? "Whole building" : "Show furnished floor"}
          </Button>
          <Button
            variant={flatMode ? "secondary" : "ghost"}
            onClick={() => {
              if (flatMode) {
                setFlatMode(false);
                setOpenFlat(null);
                setHoverKey(null);
              } else {
                setFlatMode(true);
              }
            }}
          >
            {flatMode ? (openFlat ? `Flat ${openFlat.unit} · ${openFlat.floorName}` : "Click a flat") : "Open a flat"}
          </Button>
          <Button variant="ghost" onClick={() => setExplode(!explode)}>{explode ? "Collapse" : "Explode floors"}</Button>
          <Button variant="ghost" onClick={() => setNight(!night)}>{night ? "Day" : "Night"}</Button>
          <Button variant={fourD ? "secondary" : "ghost"} onClick={() => setFourD(!fourD)}>{fourD ? "4D progress on" : "4D progress"}</Button>
          <Button variant={bim ? "secondary" : "ghost"} onClick={() => setBim(!bim)}>{bim ? "Close engineering view" : "Engineering cutaway"}</Button>
        </div>
        <div ref={canvasWrap} className={`relative h-[560px] overflow-hidden rounded-lg ${night ? "bg-[#0b1220]" : "bg-gradient-to-b from-sky-200 to-emerald-100"}`}>
          <Canvas shadows={showInterior} dpr={[1, 1.25]} camera={{ position: [70, 48, 78], fov: 32 }} onPointerMissed={() => setSelected(null)}>
            <color attach="background" args={[night ? "#0b1220" : "#b9d7f2"]} />
            {!night && <Sky sunPosition={[18, 22, 10]} turbidity={6} rayleigh={0.65} mieCoefficient={0.004} mieDirectionalG={0.8} />}
            <hemisphereLight args={night ? ["#1e293b", "#020617", 0.4] : ["#fff6e0", "#7dae62", 0.95]} />
            <ambientLight intensity={night ? 0.22 : 0.55} />
            <directionalLight
              position={[16, 24, 10]}
              intensity={night ? 0.22 : 1.55}
              castShadow={showInterior}
              shadow-mapSize-width={1024}
              shadow-mapSize-height={1024}
            />
            {night && lights.map((l) => (
              <pointLight
                key={`pl-${l.id}`}
                position={[l.position[0], l.position[1] - 0.15, l.position[2]]}
                color="#ffd27a"
                intensity={10}
                distance={8}
                decay={2}
              />
            ))}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[model.dimensions.plateWidthM / 2, -0.03, model.dimensions.plateDepthM / 2]} receiveShadow>
              <planeGeometry args={[Math.max(180, model.dimensions.totalHeightM * 3), Math.max(180, model.dimensions.totalHeightM * 3)]} />
              <meshStandardMaterial color={night ? "#152414" : GRASS} roughness={1} />
            </mesh>
            <ZoomWatch floorHeight={model.dimensions.floorHeightM} enabled={floor === "all" && !openFlat && !flatMode} onNear={onNear} />
            <CutawayCamera active={bim} model={model} />
            <FloorPlanCamera floor={openFlat ? "all" : floor} model={model} />
            <FlatCamera flat={openFlat} />
            <Bounds fit observe={!bim && floor === "all" && !openFlat} margin={1.25}>
              <group>
                {visible.map((c) => (
                  <Part
                    key={c.id}
                    c={c}
                    model={model}
                    day={day}
                    explode={explode}
                    night={night}
                    fourD={fourD}
                    bim={bim}
                    selected={selected === c.id}
                    wallColor={wallColor}
                    simple={!showInterior || (zoomed && !nearFloors?.includes(c.floorIndex))}
                    onSelect={setSelected}
                  />
                ))}
                {flatMode && !openFlat && flats.map((f) => (
                  <mesh
                    key={f.key}
                    position={[f.cx, f.cy + 1.35, f.cz]}
                    onClick={(e) => { e.stopPropagation(); setOpenFlat(f); setFloor(f.floorName); }}
                    onPointerOver={(e) => { e.stopPropagation(); setHoverKey(f.key); }}
                    onPointerOut={() => setHoverKey((cur) => (cur === f.key ? null : cur))}
                  >
                    <boxGeometry args={[f.w * 0.92, 2.5, f.d * 0.92]} />
                    <meshBasicMaterial color="#f59e0b" transparent opacity={hoverKey === f.key ? 0.28 : 0.04} depthWrite={false} />
                  </mesh>
                ))}
              </group>
            </Bounds>
            <ContactShadows position={[model.dimensions.plateWidthM / 2, 0, model.dimensions.plateDepthM / 2]} opacity={0.28} scale={Math.max(90, model.dimensions.plateWidthM * 2)} blur={2.2} far={28} />
            <OrbitControls makeDefault enableZoom={!flatMode || (!openFlat && !hoverKey)} minDistance={4} maxDistance={Math.max(240, model.dimensions.totalHeightM * 4)} maxPolarAngle={Math.PI / 2.05} />
          </Canvas>
          {bim && (
            <div className="absolute left-3 top-3 rounded-md border border-slate-300 bg-white/95 px-3 py-2 text-[11px] text-slate-700 shadow">
              <div className="mb-1 font-semibold tracking-wide">SERVICES</div>
              <div><span className="mr-1 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: "#2f6bff" }} /> Cold water</div>
              <div><span className="mr-1 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: "#e11d2e" }} /> Hot water</div>
              <div><span className="mr-1 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: "#3f3f46" }} /> Drainage</div>
              <div><span className="mr-1 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: "#f5c542" }} /> Electrical conduit</div>
            </div>
          )}
        </div>
        {model.timeline && (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-xs text-slate-500">
              <span>{fmtDate(model.timeline.start, true)}</span>
              <span className="font-medium text-slate-800">{fmtDate(day.toISOString(), true)}</span>
              <span>{fmtDate(model.timeline.end, true)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={Math.max(0, model.timeline.days - 1)}
              value={dayIndex}
              onChange={(e) => { setDayIndex(Number(e.target.value)); setFourD(true); }}
              className="w-full"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Zoom in to open the front of the floors in front of you and see the furniture. Open a flat, then scroll, to move from flat to flat. Turn on 4D progress to ghost work that is not yet reported on the selected date.
            </p>
          </div>
        )}
        <p className="mt-3 text-[11px] text-slate-400">{model.disclaimer}</p>
      </Card>

      <div className="space-y-3">
        <Card title="Digital twin">
          {!selectedComp ? <Empty>Click a wall, window, slab or light.</Empty> : (
            <div className="space-y-2 text-sm">
              <div className="font-medium">{selectedComp.label}</div>
              <div className="text-xs text-slate-500">{selectedComp.tower} · {selectedComp.type} · {selectedComp.category}</div>
              {linked.length === 0 ? (
                <p className="text-xs text-slate-500">No activity is linked to this component yet, so progress and resources cannot be shown.</p>
              ) : linked.map((a) => a && (
                <div key={a.id} className="rounded-lg border border-slate-200 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{a.name}</span>
                    <HealthBadge value={a.health} />
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{a.code} · {a.responsible || "unassigned"}</div>
                  <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
                    <div>Planned {a.plannedProgress}%</div>
                    <div>Actual {a.actualProgress}%</div>
                    <div>Plan {fmtDate(a.plannedFinish)}</div>
                    <div>Forecast {fmtDate(a.expectedFinish)}</div>
                    <div>Delay {a.slipDays ? signed(a.slipDays, "d") : "none"}</div>
                    <div>On this date {Math.round(progressAt(a, day))}%</div>
                  </div>
                  {!!a.labour.length && <div className="mt-1 text-xs text-slate-500">Labour: {a.labour.map((l) => `${l.trade} ×${l.count}`).join(", ")}</div>}
                  {!!a.materials.length && <div className="text-xs text-slate-500">Material: {a.materials.map((m) => `${m.name} ${m.quantity}${m.unit ? ` ${m.unit}` : ""}`).join(", ")}</div>}
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="Colours">
          <ul className="space-y-1 text-[11px] text-slate-600">
            <li><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: wallColor }} /> Tower walls — off-white, as the City Life render</li>
            <li><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: "#3a3d44" }} /> Podium and retail base</li>
            <li><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: "#2b2e34" }} /> Vertical facade fins</li>
            <li><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: "#d5e6ee" }} /> Balcony glass — one deck per flat</li>
            <li><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: GLASS }} /> Windows — glass, glow at night</li>
            <li><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: LIGHT }} /> Ceiling light fittings</li>
            <li><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: FLOOR }} /> Floor finish</li>
            <li><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: CONCRETE }} /> Columns / slab</li>
            <li><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: "#3f7a32" }} /> Trees / hedges</li>
            <li><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: "#2f3540" }} /> Balcony railings</li>
            <li><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: "#2f6bff" }} /> Cold water — engineering view</li>
            <li><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: "#e11d2e" }} /> Hot water</li>
            <li><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: "#3f3f46" }} /> Drainage</li>
            <li><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: "#f5c542" }} /> Electrical conduit</li>
          </ul>
        </Card>
        <Card title="Model basis">
          <ul className="space-y-1 text-[11px] text-slate-500">
            {Object.entries(model.sources).slice(0, 8).map(([k, v]) => (
              <li key={k}><span className="font-medium text-slate-700">{k}:</span> {v}</li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap gap-1">
            <Badge tone="slate">{model.dimensions.towers} tower(s)</Badge>
            <Badge tone="slate">{model.dimensions.detailedFloors} floors</Badge>
            <Badge tone="slate">{model.dimensions.plateWidthM}×{model.dimensions.plateDepthM} m</Badge>
            <Badge tone="slate">{model.dimensions.totalHeightM} m high</Badge>
          </div>
        </Card>
      </div>
    </div>
  );
}
