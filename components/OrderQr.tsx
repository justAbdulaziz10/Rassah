import { encode } from "uqr";

/** A QR code as plain SVG: one path of dark modules, so it prints sharp at any size. */
export default function OrderQr({ url, className }: { url: string; className?: string }) {
  const { data, size } = encode(url, { ecc: "M", border: 2 });
  let d = "";
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (data[y][x]) d += `M${x} ${y}h1v1h-1z`;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className={className} shapeRendering="crispEdges" role="img" aria-label="رمز QR لفتح الطلب">
      <rect width={size} height={size} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}
