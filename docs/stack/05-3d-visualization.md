# Stack 05: 3D Layout View

## Why

The 3D view lets the packer **see** the decision: which carton, where each item goes, which items are fragile or liquid, and what was estimated. It is an explanation aid. The value of the product is the validated decision and the instructions, not the 3D view.

## Libraries

- `three`, `@react-three/fiber` (React renderer for three.js), `@react-three/drei` (`OrbitControls`, `Edges`, `Html` labels).
- Chosen over Plotly.js because box meshes are trivial in R3F, the bundle is lighter, and it integrates as a normal React component.

## Component: `components/PackingView3D.tsx`

```tsx
"use client";
// Props: carton inner dims + validated placements (from the API response)
interface Props {
  inner: [number, number, number];
  items: { unitId: string; name: string; fragile: boolean; liquid: boolean; sensitive: boolean;
           estimated: boolean; placement: { x: number; y: number; z: number; dx: number; dy: number; dz: number } }[];
}
```

Pure helpers live in `lib/ui/three.ts` (`toThreePosition`, `toThreeSize`, `itemKind`, `KIND_COLOR`, `placementOrder`, `topViewRects`).

Rendering rules:
- **Axis mapping:** the engine uses z-up, three.js uses y-up. `toThreePosition` maps engine `(x, y, z)` to three `(x, z, y)` and centres the carton on the floor.
- A box's position in three.js is its **center**: `center = origin + size / 2`.
- Carton: edges only (invisible faces), so items stay visible.
- Item colors (same meaning everywhere in the app): fragile = amber, liquid = blue, sensitive = purple, other = gray-teal. Estimated items are drawn **more transparent**; the legend says "الشفاف: مقاس تقديري" and the label adds "(تقديري)".
- Labels: the item name via drei `<Html>` on hover, or on tap for mobile.
- Camera: placed from the carton size on load. `OrbitControls` lets the user rotate and zoom (no pan).
- **Step slider** with «السابق» / «التالي» buttons: reveals items in placement order (bottom to top), matching the written instructions. A split order shows one view per carton.

## Next.js integration

- `components/PackRunner.tsx` loads it with `next/dynamic` and `{ ssr: false }`, because WebGL needs the browser, and shows "جارٍ تحميل الشكل المجسّم…" while loading.
- `components/Safe3D.tsx` checks for WebGL and catches render errors. Without WebGL it shows `components/TopView2D.tsx` (a top view drawn from the same placements) with a note that the written steps are complete.

## Testing

- `tests/ui/three.test.ts` covers the pure helpers (axis mapping, sizes, color mapping, placement order, top-view rectangles).
- The 3D view itself is checked by eye on the deployed app.
