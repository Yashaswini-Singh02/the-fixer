"use client";

import { useEffect, useRef, useState } from "react";

const now = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

/**
 * The match clock only changes when a `clock` event lands — every ~1s from the
 * real stream, but in coarse ~14s jumps from the compressed demo — so a raw
 * readout stutters. This smooths it: estimate the play rate from the last two
 * updates and dead-reckon forward between them, clamped to one step so a late
 * update can never overshoot and snap backward. Returns whole seconds and only
 * re-renders when the displayed second changes, so it stays cheap.
 */
export function useSmoothClock(clockSec: number, running: boolean): number {
  const [shown, setShown] = useState(() => Math.floor(clockSec));
  const shownRef = useRef(shown);
  const anchor = useRef({ clock: clockSec, at: now(), rate: 0, step: 0 });

  // re-anchor on each authoritative update, re-estimating the rate. Ref-only:
  // the running rAF loop below reads this every frame, so no render churn here.
  useEffect(() => {
    const t = now();
    const prev = anchor.current;
    const dReal = t - prev.at;
    const dClock = clockSec - prev.clock;
    anchor.current = {
      clock: clockSec,
      at: t,
      // only a sane forward jump updates the rate; else keep the last estimate
      rate: dClock > 0 && dReal > 16 ? dClock / dReal : prev.rate,
      step: dClock > 0 ? dClock : prev.step,
    };
  }, [clockSec]);

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const tick = () => {
      const a = anchor.current;
      const ahead = a.rate * (now() - a.at);
      const capped = a.step > 0 ? Math.min(ahead, a.step) : ahead;
      const val = Math.floor(a.clock + capped);
      if (val !== shownRef.current) {
        shownRef.current = val;
        setShown(val);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  // while paused, track the raw clock directly; while running, the rAF ticks it
  return running ? shown : Math.floor(clockSec);
}
