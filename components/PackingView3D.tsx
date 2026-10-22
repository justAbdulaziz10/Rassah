"use client";

import { Edges, Html, Instance, Instances, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useId, useMemo, useState } from "react";
import { FLAG_LABEL, FLAGS } from "@/components/Badges";
import { ArrowBackIcon, ArrowForwardIcon } from "@/components/Icons";
import { cartonThreeSize, itemKind, KIND_COLOR, placementOrder, toThreePosition, toThreeSize, voidFillBubbles, type ViewItem } from "@/lib/ui/three";

/**
 * The written steps open with the carton (step 1), place the items in placementOrder (one step each)
 * and then fill the gaps. So the view after placing `placed` items shows written step `placed + 1`,
 * and the filler view after the last item is the written fill step.
 */
const writtenStep = (placed: number) => placed + 1;

const BUBBLE_COLOR = "#bfdbfe";

interface Props {
  inner: [number, number, number];
  items: Array<ViewItem & { name: string }>;
}

export default function PackingView3D({ inner, items }: Props) {
  const ordered = useMemo(() => placementOrder(items), [items]);
  // The last view fills the gaps with bubble wrap; the page opens on the step before it, every item in place.
  const fillStep = ordered.length + 1;
  const [step, setStep] = useState(ordered.length);
  const [hovered, setHovered] = useState<string | null>(null);
  const stepId = useId(); // a split order shows one view per carton, so the slider id must be unique
  const go = (n: number) => setStep(Math.max(0, Math.min(fillStep, n)));
  const filled = step === fillStep;
  const current = step > 0 && !filled ? ordered[step - 1] : null;
  const bubbles = useMemo(() => voidFillBubbles(inner, items.map((it) => it.placement)), [inner, items]);
  const status = filled ? "املأ الفراغات بالفقاعات حتى لا تتحرك القطع، ثم أغلق الكرتون" : current ? `القطعة الحالية: ${current.name}` : "الكرتون فارغ";
  const size = cartonThreeSize(inner);
  const maxSide = Math.max(...inner);

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="h-80 w-full sm:h-96" dir="ltr">
        <Canvas camera={{ position: [maxSide * 1.25, size[1] / 2 + maxSide * 1.05, maxSide * 1.4], fov: 45 }}>
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
          {filled && bubbles.positions.length > 0 && (
            <Instances limit={bubbles.positions.length} raycast={() => null}>
              <sphereGeometry args={[bubbles.radius, 10, 8]} />
              <meshStandardMaterial color={BUBBLE_COLOR} transparent opacity={0.35} roughness={0.25} depthWrite={false} />
              {bubbles.positions.map((p, i) => (
                <Instance key={i} position={p} />
              ))}
            </Instances>
          )}
          {/* Aim at the carton's centre, not its floor, so tall cartons stay in frame. */}
          <OrbitControls makeDefault enablePan={false} target={[0, size[1] / 2, 0]} />
        </Canvas>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3 text-sm">
        <label htmlFor={stepId} className="text-muted">
          خطوات التغليف
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => go(step - 1)}
            disabled={step === 0}
            aria-label="الخطوة السابقة"
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-border bg-surface px-2.5 hover:border-brand disabled:opacity-40"
          >
            <ArrowBackIcon className="size-4" />
            السابق
          </button>
          <input
            id={stepId}
            type="range"
            min={0}
            max={fillStep}
            value={step}
            onChange={(e) => go(Number(e.target.value))}
            className="w-36 accent-[var(--brand)] sm:w-48"
            aria-valuetext={`الخطوة ${writtenStep(step)}: ${filled ? "حشو الفراغات" : current ? current.name : "الكرتون فارغ"}`}
          />
          <button
            type="button"
            onClick={() => go(step + 1)}
            disabled={filled}
            aria-label="الخطوة التالية"
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-brand bg-brand px-2.5 font-medium text-brand-contrast hover:opacity-90 disabled:border-border disabled:bg-surface disabled:text-muted disabled:opacity-40"
          >
            التالي
            <ArrowForwardIcon className="size-4" />
          </button>
        </div>
        {/* Numbered like the written steps, so the packer sees one number for each item. */}
        <span className="font-medium">
          الخطوة <span className="ltr-nums">{writtenStep(step)}</span>
        </span>
        <span className="basis-full text-muted sm:basis-auto">{status}</span>
        <span className="ms-auto flex flex-wrap gap-3 text-xs text-muted">
          {FLAGS.map((f) => (
            <Legend key={f} color={KIND_COLOR[f]} label={FLAG_LABEL[f]} />
          ))}
          <Legend color={KIND_COLOR.plain} label="عادي" />
          <span>الشفاف: مقاس تقديري</span>
          {filled && <Legend color={BUBBLE_COLOR} label="فقاعات الحشو" />}
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
