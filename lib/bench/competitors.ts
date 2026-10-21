// Request builders and response parsers for the head-to-head benchmark (scripts/bench.ts).
// Pure functions, no network: the script does the HTTP calls, so these can be unit-tested against
// the vendors' documented response shapes. Used ONLY by the benchmark, never by app routes.
//
// Fairness rules (docs/benchmark.md):
// - every engine gets the same units (same sizes after padding/margin), the same cartons and the same prices;
// - each rule a vendor can express is sent (liquids upright, nothing on fragile); a rule it cannot express is
//   reported as unsupported, not silently dropped;
// - layouts are judged by our validator and priced by our cost model, not by the vendor's own numbers.

import { estimateCost } from "@/lib/engine/cost";
import type { Carton, Placement, ShippingRates, Unit } from "@/lib/engine/types";

/** One packed box returned by an engine, in our coordinates: x along carton length, y width, z up. */
interface BoxLayout {
  carton: Carton;
  placements: Placement[];
}

export interface EngineAnswer {
  boxes: BoxLayout[];
  /** Units the engine could not place in any box. */
  unpacked: string[];
  /** Packing time the engine reports for itself, without network (ms), when it reports one. */
  engineMs: number | null;
  note?: string;
}

/**
 * The price every engine optimises for a carton: carton cost plus shipping at the carton's own volumetric
 * weight, in halalas. This hands both vendors the dimensional-weight effect through the one cost field they
 * both support, and the base shipping fee per box makes splitting an order cost what it really costs.
 */
export function cartonPriceHalalas(c: Carton, rates: ShippingRates, wallCm: number): number {
  const empty = estimateCost(c, [], rates, wallCm);
  return Math.round(empty.totalSar * 100);
}

/** Dims with the upright side first for liquids: [vertical, a, b]. Other units: smallest side first. */
function verticalFirst(u: Unit): [number, number, number] {
  if (u.liquid && u.uprightHeight !== null) {
    const rest = [...u.dims];
    rest.splice(rest.indexOf(u.uprightHeight), 1);
    return [u.uprightHeight, rest[0], rest[1]];
  }
  return [u.dims[2], u.dims[1], u.dims[0]];
}

// ---------------------------------------------------------------------------------------------
// Paccurate (https://docs.paccurate.io): Point x = height (up), y = width, z = length.

export function paccurateRequest(units: Unit[], cartons: Carton[], rates: ShippingRates, wallCm: number) {
  const rules: Array<Record<string, unknown>> = [];
  units.forEach((u, i) => {
    // freeAxes [0]: only yaw (turning around the vertical axis) is allowed, so the liquid stays upright.
    if (u.liquid) rules.push({ operation: "lock-orientation", itemRefId: i, options: { freeAxes: [0] } });
    // onTopOnly: nothing may be placed above the fragile item, the same rule our validator enforces.
    if (u.fragile) rules.push({ operation: "fragile", itemRefId: i, options: { onTopOnly: true } });
  });
  return {
    itemSets: units.map((u, i) => {
      const [h, a, b] = verticalFirst(u);
      return { refId: i, name: u.unitId, weight: u.weightG, quantity: 1, dimensions: { x: h, y: a, z: b } };
    }),
    boxTypes: cartons.map((c, i) => ({
      refId: i,
      name: c.id,
      dimensions: { x: c.inner[2], y: c.inner[1], z: c.inner[0] },
      weightMax: c.maxWeightG,
      weightTare: c.tareG,
      price: cartonPriceHalalas(c, rates, wallCm),
    })),
    rules,
    boxTypeChoiceGoal: "lowest-cost",
    // The vendor's recommended set of item sorts, returning its lowest-cost option.
    itemSort: "combined",
    includeImages: false,
  };
}

interface PaccuratePoint {
  x?: number;
  y?: number;
  z?: number;
}
interface PaccurateItem {
  refId?: number;
  name?: string;
  virtual?: boolean;
  origin?: PaccuratePoint;
  dimensions?: PaccuratePoint;
}
interface PaccurateResponse {
  boxes?: Array<{ box?: { refId?: number; name?: string; boxType?: { refId?: number; name?: string }; items?: Array<{ item?: PaccurateItem }> } }>;
  leftovers?: PaccurateItem[];
  packTime?: number;
}

export function parsePaccurate(res: unknown, units: Unit[], cartons: Carton[]): EngineAnswer {
  const r = res as PaccurateResponse;
  const boxes: BoxLayout[] = [];
  for (const { box } of r.boxes ?? []) {
    if (!box) continue;
    const ref = box.boxType?.refId ?? box.refId;
    const name = box.boxType?.name ?? box.name;
    const carton = (ref !== undefined ? cartons[ref] : undefined) ?? cartons.find((c) => c.id === name);
    if (!carton) throw new Error(`Paccurate returned an unknown box type ${ref ?? name}`);
    const placements: Placement[] = [];
    for (const { item } of box.items ?? []) {
      // Virtual volumes are display/blocking spaces (e.g. above a fragile item), not products.
      if (!item || item.virtual || item.refId === undefined || !units[item.refId]) continue;
      const o = item.origin ?? {};
      const d = item.dimensions ?? {};
      placements.push({ unitId: units[item.refId].unitId, x: o.z ?? 0, y: o.y ?? 0, z: o.x ?? 0, dx: d.z ?? 0, dy: d.y ?? 0, dz: d.x ?? 0 });
    }
    boxes.push({ carton, placements });
  }
  const unpacked = (r.leftovers ?? []).filter((i) => !i.virtual && i.refId !== undefined && units[i.refId]).map((i) => units[i.refId!].unitId);
  return { boxes, unpacked, engineMs: typeof r.packTime === "number" ? r.packTime * 1000 : null };
}

// ---------------------------------------------------------------------------------------------
// 3DBinPacking (https://www.3dbinpacking.com/en/api-doc): w, h (height), d (depth). The docs do not say
// which coordinate is vertical, so the parser checks both readings against the box bounds (see below).

export function binPackingRequest(units: Unit[], cartons: Carton[], rates: ShippingRates, wallCm: number, auth: { username: string; apiKey: string }) {
  return {
    username: auth.username,
    api_key: auth.apiKey,
    bins: cartons.map((c) => ({
      id: c.id,
      w: c.inner[0],
      h: c.inner[2],
      d: c.inner[1],
      wg: c.tareG,
      // Whether max_wg includes the box's own weight is not documented; the net limit is the safe reading.
      max_wg: c.maxWeightG - c.tareG,
      q: null,
      cost: cartonPriceHalalas(c, rates, wallCm),
      type: "box",
    })),
    items: units.map((u) => {
      const [h, a, b] = verticalFirst(u);
      // vr = may the item be turned onto another side. Liquids may not; it is the only orientation rule offered.
      return { id: u.unitId, w: b, h, d: a, wg: u.weightG, q: 1, vr: u.liquid ? 0 : 1 };
    }),
    params: { optimization_mode: "cost", item_coordinates: 1, images_complete: 0, images_sbs: 0, images_separated: 0, stats: 0 },
  };
}

interface BinPackingResponse {
  response?: {
    status?: number;
    errors?: Array<{ level?: string; message?: string }>;
    bins_packed?: Array<{
      bin_data?: { id?: string };
      items?: Array<{ id?: string; coordinates?: { x1: number; y1: number; z1: number; x2: number; y2: number; z2: number } }>;
    }>;
    not_packed_items?: Array<{ id?: string; q?: number }>;
  };
}

export function parseBinPacking(res: unknown, units: Unit[], cartons: Carton[]): EngineAnswer {
  const r = (res as BinPackingResponse).response;
  if (!r) throw new Error("3DBinPacking: no response object");
  if (r.status === 0) throw new Error(`3DBinPacking: ${(r.errors ?? []).map((e) => e.message).join("; ") || "critical error"}`);
  const known = new Set(units.map((u) => u.unitId));
  let note: string | undefined;
  const boxes: BoxLayout[] = (r.bins_packed ?? []).map((b) => {
    const carton = cartons.find((c) => c.id === b.bin_data?.id);
    if (!carton) throw new Error(`3DBinPacking returned an unknown bin ${b.bin_data?.id}`);
    const items = (b.items ?? []).filter((i) => i.id && known.has(i.id) && i.coordinates);
    const [L, W, H] = carton.inner;
    // Reading A: x along w (length), y along h (up), z along d (width). Reading B: z is up.
    const readA = items.map((i) => {
      const c = i.coordinates!;
      return { unitId: i.id!, x: c.x1, y: c.z1, z: c.y1, dx: c.x2 - c.x1, dy: c.z2 - c.z1, dz: c.y2 - c.y1 };
    });
    const readB = items.map((i) => {
      const c = i.coordinates!;
      return { unitId: i.id!, x: c.x1, y: c.y1, z: c.z1, dx: c.x2 - c.x1, dy: c.y2 - c.y1, dz: c.z2 - c.z1 };
    });
    const fits = (ps: Placement[]) => ps.every((p) => p.x + p.dx <= L + 1e-6 && p.y + p.dy <= W + 1e-6 && p.z + p.dz <= H + 1e-6);
    if (!fits(readA) && fits(readB)) note = "coordinates read with z vertical";
    return { carton, placements: !fits(readA) && fits(readB) ? readB : readA };
  });
  const unpacked = (r.not_packed_items ?? []).flatMap((i) => (i.id && known.has(i.id) ? Array(i.q ?? 1).fill(i.id) : []));
  return { boxes, unpacked, engineMs: null, note };
}
