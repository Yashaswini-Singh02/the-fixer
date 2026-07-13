"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { MARKETS } from "@thefix/engine";
import type { Reveal } from "@/hooks/useRoom";
import { MARKET_META } from "@/lib/format";
import { Avatar } from "./Avatar";
import { Celebration } from "./Celebration";

const ACTS = ["Outcomes", "The bets", "The fixes"] as const;

export function RevealOverlay({
  reveal,
  youId,
  onDone,
}: {
  reveal: Reveal;
  youId: string;
  onDone: () => void;
}) {
  const [act, setAct] = useState(0);
  const { result, bets, playersAtReveal } = reveal;

  // you climbed → cat, confetti and the fanfare over the first two acts
  const youClimb = result.climbs[youId] ?? 0;
  const [party, setParty] = useState(youClimb > 0);
  useEffect(() => {
    if (!party) return;
    const t = setTimeout(() => setParty(false), 3500);
    return () => clearTimeout(t);
  }, [party]);

  // auto-advance through the acts; tap to hurry
  useEffect(() => {
    if (act >= ACTS.length - 1) return;
    const t = setTimeout(() => setAct((a) => Math.min(a + 1, ACTS.length - 1)), 3000);
    return () => clearTimeout(t);
  }, [act]);

  const next = () =>
    act >= ACTS.length - 1 ? onDone() : setAct((a) => a + 1);

  // group bets by player for act 2
  const byPlayer = new Map<string, typeof bets>();
  for (const b of bets) {
    const arr = byPlayer.get(b.playerId) ?? [];
    arr.push(b);
    byPlayer.set(b.playerId, arr);
  }
  const scoreboard = Object.values(playersAtReveal)
    .filter((p) => byPlayer.has(p.id) || (result.climbs[p.id] ?? 0) > 0)
    .sort((a, b) => (result.climbs[b.id] ?? 0) - (result.climbs[a.id] ?? 0));

  return (
    <motion.div
      className="fixed inset-0 z-50 overflow-y-auto bg-[#070d0a]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={next}
    >
      <div className="stage" aria-hidden />
      {party && (
        <Celebration
          label={youClimb === 1 ? "+1 RUNG!" : `+${youClimb} RUNGS!`}
        />
      )}
      <div className="frame flex min-h-full flex-col justify-center py-10">
        {/* act header */}
        <div className="mb-6 text-center">
          <div className="font-display text-xs uppercase tracking-[0.35em] text-gold">
            Segment {result.index} · the reveal
          </div>
          <div className="mt-3 flex justify-center gap-1.5">
            {ACTS.map((_, i) => (
              <span
                key={i}
                className={clsx(
                  "h-1 rounded-full transition-all",
                  i === act ? "w-7 bg-gold" : "w-3 bg-white/15",
                )}
              />
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {act === 0 && (
            <ActWrap key="a0">
              <h2 className="mb-5 text-center font-display text-3xl uppercase tracking-wide text-chalk">
                What actually happened
              </h2>
              <div className="space-y-2.5">
                {MARKETS.map((m, i) => {
                  const yes = result.outcomes[m];
                  return (
                    <motion.div
                      key={m}
                      initial={{ opacity: 0, x: -24 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.25 + i * 0.45, type: "spring", stiffness: 200, damping: 20 }}
                      className="board flex items-center gap-3 rounded-slip p-4"
                    >
                      <span className="text-3xl">{MARKET_META[m].icon}</span>
                      <div className="font-display text-xl uppercase tracking-wide text-chalk">
                        {MARKET_META[m].label}
                      </div>
                      <span
                        className={clsx(
                          "ml-auto font-display text-2xl uppercase tracking-wide",
                          yes ? "text-gold" : "text-fog",
                        )}
                      >
                        {yes ? "YES" : "NO"}
                      </span>
                    </motion.div>
                  );
                })}
              </div>
            </ActWrap>
          )}

          {act === 1 && (
            <ActWrap key="a1">
              <h2 className="mb-5 text-center font-display text-3xl uppercase tracking-wide text-chalk">
                Bets unsealed
              </h2>
              <div className="space-y-2">
                {scoreboard.map((p, i) => {
                  const climb = result.climbs[p.id] ?? 0;
                  const mine = byPlayer.get(p.id) ?? [];
                  return (
                    <motion.div
                      key={p.id}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15 + i * 0.28 }}
                      className={clsx(
                        "slip flex items-center gap-3 p-3",
                        p.id === youId && "ring-1 ring-gold/50",
                      )}
                    >
                      <Avatar emoji={p.emoji} size="sm" ring={p.id === youId ? "gold" : "none"} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-chalk">
                          {p.id === youId ? "You" : p.name}
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {mine.length === 0 && (
                            <span className="text-[11px] text-fog-dim">sat this one out</span>
                          )}
                          {mine.map((b, j) => {
                            const won = (b.side === "YES") === result.outcomes[b.market];
                            return (
                              <span
                                key={j}
                                className={clsx(
                                  "rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
                                  won ? "bg-gold/15 text-gold" : "bg-white/5 text-fog line-through",
                                )}
                              >
                                {MARKET_META[b.market].icon}
                                {b.side} {b.stake}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                      <span
                        className={clsx(
                          "font-display text-2xl tabular-nums",
                          climb > 0 ? "text-gold" : "text-fog-dim",
                        )}
                      >
                        {climb > 0 ? `+${climb}` : "—"}
                      </span>
                    </motion.div>
                  );
                })}
              </div>
            </ActWrap>
          )}

          {act === 2 && (
            <ActWrap key="a2">
              <h2 className="mb-5 text-center font-display text-3xl uppercase tracking-wide text-chalk">
                The fixes 🔨
              </h2>
              <div className="space-y-3">
                {result.fixes.length === 0 && (
                  <div className="board rounded-slip p-6 text-center">
                    <div className="text-4xl">😇</div>
                    <p className="mt-2 text-fog">
                      Nobody played dirty this segment. Suspicious.
                    </p>
                  </div>
                )}
                {result.fixes.map((f, i) => {
                  // a landed fix arrives nameless unless YOU placed it
                  const fixer = f.fixerId ? playersAtReveal[f.fixerId] : null;
                  const target = playersAtReveal[f.targetId];
                  if (!target || (!fixer && !f.succeeded)) return null;
                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, scale: 0.94 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.2 + i * 0.5, type: "spring", stiffness: 240, damping: 18 }}
                      className={clsx(
                        "board rounded-slip p-4",
                        f.succeeded ? "ring-1 ring-vermilion/40" : "ring-1 ring-gold/40",
                      )}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <Avatar emoji={fixer?.emoji ?? "🕵️"} size="sm" ring={fixer && f.fixerId === youId ? "gold" : "red"} />
                        <span className="text-xl">🔨</span>
                        <Avatar emoji={target.emoji} size="sm" ring={f.targetId === youId ? "gold" : "none"} dim={f.succeeded} />
                      </div>
                      <p className="mt-3 text-center text-sm leading-snug">
                        {f.succeeded && fixer ? (
                          <>
                            <b className="text-chalk">{f.fixerId === youId ? "You" : fixer.name}</b> fixed{" "}
                            <b className="text-chalk">{target.name}</b>…
                            and <b className="text-vermilion-soft">it LANDED</b>.{" "}
                            <span className="text-gold">+{f.rungs} — nobody saw a thing</span> 🔨
                          </>
                        ) : f.succeeded ? (
                          <>
                            <b className="text-chalk">Someone</b> fixed{" "}
                            <b className="text-chalk">{f.targetId === youId ? "you" : target.name}</b>…
                            and <b className="text-vermilion-soft">it LANDED</b>.
                            Names come out at full time 🔨
                          </>
                        ) : fixer ? (
                          <>
                            <b className="text-chalk">{fixer.name}</b> came for{" "}
                            <b className="text-chalk">{target.name}</b>… but they{" "}
                            <b className="text-gold">CASHED</b>. Backfired — cover
                            blown, <span className="text-gold">{target.name} +1</span> 😈
                          </>
                        ) : null}
                      </p>
                    </motion.div>
                  );
                })}
              </div>
            </ActWrap>
          )}
        </AnimatePresence>

        <div className="mt-8 text-center">
          <button
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            className="btn-gold rounded-full px-8 py-3 font-display uppercase tracking-wide"
          >
            {act >= ACTS.length - 1 ? "Back to the match" : "Next"}
          </button>
          <p className="mt-3 text-[11px] text-fog-dim">tap anywhere to continue</p>
        </div>
      </div>
    </motion.div>
  );
}

function ActWrap({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.35 }}
    >
      {children}
    </motion.div>
  );
}
