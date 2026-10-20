# Stack 05: 3D Layout View

**Owner:** M2. **Reviewer:** M3.

## Why

The 3D view lets the packer (and the judges) **see** the decision: which carton, where each item goes, which items are fragile or liquid, and what was estimated. It is an explanation aid. The value of the product is the validated decision and the instructions, not the 3D view.

## Libraries

- `three`, `@react-three/fiber` (React renderer for three.js), `@react-three/drei` (`OrbitControls`, `Edges`, `Html` labels).
- Chosen over Plotly.js because box meshes are trivial in R3F, the bundle is lighter, and it integrates as a normal React component.

## Component: `components/PackingView3D.tsx`

```tsx
"use client";
// Props: carton inner dims + validated placements (from the API response)
type Props = {
  carton: { innerCm: [number, number, number] };
  items: { unitId: string; name: string; placement: { x: number; y: number; z: number; dx: number; dy: number; dz: number };
           fragile: boolean; liquid: boolean; sensitive: boolean; estimated: boolean }[];
};
```

Rendering rules:
- **Axis mapping:** the engine uses z-up, three.js uses y-up. Map engine `(x, y, z)` to three `(x, z, y)` in one helper function and test it.
- A box's position in three.js is its **center**: `center = origin + size / 2`.
- Carton: wireframe edges only (transparent), so items stay visible.
- Item colors (same meaning everywhere in the app): fragile = amber, liquid = blue, sensitive = purple, other = neutral gray-teal. Estimated items get a **dashed outline** and a label suffix "(تقديري)".
- Labels: a short name via drei `<Html>` on hover, or on tap for mobile.
- Camera: fits the carton on load. `OrbitControls` lets the user rotate and zoom.
- **Step slider:** "Step 1…N" reveals items in placement order (bottom to top), matching the written instructions. Cheap to build and very clear in a live demo.

## Next.js integration

- Load with `next/dynamic` and `{ ssr: false }`, because WebGL needs the browser.
- Show a plain fallback (the text instructions) while loading or if WebGL is unavailable.

## Testing

- Unit-test the pure helpers (`toThreePosition`, color mapping, step filtering) with Vitest.
- Visual check on the Vercel preview for 3 fixture orders (simple, fragile + liquid, estimated item) before merging.

## Cut-list fallback

If time runs out: replace with two SVG projections (top view and side view) drawn from the same placements. Same data, no WebGL.
