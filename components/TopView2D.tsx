import { itemKind, KIND_COLOR, topViewRects, type BoxPlacement } from "@/lib/ui/three";

interface Props {
  /** Carton inner L, W, H in cm (engine order). */
  inner: [number, number, number];
  items: Array<{
    unitId: string;
    name?: string;
    fragile: boolean;
    liquid: boolean;
    sensitive: boolean;
    estimated: boolean;
    placement: BoxPlacement;
  }>;
  /** "deep" sits on the landing page's dark teal; "light" on the console surface. */
  tone?: "light" | "deep";
}

const INSET = 0.15;

/** Top-down view of the carton, drawn when the browser can't run the 3D view. */
export default function TopView2D({ inner, items, tone = "light" }: Props) {
  const [L, W] = inner;
  const pad = Math.max(L, W) * 0.06;
  const deep = tone === "deep";

  return (
    <svg
      role="img"
      aria-label="منظر علوي للكرتون وترتيب القطع"
      viewBox={`${-pad} ${-pad} ${L + pad * 2} ${W + pad * 2}`}
      preserveAspectRatio="xMidYMid meet"
      width="100%"
      height="100%"
    >
      <rect
        x={0}
        y={0}
        width={L}
        height={W}
        rx={0.6}
        fill={deep ? "#c99b62" : "var(--surface)"}
        stroke={deep ? "#7d5a33" : "var(--border)"}
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
      {topViewRects(items).map((it) => (
        <rect
          key={it.unitId}
          x={it.rx + INSET}
          y={it.ry + INSET}
          width={Math.max(it.rw - INSET * 2, 0.1)}
          height={Math.max(it.rh - INSET * 2, 0.1)}
          rx={0.4}
          fill={KIND_COLOR[itemKind(it)]}
          fillOpacity={it.estimated ? 0.45 : 0.85}
          stroke={deep ? "#3b2a17" : "#1f2937"}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        >
          {it.name && <title>{it.estimated ? `${it.name} (تقديري)` : it.name}</title>}
        </rect>
      ))}
    </svg>
  );
}
