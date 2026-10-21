"use client";

// The two recharts bar charts of the monitoring page. Kept apart so recharts loads on its own,
// next to the metrics request, instead of inside the page's first script.
import type { ReactElement } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const AXIS = { stroke: "var(--chart-axis)", fontSize: 12, tickLine: false } as const;
const MARGIN = { top: 8, right: 4, bottom: 0, left: 4 };
const CURSOR = { fill: "var(--chart-grid)", opacity: 0.5 };

export function LatencyChart({
  points,
  top,
  limit,
  showLimit,
  tip,
}: {
  points: Array<{ i: number; ms: number; cached: boolean }>;
  top: number;
  limit: number;
  showLimit: boolean;
  tip: ReactElement;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={points} margin={MARGIN} barCategoryGap={2}>
        <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
        <XAxis dataKey="i" reversed hide />
        <YAxis orientation="right" {...AXIS} width={40} tickFormatter={(v: number) => (top >= 1000 ? (v / 1000).toFixed(1) : String(Math.round(v)))} domain={[0, showLimit ? top * 1.1 : "auto"]} />
        <Tooltip cursor={CURSOR} content={tip} />
        {showLimit && <ReferenceLine y={limit} stroke="var(--critical)" strokeDasharray="4 4" />}
        <Bar dataKey="ms" radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false}>
          {points.map((p) => (
            <Cell key={p.i} fill={p.cached ? "var(--series-1)" : "var(--series-2)"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CorrectionsChart({ points, tip }: { points: Array<{ i: number; ok: number; fixed: number }>; tip: ReactElement }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={points} margin={MARGIN} barCategoryGap={2}>
        <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
        <XAxis dataKey="i" reversed hide />
        <YAxis orientation="right" {...AXIS} width={40} allowDecimals={false} />
        <Tooltip cursor={CURSOR} content={tip} />
        <Bar dataKey="ok" stackId="m1" fill="var(--series-1)" maxBarSize={18} isAnimationActive={false}>
          {points.map((p) => (
            <Cell key={p.i} radius={p.fixed ? 0 : 3} />
          ))}
        </Bar>
        <Bar dataKey="fixed" stackId="m1" fill="var(--series-2)" radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
