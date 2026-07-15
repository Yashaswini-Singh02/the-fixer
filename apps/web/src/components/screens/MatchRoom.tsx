"use client";

import type { BetSide, MarketKind, RoomView } from "@thefix/engine";
import { MARKETS } from "@thefix/engine";
import { AnimatePresence } from "framer-motion";
import { useState } from "react";
import { Ladder } from "@/components/Ladder";
import { MarketCard } from "@/components/MarketCard";
import { PlayerRail } from "@/components/PlayerRail";
import { ReactionBar } from "@/components/Reactions";
import { ScoreStrip } from "@/components/ScoreStrip";
import { StakeWindow } from "@/components/StakeWindow";
import { StandingBar } from "@/components/StandingBar";
import { StatsSheet } from "@/components/StatsSheet";

export function MatchRoom({
  view,
  onBet,
  onFix,
  onReact,
}: {
  view: RoomView;
  onBet: (market: MarketKind, side: BetSide, stake: number) => void;
  onFix: (targetId: string) => void;
  onReact: (emoji: string) => void;
}) {
  const { state } = view;
  const seg = state.segment;
  const [fileOpen, setFileOpen] = useState(false);
  const players = Object.values(state.players);
  const you = state.players[view.you];
  const coins = you?.coins ?? 0;

  const leaderId =
    players.length > 0
      ? players.reduce((a, b) => (b.rung > a.rung ? b : a)).id
      : null;

  const others = players.filter((p) => p.id !== view.you);
  const betFor = (m: MarketKind) => view.yourBets.find((b) => b.market === m);

  return (
    <main className="frame relative flex min-h-dvh flex-col gap-3 pb-28 pt-3">
      <div className="sticky top-0 z-30 -mx-[1.15rem] bg-gradient-to-b from-pitch via-pitch/95 to-transparent px-[1.15rem] pb-2 pt-1">
        <ScoreStrip
          home={view.fixture.home}
          away={view.fixture.away}
          counts={state.counts}
          clockSec={state.clockSec}
          phase={state.phase}
          segmentIndex={seg?.index ?? null}
          live={state.status === "live"}
        />
      </div>

      <StandingBar view={view} onOpen={() => setFileOpen(true)} />

      <Ladder
        players={players}
        youId={view.you}
        leaderId={leaderId}
        top={20}
        className="min-h-[300px] flex-1"
      />

      {seg ? (
        <>
          <StakeWindow
            coins={coins}
            openClock={seg.openClock}
            clockSec={state.clockSec}
            sealed={seg.sealed}
          />

          <div className="space-y-2.5">
            {MARKETS.map((m) => (
              <MarketCard
                key={m}
                market={m}
                price={seg.prices[m]}
                sealed={seg.sealed}
                yourBet={betFor(m)}
                coins={coins}
                onBet={(side, stake) => onBet(m, side, stake)}
              />
            ))}
          </div>

          <PlayerRail
            others={others}
            betCounts={seg.betCounts}
            fixCount={seg.fixCount}
            yourFixTarget={view.yourFixTarget}
            coins={coins}
            sealed={seg.sealed}
            onFix={onFix}
          />
        </>
      ) : (
        <div className="board grid place-items-center rounded-slip p-8 text-center">
          <div className="text-3xl">⏳</div>
          <p className="mt-2 font-display text-lg uppercase tracking-wide text-chalk">
            Between segments
          </p>
          <p className="mt-1 text-sm text-fog">
            Fresh coins and new markets open at the next whistle.
          </p>
        </div>
      )}

      {/* reaction bar — thumb-reachable */}
      <div className="fixed inset-x-0 bottom-3 z-30 mx-auto flex max-w-[27rem] justify-center px-4">
        <ReactionBar onReact={onReact} />
      </div>

      <AnimatePresence>
        {fileOpen && (
          <StatsSheet view={view} onClose={() => setFileOpen(false)} />
        )}
      </AnimatePresence>
    </main>
  );
}
