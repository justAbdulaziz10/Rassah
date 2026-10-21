import type { SVGProps } from "react";

// One stroke family (2px, round caps) for every icon in the app. Decorative by default (aria-hidden); pair with visible or sr-only text.
function Svg({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

type P = SVGProps<SVGSVGElement>;

export const CheckIcon = (p: P) => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
);
export const CrossIcon = (p: P) => (
  <Svg {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Svg>
);
export const MinusIcon = (p: P) => (
  <Svg {...p}>
    <path d="M6 12h12" />
  </Svg>
);
export const AlertIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 4 3 20h18L12 4Z" />
    <path d="M12 10v4.5M12 17.5v.01" />
  </Svg>
);
export const InfoIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8v.01" />
  </Svg>
);
/** Points the way "forward" reads in RTL (to the left). */
export const ArrowForwardIcon = (p: P) => (
  <Svg {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Svg>
);
export const BellIcon = (p: P) => (
  <Svg {...p}>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </Svg>
);
export const BoxIcon = (p: P) => (
  <Svg {...p}>
    <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
    <path d="m3 8 9 5 9-5M12 13v8" />
  </Svg>
);
export const GlassIcon = (p: P) => (
  <Svg {...p}>
    <path d="M7 3h10l-1 8a4 4 0 0 1-8 0L7 3Z" />
    <path d="M12 15v6M8.5 21h7" />
  </Svg>
);
export const RulerIcon = (p: P) => (
  <Svg {...p}>
    <path d="m3.5 16.5 13-13 4 4-13 13-4-4Z" />
    <path d="m7 13 2 2M10 10l1.5 1.5M13 7l2 2" />
  </Svg>
);
export const AirIcon = (p: P) => (
  <Svg {...p}>
    <path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8" />
  </Svg>
);
export const PrinterIcon = (p: P) => (
  <Svg {...p}>
    <path d="M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
    <path d="M7 14h10v7H7v-7Z" />
  </Svg>
);
export const SearchIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Svg>
);
export const PackageCheckIcon = (p: P) => (
  <Svg {...p}>
    <path d="M21 10V8l-9-5-9 5v8l9 5 2.5-1.4" />
    <path d="m3 8 9 5 9-5M12 13v8" />
    <path d="m16 19 2 2 4-4" />
  </Svg>
);
