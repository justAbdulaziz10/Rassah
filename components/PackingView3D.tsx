"use client";

import { Edges, Html, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMemo, useState } from "react";
import { cartonThreeSize, itemKind, KIND_COLOR, placementOrder, toThreePosition, toThreeSize, type BoxPlacement } from "@/lib/ui/three";

export interface View3DItem {
  unitId: string;
  name: string;
  fragile: boolean;
  liquid: boolean;
  sensitive: boolean;
  estimated: boolean;
  placement: BoxPlacement;
}

interface Props {
  inner: [number, number, number];
  items: View3DItem[];
}

export default function PackingView3D({ inner, items }: Props) {
  const ordered = useMemo(() => placementOrder(items), [items]);
  const [step, setStep] = useState(ordered.length);
  const [hovered, setHovered] = useState<string | null>(null);
  const size = cartonThreeSize(inner);
  const maxSide = Math.max(...inner);

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="h-80 w-full sm:h-96" dir="ltr">
        <Canvas camera={{ position: [maxSide * 1.1, maxSide * 0.95, maxSide * 1.25], fov: 45 }}>
          <ambientLight intensity={0.7} />
          <directionalLight position={[maxSide, maxSide * 2, maxSide]} intensity={0.8} />
          {/* Carton: wireframe edges only, so items stay visible. */}
          <mesh position={[0, size[1] / 2, 0]}>
            <boxGeometry args={size} />
            <meshBasicMaterial transparent opacity={0} />
            <Edges color="#475569" />
          </mesh>
          {ordered.slice(0, step).map((it) => {
            const kind = itemKind(it);
            return (
              <mesh
                key={it.unitId}
                position={toThreePosition(it.placement, inner)}
                onPointerOver={(e) => {
                  e.stopPropagation();
                  setHovered(it.unitId);
                }}
                onPointerOut={() => setHovered(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  setHovered(it.unitId);
                }}
              >
                {/* Shrink slightly so touching boxes don't z-fight. */}
                <boxGeometry args={toThreeSize(it.placement).map((v) => Math.max(v - 0.15, 0.1)) as [number, number, number]} />
                <meshStandardMaterial color={KIND_COLOR[kind]} transparent opacity={it.estimated ? 0.45 : 0.85} />
                <Edges color={it.estimated ? "#111827" : "#1f2937"} />
                {hovered === it.unitId && (
                  <Html center distanceFactor={maxSide * 1.6}>
                    <div dir="rtl" className="whitespace-nowrap rounded bg-black/80 px-2 py-1 text-xs text-white">
                      {it.name}
                      {it.estimated ? " (تقديري)" : ""}
                    </div>
                  </Html>
                )}
              </mesh>
            );
          })}
          <OrbitControls makeDefault enablePan={false} />
        </Canvas>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3 text-sm">
        <label htmlFor="step" className="text-muted">
          الخطوة
        </label>
        <input
          id="step"
          type="range"
          min={0}
          max={ordered.length}
          value={step}
          onChange={(e) => setStep(Number(e.target.value))}
          className="w-48 accent-[var(--brand)]"
          aria-valuetext={`${step} من ${ordered.length}`}
        />
        <span className="ltr-nums">
          {step} / {ordered.length}
        </span>
        <span className="ms-auto flex flex-wrap gap-3 text-xs text-muted">
          <Legend color={KIND_COLOR.fragile} label="قابل للكسر" />
          <Legend color={KIND_COLOR.liquid} label="سائل" />
          <Legend color={KIND_COLOR.sensitive} label="حساس" />
          <Legend color={KIND_COLOR.plain} label="عادي" />
          <span>الشفاف = مقاس تقديري</span>
        </span>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="inline-block size-3 rounded-sm" style={{ background: color }} aria-hidden />
      {label}
    </span>
  );
}
