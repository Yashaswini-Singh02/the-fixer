"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef } from "react";
import clsx from "clsx";
import { Avatar } from "./Avatar";

interface Climber {
  id: string;
  name: string;
  emoji: string;
  rung: number;
}

export function Ladder({
  players,
  youId,
  leaderId,
  top = 20,
  className,
}: {
  players: Climber[];
  youId: string;
  leaderId: string | null;
  top?: number;
  className?: string;
}) {
  // stable lane per player so climbs read as vertical lane races
  const lanes = [...players].sort((a, b) => a.id.localeCompare(b.id));
  const n = Math.max(lanes.length, 1);
  const pct = (rung: number) => `${(Math.min(rung, top) / top) * 100}%`;

  // remember last-seen rungs so a climb gets a floating "+N"
  const prevRef = useRef<Record<string, number>>({});
  const deltas: Record<string, number> = {};
  for (const p of lanes) {
    const prev = prevRef.current[p.id];
    if (prev !== undefined && p.rung > prev) deltas[p.id] = p.rung - prev;
  }
  useEffect(() => {
    prevRef.current = Object.fromEntries(lanes.map((p) => [p.id, p.rung]));
  });

  return (
    <div className={clsx("board relative overflow-hidden rounded-slip", className)}>
      {/* summit glow */}
      <div className="rung-hot pointer-events-none absolute inset-x-0 top-0 h-[22%]" />
      <div className="absolute left-3 top-2.5 font-display text-xs uppercase tracking-[0.2em] text-fog">
        The&nbsp;Ladder
      </div>
      <div className="absolute right-3 top-2.5 font-display text-[10px] uppercase tracking-[0.18em] text-gold/90">
        First to {top} 🏆
      </div>

      {/* the climbing field (inset so rung 0 / 20 chips never clip) */}
      <div className="absolute inset-x-3 bottom-5 top-9">
        {/* a real ladder: a line for every rung, bolder every 5 */}
        {Array.from({ length: top + 1 }, (_, m) => (
          <div
            key={m}
            className="absolute inset-x-0 flex items-center gap-2"
            style={{ bottom: pct(m), transform: "translateY(50%)" }}
          >
            <span
              className={clsx(
                "w-5 shrink-0 text-right font-display text-[11px] tabular-nums",
                m % 5 === 0 ? "text-fog-dim" : "text-transparent",
              )}
            >
              {m}
            </span>
            <span
              className={clsx(
                "h-px flex-1",
                m === top
                  ? "bg-gradient-to-r from-gold/70 via-gold/25 to-transparent"
                  : m % 5 === 0
                    ? "bg-white/12"
                    : "bg-white/[0.045]",
              )}
            />
          </div>
        ))}

        {/* lanes: rail + glowing progress trail + climber */}
        {lanes.map((p, i) => {
          const you = p.id === youId;
          const leader = p.id === leaderId;
          const laneLeft = `${((i + 0.5) / n) * 100}%`;
          return (
            <div key={p.id} className="absolute inset-y-0" style={{ left: laneLeft }}>
              {/* lane rail */}
              <span className="absolute inset-y-0 -translate-x-1/2 border-l border-dashed border-white/[0.07]" />
              {/* progress trail up to the current rung */}
              <motion.span
                className={clsx(
                  "absolute bottom-0 w-[3px] -translate-x-1/2 rounded-full",
                  you
                    ? "bg-gradient-to-t from-gold/0 via-gold/30 to-gold/80"
                    : "bg-gradient-to-t from-white/0 to-white/25",
                )}
                initial={false}
                animate={{ height: pct(p.rung) }}
                transition={{ type: "spring", stiffness: 120, damping: 17 }}
              />

              <motion.div
                className="absolute z-10 flex flex-col items-center"
                initial={false}
                animate={{ bottom: pct(p.rung) }}
                transition={{ type: "spring", stiffness: 120, damping: 17 }}
              >
                <div className="translate-y-1/2 -translate-x-1/2">
                  <div className="relative flex flex-col items-center">
                    {/* pulse ring — re-fires every time the rung changes */}
                    {p.rung > 0 && (
                      <motion.span
                        key={p.rung}
                        className={clsx(
                          "pointer-events-none absolute -inset-1.5 rounded-2xl",
                          you ? "bg-gold/25" : "bg-white/15",
                        )}
                        initial={{ scale: 0.7, opacity: 0.9 }}
                        animate={{ scale: 1.9, opacity: 0 }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                      />
                    )}
                    {/* floating +N on a climb */}
                    <AnimatePresence>
                      {deltas[p.id] && (
                        <motion.span
                          key={`d${p.rung}`}
                          className="pointer-events-none absolute -top-7 z-20 font-display text-base text-gold drop-shadow-[0_1px_6px_rgba(255,197,49,0.6)]"
                          initial={{ opacity: 0, y: 8, scale: 0.8 }}
                          animate={{ opacity: [0, 1, 1, 0], y: -20, scale: 1.1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 1.6 }}
                        >
                          +{deltas[p.id]}
                        </motion.span>
                      )}
                    </AnimatePresence>
                    {you && (
                      <span className="absolute -top-3.5 z-10 rounded-full bg-gold px-1.5 py-px font-display text-[9px] tracking-wide text-[#14150a]">
                        YOU
                      </span>
                    )}
                    <Avatar
                      emoji={p.emoji}
                      size="sm"
                      ring={you ? "gold" : leader ? "chalk" : "none"}
                      crown={leader && p.rung > 0}
                    />
                    <span
                      className={clsx(
                        "mt-0.5 rounded-full bg-black/40 px-1.5 font-display text-[10px] tabular-nums leading-snug",
                        you ? "text-gold" : "text-chalk/90",
                      )}
                    >
                      {p.rung}
                    </span>
                    <span className="mt-px max-w-[3.6rem] truncate text-[9px] leading-tight text-fog">
                      {you ? "you" : p.name}
                    </span>
                  </div>
                </div>
              </motion.div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
