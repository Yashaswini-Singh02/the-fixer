"use client";

import { motion } from "framer-motion";
import clsx from "clsx";
import { Avatar } from "./Avatar";

interface Climber {
  id: string;
  name: string;
  emoji: string;
  rung: number;
}

const MARKS = [0, 5, 10, 15, 20];

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

  return (
    <div className={clsx("board relative overflow-hidden rounded-slip", className)}>
      {/* summit glow */}
      <div className="rung-hot pointer-events-none absolute inset-x-0 top-0 h-[22%]" />
      <div className="pointer-events-none absolute right-3 top-2.5 text-lg opacity-90">
        🏆
      </div>
      <div className="absolute left-3 top-2.5 font-display text-xs uppercase tracking-[0.2em] text-fog">
        The&nbsp;Ladder
      </div>

      {/* the climbing field (inset so rung 0 / 20 chips never clip) */}
      <div className="absolute inset-x-3 bottom-4 top-9">
        {/* rung marks */}
        {MARKS.map((m) => (
          <div
            key={m}
            className="absolute inset-x-0 flex items-center gap-2"
            style={{ bottom: pct(m), transform: "translateY(50%)" }}
          >
            <span className="w-5 shrink-0 text-right font-display text-[11px] tabular-nums text-fog-dim">
              {m}
            </span>
            <span
              className={clsx(
                "h-px flex-1",
                m === top
                  ? "bg-gradient-to-r from-gold/60 to-transparent"
                  : "bg-white/8",
              )}
            />
          </div>
        ))}

        {/* climbers */}
        {lanes.map((p, i) => {
          const you = p.id === youId;
          const leader = p.id === leaderId;
          const laneLeft = `${((i + 0.5) / n) * 100}%`;
          return (
            <motion.div
              key={p.id}
              className="absolute z-10 flex flex-col items-center"
              initial={false}
              style={{ left: laneLeft }}
              animate={{ bottom: pct(p.rung) }}
              transition={{ type: "spring", stiffness: 120, damping: 17 }}
            >
              <div className="translate-y-1/2">
                <div className="relative flex flex-col items-center">
                  {you && (
                    <span className="absolute -top-3.5 rounded-full bg-gold px-1.5 py-px font-display text-[9px] tracking-wide text-[#14150a]">
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
                      "mt-0.5 rounded-full px-1 font-display text-[10px] tabular-nums leading-tight",
                      you ? "text-gold" : "text-fog",
                    )}
                  >
                    {p.rung}
                  </span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
