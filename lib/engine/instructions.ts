// Deterministic packing instructions generated from a validated layout.
// No LLM here: free, instant, and it cannot hallucinate a step that the layout doesn't have.

import { AR } from "./instructions.ar";
import type { Carton, Placement, Unit } from "./types";

export interface InstructionStep {
  step: number;
  unitId: string | null; // null for carton-level steps
  text: string;
  notes: string[];
}

export function buildInstructions(
  carton: Carton,
  placements: Placement[],
  units: Unit[],
  paddingCm: number,
  eps = 1e-6,
): InstructionStep[] {
  const byId = new Map(units.map((u) => [u.unitId, u]));
  const ordered = [...placements].sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);
  const steps: InstructionStep[] = [{ step: 1, unitId: null, text: AR.carton(carton.name, carton.inner), notes: [] }];

  for (const p of ordered) {
    const u = byId.get(p.unitId);
    if (!u) continue;
    const text = p.z <= eps ? AR.placeBottom(u.name) : AR.placeOnTop(u.name);
    const notes: string[] = [];
    if (u.fragile) notes.push(AR.fragile(paddingCm));
    if (u.liquid) notes.push(AR.liquid);
    if (u.sensitive && !u.fragile) notes.push(AR.sensitive(paddingCm));
    // dims are sorted largest first, so lying flat means its smallest side is the vertical one.
    if (!u.liquid && p.dz > u.dims[2] + eps) notes.push(AR.onEdge(Math.round(p.dz * 10) / 10));
    if (u.estimated) notes.push(AR.estimated);
    steps.push({ step: steps.length + 1, unitId: u.unitId, text, notes });
  }

  steps.push({ step: steps.length + 1, unitId: null, text: AR.voidFill, notes: [] });
  if (units.some((u) => u.liquid)) {
    steps.push({ step: steps.length + 1, unitId: null, text: AR.thisSideUp, notes: [] });
  }
  return steps;
}
