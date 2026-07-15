"use client";

import type { GameState } from "@thefix/engine";
import { clock, PHASE_LABEL, segmentTag } from "@/lib/format";
import { flagEmoji } from "@/lib/fixtures";
import { useSmoothClock } from "@/hooks/useSmoothClock";

type MatchCounts = GameState["counts"];
type MatchPhase = GameState["phase"];

const abbr = (name: string) => name.slice(0, 3).toUpperCase();

export function ScoreStrip({
  home,
  away,
  counts,
  clockSec,
  phase,
  segmentIndex,
  live,
}: {
  home: string;
  away: string;
  counts: MatchCounts;
  clockSec: number;
  phase: MatchPhase;
  segmentIndex: number | null;
  live: boolean;
}) {
  const hg = counts.goals.home;
  const ag = counts.goals.away;
  const shownClock = useSmoothClock(clockSec, live);
  return (
    <div className="slip flex items-center justify-between gap-2 px-3.5 py-2.5">
      <Team flag={flagEmoji(home)} code={abbr(home)} />

      <div className="flex flex-col items-center leading-none">
        <div className="flex items-baseline gap-2 font-display text-4xl tabular-nums tracking-tight text-chalk">
          <span>{hg}</span>
          <span className="translate-y-[-2px] text-lg text-fog">:</span>
          <span>{ag}</span>
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-widest text-fog">
          {live && (
            <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-vermilion" />
          )}
          <span className="tabular-nums text-chalk/80">{clock(shownClock)}</span>
          <span className="text-fog-dim">·</span>
          <span>{segmentIndex ? segmentTag(segmentIndex) : PHASE_LABEL[phase]}</span>
        </div>
      </div>

      <Team flag={flagEmoji(away)} code={abbr(away)} right />
    </div>
  );
}

function Team({
  flag,
  code,
  right,
}: {
  flag: string;
  code: string;
  right?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 ${right ? "flex-row-reverse" : ""}`}
    >
      <span className="text-2xl leading-none">{flag}</span>
      <span className="font-display text-xl tracking-wide text-chalk/90">
        {code}
      </span>
    </div>
  );
}
