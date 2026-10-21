"use client";

import { ContactShadows, Edges, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Mesh } from "three";
import { cartonThreeSize, itemKind, KIND_COLOR, toThreePosition, toThreeSize, type ViewItem } from "@/lib/ui/three";

export type HeroItem = ViewItem;

interface Props {
  inner: [number, number, number];
  /** Items already in placement order (bottom to top), as the instructions list them. */
  items: HeroItem[];
  /** How many items are in the carton right now. */
  placed: number;
  reducedMotion: boolean;
}

const KRAFT = "#c99b62";
const KRAFT_DARK = "#7d5a33";
const DROP_CM = 34;

export default function HeroCanvas({ inner, items, placed, reducedMotion }: Props) {
  const [L, H, W] = cartonThreeSize(inner);
  const maxSide = Math.max(...inner);

  return (
    <Canvas
      dir="ltr"
      dpr={[1, 2]}
      camera={{ position: [-maxSide * 1.45, maxSide * 1.5, maxSide * 1.85], fov: 36 }}
      gl={{ alpha: true, antialias: true }}
      aria-hidden
    >
      <ambientLight intensity={1} />
      <directionalLight position={[-maxSide, maxSide * 2.2, maxSide * 1.4]} intensity={1.1} />
      <directionalLight position={[maxSide, maxSide * 0.6, -maxSide]} intensity={0.35} />

      <group position={[0, -H / 2, 0]}>
        <ContactShadows position={[0, -0.45, 0]} scale={maxSide * 2.6} blur={2.6} opacity={0.55} far={H} color="#02110f" />
        <OpenCarton L={L} H={H} W={W} />
        {items.slice(0, placed).map((it) => (
          <FallingItem key={it.unitId} item={it} inner={inner} reducedMotion={reducedMotion} />
        ))}
      </group>

      <OrbitControls
        makeDefault
        enablePan={false}
        enableZoom={false}
        autoRotate={!reducedMotion}
        autoRotateSpeed={0.55}
        minPolarAngle={0.5}
        maxPolarAngle={1.25}
      />
    </Canvas>
  );
}

/** A kraft carton with no lid and its four flaps folded open, the way a packer sees it on the table. */
function OpenCarton({ L, H, W }: { L: number; H: number; W: number }) {
  const t = 0.4;
  const flapL = W * 0.5;
  const flapW = L * 0.5;
  return (
    <group>
      {/* floor */}
      <Panel size={[L, t, W]} position={[0, -t / 2, 0]} color={KRAFT_DARK} />
      {/* back and left walls: solid */}
      <Panel size={[L, H, t]} position={[0, H / 2, -W / 2]} color={KRAFT} />
      <Panel size={[t, H, W]} position={[L / 2, H / 2, 0]} color={KRAFT} />
      {/* walls facing the camera: see-through so the layout stays readable */}
      <Panel size={[L, H, t]} position={[0, H / 2, W / 2]} color={KRAFT} opacity={0.08} />
      <Panel size={[t, H, W]} position={[-L / 2, H / 2, 0]} color={KRAFT} opacity={0.08} />
      {/* flaps, hinged on the rim and folded outward */}
      <group position={[0, H, -W / 2]} rotation={[-0.55, 0, 0]}>
        <Panel size={[L, t, flapL]} position={[0, 0, -flapL / 2]} color={KRAFT} />
      </group>
      <group position={[0, H, W / 2]} rotation={[0.55, 0, 0]}>
        <Panel size={[L, t, flapL]} position={[0, 0, flapL / 2]} color={KRAFT} opacity={0.22} />
      </group>
      <group position={[L / 2, H, 0]} rotation={[0, 0, -0.55]}>
        <Panel size={[flapW, t, W]} position={[flapW / 2, 0, 0]} color={KRAFT} />
      </group>
      <group position={[-L / 2, H, 0]} rotation={[0, 0, 0.55]}>
        <Panel size={[flapW, t, W]} position={[-flapW / 2, 0, 0]} color={KRAFT} opacity={0.22} />
      </group>
    </group>
  );
}

function Panel({
  size,
  position,
  color,
  opacity = 1,
}: {
  size: [number, number, number];
  position: [number, number, number];
  color: string;
  opacity?: number;
}) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.95} transparent={opacity < 1} opacity={opacity} depthWrite={opacity === 1} />
      <Edges color={KRAFT_DARK} />
    </mesh>
  );
}

/** Drops from above the carton and settles on its engine-computed spot. */
function FallingItem({ item, inner, reducedMotion }: { item: HeroItem; inner: [number, number, number]; reducedMotion: boolean }) {
  const ref = useRef<Mesh>(null);
  const target = toThreePosition(item.placement, inner);
  const start = useRef<number | null>(null);
  const size = toThreeSize(item.placement).map((v) => Math.max(v - 0.2, 0.1)) as [number, number, number];

  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    if (reducedMotion) {
      mesh.position.set(...target);
      return;
    }
    if (start.current === null) start.current = clock.elapsedTime;
    const t = Math.min((clock.elapsedTime - start.current) / 0.7, 1);
    // ease-out with a small settle, like a box set down by hand
    const e = 1 - Math.pow(1 - t, 3);
    mesh.position.set(target[0], target[1] + DROP_CM * (1 - e), target[2]);
  });

  return (
    <mesh ref={ref} position={reducedMotion ? target : [target[0], target[1] + DROP_CM, target[2]]}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={KIND_COLOR[itemKind(item)]} roughness={0.6} transparent={item.estimated} opacity={item.estimated ? 0.55 : 1} />
      <Edges color="#0b1f1c" />
    </mesh>
  );
}
