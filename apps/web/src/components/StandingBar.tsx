"use client";

import type { RoomView } from "@thefix/engine";
import { Avatar } from "./Avatar";
import { buildDossier, ordinal } from "@/lib/stats";

/** Glanceable "where you stand" strip that doubles as the entry to Your File. */
export function StandingBar({
  view,
  onOpen,
}: {
  view: RoomView;
  onOpen: () => void;
}) {
  const d = buildDossier(view);

  return (
    <button
      onClick={onOpen}
      className="slip flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors active:bg-pitch-3"
      aria-label="Open your file: your climb, your fixes, and who fixed you"
    >
      <Avatar emoji={d.you?.emoji ?? "🙂"} size="sm" ring="gold" />

      <div className="min-w-0 flex-1 leading-none">
        <div className="flex items-baseline gap-1.5">
          <span className="font-display text-lg uppercase tracking-wide text-gold">
            Rung {d.rung}
          </span>
          <span className="text-[11px] text-fog">/ {d.ladderTop}</span>
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-fog">
          <span>
            {ordinal(d.rank)} of {d.totalPlayers}
          </span>
          {d.onYouLanded > 0 && (
            <span className="text-vermilion-soft">· fixed {d.onYouLanded}×</span>
          )}
        </div>
      </div>

      <span className="flex items-center gap-1.5 font-display text-xs uppercase tracking-widest text-chalk/80">
        Your file
        <span aria-hidden className="text-base leading-none text-gold">
          ›
        </span>
      </span>
    </button>
  );
}
