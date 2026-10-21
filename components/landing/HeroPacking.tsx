"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useSyncExternalStore } from "react";
import Safe3D from "../Safe3D";
import TopView2D from "../TopView2D";
import type { HeroItem } from "./HeroCanvas";

const HeroCanvas = dynamic(() => import("./HeroCanvas"), { ssr: false });

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

  return (
    <figure className="relative">
      <div className="aspect-[5/4] w-full">
        <Safe3D fallback={<TopView2D inner={inner} items={items.slice(0, placed)} tone="deep" />}>
          <HeroCanvas key={run} inner={inner} items={items} placed={placed} reducedMotion={reducedMotion} />
        </Safe3D>
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
