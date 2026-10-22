"use client";

import { Edges, Html, Instance, Instances, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import Image from "next/image";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Vector3, type Mesh } from "three";
import { FLAG_LABEL, FLAGS } from "@/components/Badges";
import { ArrowBackIcon, ArrowForwardIcon, PauseIcon, PlayIcon } from "@/components/Icons";
import TopView2D from "@/components/TopView2D";
import { fmtDims, fmtLitres, fmtPct, fmtWeight } from "@/lib/ui/format";
import {
  cartonFill,
  cartonThreeSize,
  HEAVY_G,
  isHeavy,
  itemKind,
  KIND_COLOR,
  placementOrder,
  toThreePosition,
  toThreeSize,
  voidFillBubbles,
  type ViewItem,
} from "@/lib/ui/three";

/**
 * The view's steps follow the written steps (see writtenStepOf): the empty carton, one step per item
 * in placementOrder, the gaps filled with bubble wrap, then the closed carton. The page opens with
 * every item in place, the step before the filler.
 */

const BUBBLE_COLOR = "#bfdbfe";
const CARTON_COLOR = "#c69c6d";
const TAPE_COLOR = "#e7d3b0";
const HIGHLIGHT_EDGE = "#facc15";
const DROP_SECONDS = 0.45;
const PLAY_MS = 1100;

const cm = (v: number) => `${Number(v.toFixed(1))} سم`;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Angle = "angled" | "top" | "front";
const ANGLES: Array<[Angle, string]> = [
  ["angled", "مائل"],
  ["top", "من فوق"],
  ["front", "من الأمام"],
];

/** Camera position for each preset, all at the same distance from the carton's centre. */
function anglePosition(angle: Angle, size: [number, number, number], maxSide: number): [number, number, number] {
  const cy = size[1] / 2;
  const d = maxSide * 2.15;
  // Straight down would leave OrbitControls without a "forward"; a hair of z keeps the length across the screen.
  if (angle === "top") return [0, cy + d, maxSide * 0.001];
  if (angle === "front") return [0, cy, d];
  return [maxSide * 1.25, cy + maxSide * 1.05, maxSide * 1.4];
}

type ViewItemNamed = ViewItem & { name: string };

interface Props {
  inner: [number, number, number];
  items: ViewItemNamed[];
  /** Controlled by the page so the written steps and this view stay on the same step. */
  step: number;
  onStep: (view: number) => void;
  /** The written number of view step `view`, shown next to the slider. */
  writtenStep: (view: number) => number;
  /** Write «this side up» on the closed carton (the order has liquids). */
  thisSideUp: boolean;
  onReady?: () => void;
}

export default function PackingView3D({ inner, items, step, onStep, writtenStep, thisSideUp, onReady }: Props) {
  const ordered = useMemo(() => placementOrder(items), [items]);
  const fillStep = ordered.length + 1;
  const closedStep = ordered.length + 2;
  const [hovered, setHovered] = useState<string | null>(null);
  // The item that drops into place: only when stepping forward by one, never on load.
  const [dropping, setDropping] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  // A new object on every click, so picking the same angle again after orbiting still moves the camera.
  const [angle, setAngle] = useState<{ name: Angle }>({ name: "angled" });
  // The printed sheet shows a still of every item in place, taken once without the highlight.
  const [shot, setShot] = useState<{ url: string; width: number; height: number } | null>(null);
  const [capturing, setCapturing] = useState(false);
  const stepId = useId(); // a split order shows one view per carton, so the slider id must be unique

  useEffect(() => {
    onReady?.();
  }, [onReady]);

  const go = (n: number) => {
    const next = Math.max(0, Math.min(closedStep, n));
    setDropping(next === step + 1 && next <= ordered.length && !reducedMotion() ? ordered[next - 1].unitId : null);
    onStep(next);
  };
  const manual = (n: number) => {
    setPlaying(false);
    go(n);
  };
  const togglePlay = () => {
    if (!playing) go(0);
    setPlaying(!playing);
  };

  // Play: one step at a time from the empty carton to the closed one.
  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => (step >= closedStep ? setPlaying(false) : go(step + 1)), PLAY_MS);
    return () => clearTimeout(t);
  });

  // Arrows follow the reading direction: left is forward in Arabic. The slider moves itself.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT") return;
    if (e.key === "ArrowLeft") manual(step + 1);
    else if (e.key === "ArrowRight") manual(step - 1);
    else if (e.key === "Home") manual(0);
    else if (e.key === "End") manual(closedStep);
    else if (e.key === " " && tag !== "BUTTON") togglePlay();
    else return;
    e.preventDefault();
  };

  const filled = step === fillStep;
  const closed = step === closedStep;
  const current = step > 0 && step <= ordered.length ? ordered[step - 1] : null;
  const bubbles = useMemo(() => voidFillBubbles(inner, items.map((it) => it.placement)), [inner, items]);
  const fill = useMemo(() => cartonFill(inner, items.map((it) => it.placement)), [inner, items]);
  const status = closed
    ? thisSideUp
      ? "أغلق الكرتون بشريط لاصق، واكتب عليه «هذا الجانب للأعلى ↑»"
      : "أغلق الكرتون بشريط لاصق. الطلب جاهز للشحن"
    : filled
      ? `القطع تشغل ${fmtPct(fill.usedShare)} من الكرتون. املأ الباقي بالفقاعات (حوالي ${fmtLitres(fill.freeLitres)}) حتى لا تتحرك القطع`
      : current
        ? `القطعة الحالية: ${current.name}${isHeavy(current) ? ` (ثقيلة، ${fmtWeight(current.weightG)})` : ""}`
        : "الكرتون فارغ";
  const label = closed ? "إغلاق الكرتون" : filled ? "حشو الفراغات" : current ? current.name : "الكرتون فارغ";
  // Stable across renders: the camera rig re-aims only when an angle is picked.
  const size = useMemo(() => cartonThreeSize(inner), [inner]);
  const maxSide = Math.max(...inner);

  return (
    <>
      <div className="rounded-lg border border-border bg-surface print:hidden" onKeyDown={onKeyDown}>
        <div className="relative">
          <div
            className="h-80 w-full rounded-t-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:h-96"
            dir="ltr"
            tabIndex={0}
            role="group"
            aria-label="الشكل المجسّم للكرتون. الأسهم تنقّل بين الخطوات، والمسافة تشغّلها أو توقفها"
          >
            <Canvas camera={{ position: anglePosition("angled", size, maxSide), fov: 45 }}>
              <ambientLight intensity={0.7} />
              <directionalLight position={[maxSide, maxSide * 2, maxSide]} intensity={0.8} />
              {closed ? (
                <ClosedCarton size={size} thisSideUp={thisSideUp} />
              ) : (
                <>
                  {/* Carton: wireframe edges only, so items stay visible. No depth either, or items in front of its centre would be hidden. */}
                  <mesh position={[0, size[1] / 2, 0]} raycast={() => null}>
                    <boxGeometry args={size} />
                    <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                    <Edges color="#475569" />
                  </mesh>
                  {ordered.slice(0, step).map((it) => (
                    <ItemBox
                      key={it.unitId}
                      item={it}
                      position={toThreePosition(it.placement, inner)}
                      dropFrom={dropping === it.unitId ? size[1] * 0.8 : 0}
                      current={!capturing && current?.unitId === it.unitId}
                      hovered={hovered === it.unitId}
                      onHover={setHovered}
                      labelScale={maxSide * 1.6}
                    />
                  ))}
                  {filled && bubbles.positions.length > 0 && (
                    <Instances limit={bubbles.positions.length} raycast={() => null}>
                      <sphereGeometry args={[bubbles.radius, 10, 8]} />
                      <meshStandardMaterial color={BUBBLE_COLOR} transparent opacity={0.35} roughness={0.25} depthWrite={false} />
                      {bubbles.positions.map((p, i) => (
                        <Instance key={i} position={p} />
                      ))}
                    </Instances>
                  )}
                </>
              )}
              <SizeLabels inner={inner} />
              {/* Aim at the carton's centre, not its floor, so tall cartons stay in frame. */}
              <OrbitControls makeDefault enablePan={false} target={[0, size[1] / 2, 0]} />
              <CameraRig to={angle} size={size} maxSide={maxSide} />
              <Snapshot
                armed={shot === null && step === ordered.length && ordered.length > 0}
                capturing={capturing}
                onArm={() => setCapturing(true)}
                onShot={(s) => {
                  setShot(s);
                  setCapturing(false);
                }}
              />
            </Canvas>
          </div>
          <div role="group" aria-label="زاوية النظر" className="absolute start-2 top-2 flex gap-1 rounded-lg border border-border bg-surface/90 p-1 text-xs">
            {ANGLES.map(([name, text]) => (
              <button
                key={name}
                type="button"
                onClick={() => setAngle({ name })}
                aria-pressed={angle.name === name}
                className="rounded-md px-2 py-1 hover:bg-border/50 aria-pressed:bg-brand aria-pressed:text-brand-contrast"
              >
                {text}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3 text-sm">
          <label htmlFor={stepId} className="text-muted">
            خطوات التغليف
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={togglePlay}
              aria-pressed={playing}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-border bg-surface px-2.5 hover:border-brand"
            >
              {playing ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}
              {/* Icon only on phones (here and on «السابق»), so the controls fit a carton's panel in a split order. */}
              <span className="sr-only sm:not-sr-only">{playing ? "إيقاف" : "شغّل الخطوات"}</span>
            </button>
            <button
              type="button"
              onClick={() => manual(step - 1)}
              disabled={step === 0}
              aria-label="الخطوة السابقة"
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-border bg-surface px-2.5 hover:border-brand disabled:opacity-40"
            >
              <ArrowBackIcon className="size-4" />
              <span className="sr-only sm:not-sr-only">السابق</span>
            </button>
            <input
              id={stepId}
              type="range"
              min={0}
              max={closedStep}
              value={step}
              onChange={(e) => manual(Number(e.target.value))}
              className="w-24 accent-[var(--brand)] sm:w-48"
              aria-valuetext={`الخطوة ${writtenStep(step)}: ${label}`}
            />
            <button
              type="button"
              onClick={() => manual(step + 1)}
              disabled={closed}
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
          <span className="basis-full text-muted sm:basis-auto" aria-live="polite">
            {status}
          </span>
          <span className="ms-auto flex flex-wrap gap-3 text-xs text-muted">
            {FLAGS.map((f) => (
              <Legend key={f} color={KIND_COLOR[f]} label={FLAG_LABEL[f]} />
            ))}
            <Legend color={KIND_COLOR.plain} label="عادي" />
            <span>الشفاف: مقاس تقديري</span>
            {ordered.some(isHeavy) && <span>«ثقيل»: {fmtWeight(HEAVY_G)} فأكثر</span>}
            {current && <Legend color={HIGHLIGHT_EDGE} label="القطعة الحالية" />}
            {filled && <Legend color={BUBBLE_COLOR} label="فقاعات الحشو" />}
            {/* Only where there is a keyboard. */}
            <span className="hidden pointer-fine:inline">الأسهم ← → للتنقل، والمسافة للتشغيل</span>
          </span>
        </div>
      </div>
      {/* The printed sheet: a still of the carton with every item in place (the top view until the still is taken). */}
      <figure className="hidden break-inside-avoid print:block">
        {shot ? (
          <Image src={shot.url} alt="شكل الكرتون بعد وضع كل القطع" width={shot.width} height={shot.height} unoptimized className="mx-auto h-auto max-h-[90mm] w-auto" />
        ) : (
          <div className="mx-auto h-[70mm]">
            <TopView2D inner={inner} items={items} />
          </div>
        )}
        <figcaption className="mt-1 text-center text-xs text-muted">
          الكرتون بعد وضع كل القطع، {fmtDims(inner)} من الداخل
        </figcaption>
      </figure>
    </>
  );
}

/** Html inside the canvas must mount after the first frame, or it can lose its content while the canvas attaches. */
function useAfterFirstFrame() {
  const [ready, setReady] = useState(false);
  useFrame(() => {
    if (!ready) setReady(true);
  });
  return ready;
}

type Controls = { update(): void; addEventListener(type: "start", f: () => void): void; removeEventListener(type: "start", f: () => void): void };

/** Glides the camera to the picked angle; grabbing the view stops the glide. */
function CameraRig({ to, size, maxSide }: { to: { name: Angle }; size: [number, number, number]; maxSide: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as Controls | null;
  const goal = useRef<Vector3 | null>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false; // the canvas already starts at the angled view
      return;
    }
    goal.current = new Vector3(...anglePosition(to.name, size, maxSide));
  }, [to, size, maxSide]);

  useEffect(() => {
    if (!controls) return;
    const stop = () => (goal.current = null);
    controls.addEventListener("start", stop);
    return () => controls.removeEventListener("start", stop);
  }, [controls]);

  useFrame((_, dt) => {
    const g = goal.current;
    if (!g || !controls) return;
    camera.position.lerp(g, reducedMotion() ? 1 : 1 - Math.exp(-dt * 8));
    if (camera.position.distanceTo(g) < maxSide * 0.002) {
      camera.position.copy(g);
      goal.current = null;
    }
    controls.update();
  });
  return null;
}

/**
 * Takes the still for the printed sheet once every item is in place and the last drop has landed:
 * first asks the view to drop the highlight (onArm), then renders and reads the canvas in the same frame.
 */
function Snapshot({
  armed,
  capturing,
  onArm,
  onShot,
}: {
  armed: boolean;
  capturing: boolean;
  onArm: () => void;
  onShot: (shot: { url: string; width: number; height: number }) => void;
}) {
  const since = useRef<number | null>(null);
  useFrame(({ gl, scene, camera, clock }) => {
    const canvas = gl.domElement;
    // A hidden view (another carton's tab) has no size yet: wait until it is shown.
    if (!armed || canvas.width === 0) {
      since.current = null;
      return;
    }
    if (capturing) {
      gl.render(scene, camera);
      onShot({ url: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height });
      return;
    }
    since.current ??= clock.elapsedTime;
    if (clock.elapsedTime - since.current > DROP_SECONDS + 0.15) onArm();
  });
  return null;
}

function ItemBox({
  item,
  position,
  dropFrom,
  current,
  hovered,
  onHover,
  labelScale,
}: {
  item: ViewItemNamed;
  position: [number, number, number];
  /** Height above its place the item starts from (0 = already in place). */
  dropFrom: number;
  current: boolean;
  hovered: boolean;
  onHover: (id: string | null) => void;
  labelScale: number;
}) {
  const ref = useRef<Mesh>(null);
  const start = useRef<number | null>(null);
  const ready = useAfterFirstFrame();
  // Position is set every frame (before the first draw), not as a prop, so a re-render mid-drop doesn't reset it.
  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    let lift = 0;
    if (dropFrom > 0) {
      start.current ??= clock.elapsedTime;
      const t = Math.min(1, (clock.elapsedTime - start.current) / DROP_SECONDS);
      lift = dropFrom * (1 - t) ** 3;
    }
    mesh.position.set(position[0], position[1] + lift, position[2]);
  });
  const kind = itemKind(item);
  const color = KIND_COLOR[kind];
  const threeSize = toThreeSize(item.placement);
  const heavy = isHeavy(item);
  return (
    <mesh
      ref={ref}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(item.unitId);
      }}
      onPointerOut={() => onHover(null)}
      onClick={(e) => {
        e.stopPropagation();
        onHover(item.unitId);
      }}
    >
      {/* Shrink slightly so touching boxes don't z-fight. */}
      <boxGeometry args={threeSize.map((v) => Math.max(v - 0.15, 0.1)) as [number, number, number]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={current ? 0.35 : 0}
        transparent
        opacity={item.estimated ? (current ? 0.6 : 0.45) : current ? 0.95 : 0.85}
      />
      <Edges color={current ? HIGHLIGHT_EDGE : item.estimated ? "#111827" : "#1f2937"} lineWidth={current ? 2.5 : 1} />
      {/* Only on the current item: labels are not hidden behind boxes, so stacked heavy items would pile up. The written steps mark each one. */}
      {ready && heavy && current && !hovered && (
        <Html position={[0, threeSize[1] / 2, 0]} center zIndexRange={[10, 0]}>
          <span dir="rtl" className="pointer-events-none whitespace-nowrap rounded bg-black/75 px-1 text-[10px] font-bold text-white">
            ثقيل
          </span>
        </Html>
      )}
      {hovered && (
        <Html center distanceFactor={labelScale}>
          <div dir="rtl" className="whitespace-nowrap rounded bg-black/80 px-2 py-1 text-xs text-white">
            {item.name}
            {item.estimated ? " (تقديري)" : ""}
            {item.weightG ? ` · ${fmtWeight(item.weightG)}` : ""}
          </div>
        </Html>
      )}
    </mesh>
  );
}

/** The packed carton: kraft-coloured, taped along the flaps, and «this side up» when it carries liquids. */
function ClosedCarton({ size, thisSideUp }: { size: [number, number, number]; thisSideUp: boolean }) {
  const [x, y, z] = size;
  return (
    <group raycast={() => null}>
      <mesh position={[0, y / 2, 0]}>
        <boxGeometry args={[x, y, z]} />
        <meshStandardMaterial color={CARTON_COLOR} roughness={0.9} />
        <Edges color="#7c5a34" />
      </mesh>
      {/* Tape over the flap seam, down both ends. */}
      <mesh position={[0, y + 0.06, 0]}>
        <boxGeometry args={[x + 0.1, 0.12, Math.min(5, z * 0.2)]} />
        <meshStandardMaterial color={TAPE_COLOR} roughness={0.4} />
      </mesh>
      {thisSideUp && (
        <Html position={[0, y / 2, z / 2 + 0.2]} center zIndexRange={[10, 0]}>
          <div dir="rtl" className="whitespace-nowrap rounded border-2 border-critical bg-white px-2 py-1 text-sm font-bold text-critical">
            ↑ هذا الجانب للأعلى ↑
          </div>
        </Html>
      )}
    </group>
  );
}

/** Inside sizes on the three edges facing the camera. */
function SizeLabels({ inner }: { inner: [number, number, number] }) {
  const ready = useAfterFirstFrame();
  if (!ready) return null;
  const [L, W, H] = inner;
  const labels: Array<[[number, number, number], number]> = [
    [[0, 0, W / 2 + 1.5], L],
    [[L / 2 + 1.5, 0, 0], W],
    [[L / 2 + 1, H / 2, W / 2 + 1], H],
  ];
  return labels.map(([position, v], i) => (
    <Html key={i} position={position} center zIndexRange={[10, 0]}>
      <span dir="rtl" className="pointer-events-none whitespace-nowrap rounded bg-surface/80 px-1 text-[11px] text-muted">
        {cm(v)}
      </span>
    </Html>
  ));
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="inline-block size-3 rounded-sm" style={{ background: color }} aria-hidden />
      {label}
    </span>
  );
}
