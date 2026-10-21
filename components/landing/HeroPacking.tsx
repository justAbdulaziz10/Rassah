"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import Safe3D from "../Safe3D";
import TopView2D from "../TopView2D";
import type { HeroItem } from "./HeroCanvas";

const loadHeroCanvas = () => import("./HeroCanvas");
const HeroCanvas = dynamic(loadHeroCanvas, { ssr: false });

/**
 * three.js is most of the landing page's script. It loads only once the hero is near the screen (on
 * phones it sits below the fold) and never on a data-saver connection. Until it has loaded the same
 * packing plays in 2D, so there is no empty frame.
 */
function use3DReady(ref: RefObject<HTMLElement | null>): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const el = ref.current;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (!el || saveData) return;
    let live = true;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        loadHeroCanvas().then(
          () => live && setReady(true),
          () => {}, // the chunk failed to load: the 2D view stays
        );
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => {
      live = false;
      io.disconnect();
    };
  }, [ref]);
  return ready;
}

interface Props {
  orderId: string;
  cartonName: string;
  inner: [number, number, number];
  items: HeroItem[];
  /** Real instruction lines from the engine: [carton, ...one per item, ...closing steps]. */
  steps: string[];
}

const STEP_MS = 1100;

function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export default function HeroPacking({ orderId, cartonName, inner, items, steps }: Props) {
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
  const [step, setStep] = useState(0);
  const [run, setRun] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const ready3D = use3DReady(stage);
  const last = steps.length - 1;
  const current = reducedMotion ? last : step;

  useEffect(() => {
    if (reducedMotion) return;
    const id = window.setInterval(() => {
      setStep((s) => {
        if (s >= last) {
          window.clearInterval(id);
          return s;
        }
        return s + 1;
      });
    }, STEP_MS);
    return () => window.clearInterval(id);
  }, [reducedMotion, last, run]);

  // Step 0 picks the carton; steps 1..n each put one item in.
  const placed = Math.min(current, items.length);
  const done = current >= last;
  const flat = <TopView2D inner={inner} items={items.slice(0, placed)} tone="deep" />;

  return (
    <figure className="relative">
      <div ref={stage} className="aspect-[5/4] w-full">
        {ready3D ? (
          <Safe3D fallback={flat}>
            <HeroCanvas key={run} inner={inner} items={items} placed={placed} reducedMotion={reducedMotion} />
          </Safe3D>
        ) : (
          flat
        )}
      </div>

      <figcaption className="mt-2 rounded-xl border border-white/15 bg-[var(--deep-2)]/80 p-4 text-sm text-[var(--on-deep)] backdrop-blur-sm">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <span className="font-bold">تعليمات الطلب #{orderId}</span>
          <span className="text-[var(--on-deep-muted)]">
            {cartonName}، <span className="ltr-nums">{inner.join(" × ")}</span> سم
          </span>
        </div>
        <ol className="space-y-1.5" aria-live="polite">
          {steps.map((text, i) => {
            const state = i < current ? "done" : i === current ? "now" : "next";
            return (
              <li
                key={text}
                className={`flex gap-3 transition-opacity duration-300 ${state === "next" ? "opacity-35" : "opacity-100"}`}
                aria-current={state === "now" ? "step" : undefined}
              >
                <span
                  className={`ltr-nums mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                    state === "now" ? "bg-[var(--tape)] text-[var(--ink)]" : "border border-white/30"
                  }`}
                >
                  {i + 1}
                </span>
                <span className={state === "now" ? "font-medium" : ""}>{text}</span>
              </li>
            );
          })}
        </ol>
        {done && !reducedMotion && (
          <button
            type="button"
            onClick={() => {
              setStep(0);
              setRun((r) => r + 1);
            }}
            className="mt-3 rounded-md px-2 py-1 text-[var(--on-deep-muted)] underline underline-offset-4 hover:text-[var(--on-deep)] focus-visible:outline-2 focus-visible:outline-[var(--tape)]"
          >
            أعد الترتيب من البداية
          </button>
        )}
      </figcaption>
    </figure>
  );
}
