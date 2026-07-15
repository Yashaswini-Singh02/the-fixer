"use client";

import { CONFIG } from "@thefix/engine";
import clsx from "clsx";
import { countdown } from "@/lib/format";
import { useSmoothClock } from "@/hooks/useSmoothClock";

export function StakeWindow({
  coins,
  openClock,
  clockSec,
  sealed,
}: {
  coins: number;
  openClock: number;
  clockSec: number;
  sealed: boolean;
}) {
  // smooth the clock so the countdown ticks per-second instead of jumping with
  // each coarse `clock` update; freeze it once bets seal
  const shownClock = useSmoothClock(clockSec, !sealed);
  const remaining = openClock + CONFIG.stakeWindowSec - shownClock;
  const frac = Math.max(0, Math.min(1, remaining / CONFIG.stakeWindowSec));
  const urgent = !sealed && remaining <= 30;

  return (
    <div className="slip flex items-center gap-3 px-3.5 py-2.5">
      <div className="flex items-baseline gap-1.5">
        <span className="font-display text-3xl leading-none tabular-nums text-gold">
          {coins}
        </span>
        <span className="text-lg leading-none">🪙</span>
        <span className="ml-0.5 text-[11px] uppercase tracking-wide text-fog">
          left
        </span>
      </div>

      <div className="ml-auto flex flex-col items-end gap-1">
        {sealed ? (
          <span className="rounded-full bg-vermilion/15 px-2.5 py-1 text-xs font-bold uppercase tracking-widest text-vermilion-soft">
            Sealed 🤐
          </span>
        ) : (
          <span
            className={clsx(
              "flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide",
              urgent ? "text-vermilion-soft" : "text-fog",
            )}
          >
            stake window
            <span
              className={clsx(
                "font-display text-base tabular-nums",
                urgent ? "text-vermilion" : "text-chalk",
              )}
            >
              {countdown(remaining)}
            </span>
          </span>
        )}
        <div className="h-1 w-28 overflow-hidden rounded-full bg-white/8">
          <div
            className={clsx(
              "h-full rounded-full transition-[width] duration-500 ease-linear",
              sealed ? "bg-vermilion/60" : urgent ? "bg-vermilion" : "bg-gold",
            )}
            style={{ width: sealed ? "100%" : `${frac * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
