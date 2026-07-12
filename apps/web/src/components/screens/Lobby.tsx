"use client";

import type { RoomView } from "@thefix/engine";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { flagEmoji } from "@/lib/fixtures";

const RULES = [
  {
    icon: "🎯",
    text: "Every 15-min segment you get 10 coins. Back Yes/No on goals, corners & cards at live odds.",
  },
  {
    icon: "🤐",
    text: "Bets are sealed. Nobody sees your picks until the segment whistle.",
  },
  {
    icon: "🔨",
    text: "Pay 2 coins to secretly fix a friend. They win nothing → you climb. They cash → it backfires and you're exposed.",
  },
  {
    icon: "🏆",
    text: "Climb the 20-rung ladder. First to the top — or highest at full time — takes it.",
  },
];

export function Lobby({
  view,
  onStart,
}: {
  view: RoomView;
  onStart: () => void;
}) {
  const players = Object.values(view.state.players);
  const isOrganizer = view.you === view.state.organizerId;
  const canStart = players.length >= 2;
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const data = {
      title: "The Fix",
      text: `Join my room ${view.roomCode} — we're fixing the ${view.fixture.home} v ${view.fixture.away} match 🔨`,
      url,
    };
    try {
      if (navigator.share) {
        await navigator.share(data);
        return;
      }
    } catch {
      /* user dismissed — fall through to copy */
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <main className="frame flex min-h-dvh flex-col py-6">
      {/* invite header */}
      <div className="slip flex items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-widest text-fog">
            Room code
          </div>
          <div className="font-display text-4xl uppercase tracking-[0.2em] text-gold">
            {view.roomCode}
          </div>
        </div>
        <button
          onClick={share}
          className="btn-gold shrink-0 rounded-full px-5 py-3 font-display text-sm uppercase tracking-wide"
        >
          {copied ? "Link copied ✓" : "Invite 🔗"}
        </button>
      </div>

      {/* the match */}
      <div className="mt-3 flex items-center justify-center gap-3 text-center">
        <span className="text-xl">{flagEmoji(view.fixture.home)}</span>
        <span className="font-display text-lg uppercase tracking-wide text-chalk/90">
          {view.fixture.home} v {view.fixture.away}
        </span>
        <span className="text-xl">{flagEmoji(view.fixture.away)}</span>
      </div>

      {/* players fill live */}
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-display text-xs uppercase tracking-widest text-fog">
            At the table
          </span>
          <span className="text-xs tabular-nums text-fog">
            {players.length}/8
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2.5">
          <AnimatePresence initial={false}>
            {players.map((p) => (
              <motion.div
                key={p.id}
                layout
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 380, damping: 24 }}
                className="slip flex flex-col items-center gap-1.5 p-2.5"
              >
                <Avatar
                  emoji={p.emoji}
                  size="md"
                  ring={p.id === view.you ? "gold" : "none"}
                  crown={p.id === view.state.organizerId}
                />
                <span className="max-w-full truncate text-xs text-chalk/90">
                  {p.id === view.you ? "You" : p.name}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
          {players.length < 2 &&
            Array.from({ length: 2 - players.length }).map((_, i) => (
              <div
                key={`ghost-${i}`}
                className="grid place-items-center rounded-slip border border-dashed border-white/10 p-2.5 text-fog-dim"
              >
                <span className="text-2xl opacity-40">＋</span>
                <span className="mt-1 text-[10px]">waiting…</span>
              </div>
            ))}
        </div>
      </div>

      {/* rules */}
      <div className="mt-6 space-y-2.5">
        {RULES.map((r, i) => (
          <div key={i} className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/5 text-lg">
              {r.icon}
            </span>
            <p className="pt-1 text-[13px] leading-snug text-fog">{r.text}</p>
          </div>
        ))}
      </div>

      {/* start */}
      <div className="mt-auto pt-6">
        {isOrganizer ? (
          <button
            onClick={onStart}
            disabled={!canStart}
            className="btn-gold w-full rounded-full py-4 font-display text-lg uppercase tracking-wide disabled:opacity-40"
          >
            {canStart ? "Kick off →" : "Need 2+ players"}
          </button>
        ) : (
          <div className="rounded-full bg-white/5 py-4 text-center font-display text-sm uppercase tracking-wide text-fog">
            Waiting for the organizer to start…
          </div>
        )}
      </div>
    </main>
  );
}
