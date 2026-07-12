"use client";

import type { Player, RoomView } from "@thefix/engine";
import { motion } from "framer-motion";
import { useState } from "react";
import clsx from "clsx";
import { Avatar } from "@/components/Avatar";
import { flagEmoji } from "@/lib/fixtures";

const MEDAL = ["🥇", "🥈", "🥉"];
const PODIUM_H = ["h-28", "h-20", "h-16"];

export function FullTime({
  view,
  onRematch,
}: {
  view: RoomView;
  onRematch: () => void;
}) {
  const { state, fixture } = view;
  const players = Object.values(state.players);
  const ranked = [...players].sort((a, b) => b.rung - a.rung);
  const winner: Player | undefined = state.winnerId
    ? state.players[state.winnerId]
    : ranked[0];
  // podium order for display: 2nd, 1st, 3rd
  const podium = [ranked[1], ranked[0], ranked[2]].filter(Boolean) as Player[];
  const podiumRank = (p: Player) => ranked.indexOf(p);

  // most savage successful fix across the match
  let savage: { fixer: Player; target: Player; rungs: number } | null = null;
  for (const h of state.history)
    for (const f of h.fixes) {
      if (!f.succeeded) continue;
      if (savage && f.rungs <= savage.rungs) continue;
      const fx = state.players[f.fixerId];
      const tg = state.players[f.targetId];
      if (fx && tg) savage = { fixer: fx, target: tg, rungs: f.rungs };
    }

  // biggest single-segment climb ("best call")
  let best: { player: Player; rungs: number; index: number } | null = null;
  for (const h of state.history)
    for (const [pid, c] of Object.entries(h.climbs)) {
      if (best && c <= best.rungs) continue;
      const p = state.players[pid];
      if (p) best = { player: p, rungs: c, index: h.index };
    }

  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = typeof window !== "undefined" ? window.location.origin : "";
    const text = winner
      ? `${winner.name} won The Fix on ${fixture.home} v ${fixture.away} 🏆 Think you can climb higher?`
      : `We fixed the ${fixture.home} v ${fixture.away} match 🔨`;
    try {
      if (navigator.share) return await navigator.share({ title: "The Fix", text, url });
    } catch {
      /* fall through */
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* blocked */
    }
  };

  return (
    <main className="frame flex min-h-dvh flex-col py-7">
      <div className="text-center">
        <div className="font-display text-xs uppercase tracking-[0.35em] text-gold">
          Full time
        </div>
        <div className="mt-1 flex items-center justify-center gap-2 text-chalk/90">
          <span>{flagEmoji(fixture.home)}</span>
          <span className="font-display text-2xl tabular-nums">
            {state.counts.goals.home}–{state.counts.goals.away}
          </span>
          <span>{flagEmoji(fixture.away)}</span>
        </div>
      </div>

      {/* winner */}
      {winner && (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 220, damping: 16 }}
          className="mt-5 text-center"
        >
          <div className="mx-auto grid place-items-center">
            <Avatar emoji={winner.emoji} size="xl" ring="gold" crown />
          </div>
          <h1 className="mt-3 font-display text-4xl uppercase leading-none tracking-wide text-gold">
            {winner.id === view.you ? "You win!" : `${winner.name} wins`}
          </h1>
          <p className="mt-1 text-sm text-fog">
            Topped the ladder at rung {winner.rung}/20
          </p>
        </motion.div>
      )}

      {/* podium */}
      <div className="mt-6 flex items-end justify-center gap-2">
        {podium.map((p) => {
          const rank = podiumRank(p);
          return (
            <div key={p.id} className="flex w-1/3 flex-col items-center gap-2">
              <Avatar
                emoji={p.emoji}
                size={rank === 0 ? "lg" : "md"}
                ring={p.id === view.you ? "gold" : "none"}
              />
              <span className="max-w-full truncate text-xs text-chalk/90">
                {p.id === view.you ? "You" : p.name}
              </span>
              <div
                className={clsx(
                  "flex w-full flex-col items-center justify-start rounded-t-xl bg-gradient-to-b pt-2",
                  PODIUM_H[rank],
                  rank === 0
                    ? "from-gold/30 to-gold/5"
                    : "from-white/10 to-white/[0.02]",
                )}
              >
                <span className="text-xl">{MEDAL[rank]}</span>
                <span className="font-display text-lg tabular-nums text-chalk">
                  {p.rung}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* awards */}
      <div className="mt-6 space-y-2.5">
        {best && (
          <Award
            icon="🎯"
            label="Best call"
            body={
              <>
                <b className="text-chalk">
                  {best.player.id === view.you ? "You" : best.player.name}
                </b>{" "}
                banked{" "}
                <span className="text-gold">+{best.rungs} rungs</span> in
                Segment {best.index}
              </>
            }
          />
        )}
        <Award
          icon="🔨"
          label="Most savage fix"
          body={
            savage ? (
              <>
                <b className="text-chalk">{savage.fixer.name}</b> fixed{" "}
                <b className="text-chalk">{savage.target.name}</b> for{" "}
                <span className="text-vermilion-soft">+{savage.rungs}</span>
              </>
            ) : (
              <span className="text-fog">
                A clean match — nobody landed a fix. Cowards.
              </span>
            )
          }
        />
      </div>

      <div className="mt-auto flex gap-2.5 pt-6">
        <button
          onClick={share}
          className="flex-1 rounded-full bg-white/8 py-4 font-display text-sm uppercase tracking-wide text-chalk active:bg-white/14"
        >
          {copied ? "Copied ✓" : "Share result"}
        </button>
        <button
          onClick={onRematch}
          className="btn-gold flex-1 rounded-full py-4 font-display text-sm uppercase tracking-wide"
        >
          Rematch →
        </button>
      </div>
    </main>
  );
}

function Award({
  icon,
  label,
  body,
}: {
  icon: string;
  label: string;
  body: React.ReactNode;
}) {
  return (
    <div className="slip flex items-center gap-3 p-3.5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5 text-xl">
        {icon}
      </span>
      <div>
        <div className="font-display text-[11px] uppercase tracking-widest text-fog">
          {label}
        </div>
        <div className="text-sm leading-snug text-chalk/90">{body}</div>
      </div>
    </div>
  );
}
