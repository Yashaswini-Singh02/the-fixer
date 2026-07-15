"use client";

import type { YourGuess } from "@thefix/engine";
import { motion } from "framer-motion";
import clsx from "clsx";
import { useEffect, useState } from "react";
import { Avatar } from "./Avatar";
import { segmentTag } from "@/lib/format";

/**
 * "Who fixed you?" — the between-segments guess window. A fix landed on you and
 * stayed anonymous; name your fixer(s) before the clock runs out. Get at least
 * `needed` right (you may miss one) and you bank +2 coins next segment.
 */
export function GuessSheet({
  guess,
  onGuess,
}: {
  guess: YourGuess;
  onGuess: (segmentIndex: number, guessedFixerIds: string[]) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const secondsLeft = useCountdown(guess.deadline);

  const toggle = (id: string) => {
    if (guess.submitted) return;
    setPicked((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= guess.fixCount) {
        // at capacity: drop the oldest pick to make room (single-fix = swap)
        return [...cur.slice(1), id];
      }
      return [...cur, id];
    });
  };

  const many = guess.fixCount > 1;

  return (
    <motion.div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="board relative mx-auto flex max-h-[92dvh] w-full max-w-[27rem] flex-col overflow-y-auto rounded-t-[1.75rem] px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 320, damping: 34 }}
        role="dialog"
        aria-label="Guess your fixer"
      >
        <div className="flex items-start justify-between">
          <span className="font-display text-[11px] uppercase tracking-[0.32em] text-vermilion-soft">
            {segmentTag(guess.segmentIndex)} · you were fixed 🎯
          </span>
          {guess.deadline != null && !guess.submitted && (
            <span
              className={clsx(
                "font-display text-lg leading-none tabular-nums",
                secondsLeft <= 5 ? "text-vermilion" : "text-fog",
              )}
            >
              {secondsLeft}s
            </span>
          )}
        </div>

        <h2 className="mt-2 font-display text-3xl uppercase leading-none tracking-tight text-chalk">
          Who fixed you?
        </h2>
        <p className="mt-1.5 text-sm leading-snug text-fog">
          {many
            ? `${guess.fixCount} people came for you. Name them — get at least ${guess.needed} right and you cash +2🪙 next segment.`
            : "Name who came for you. Nail it and you cash +2🪙 next segment."}
        </p>

        {guess.submitted ? (
          <Verdict correct={guess.correct} />
        ) : (
          <>
            <div className="mt-4 grid grid-cols-3 gap-2.5">
              {guess.candidates.map((c) => {
                const on = picked.includes(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => toggle(c.id)}
                    className={clsx(
                      "flex flex-col items-center gap-1.5 rounded-2xl p-2.5 ring-1 transition-colors",
                      on
                        ? "bg-vermilion/12 ring-vermilion"
                        : "bg-white/[0.03] ring-white/8 active:bg-white/[0.06]",
                    )}
                  >
                    <Avatar
                      emoji={c.emoji}
                      size="md"
                      ring={on ? "red" : "none"}
                    />
                    <span className="max-w-full truncate text-[11px] text-chalk/90">
                      {c.name}
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              disabled={picked.length === 0}
              onClick={() => onGuess(guess.segmentIndex, picked)}
              className={clsx(
                "mt-5 w-full rounded-full py-4 font-display text-lg uppercase tracking-wide transition-opacity",
                picked.length === 0
                  ? "cursor-not-allowed bg-white/8 text-fog-dim"
                  : "bg-vermilion text-white shadow-[0_10px_30px_-12px_rgba(255,68,56,0.8)] active:translate-y-px",
              )}
            >
              {picked.length === 0
                ? "Pick a suspect"
                : many
                  ? `Accuse ${picked.length} of ${guess.fixCount}`
                  : "Accuse"}
            </button>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

function Verdict({ correct }: { correct: boolean | null }) {
  const good = correct === true;
  return (
    <div
      className={clsx(
        "mt-5 rounded-2xl p-5 text-center ring-1",
        good ? "bg-gold/[0.08] ring-gold/30" : "bg-white/[0.03] ring-white/8",
      )}
    >
      <div className="text-4xl">{good ? "🎯" : "🤷"}</div>
      <div
        className={clsx(
          "mt-2 font-display text-xl uppercase tracking-wide",
          good ? "text-gold" : "text-fog",
        )}
      >
        {good ? "Nailed it" : "Not this time"}
      </div>
      <p className="mt-1 text-sm text-fog">
        {good
          ? "You made them. +2🪙 → 12 next segment."
          : "They stay in the shadows — full names drop at full time."}
      </p>
    </div>
  );
}

/** Seconds remaining until `deadline` (epoch ms), ticking once a second. */
function useCountdown(deadline: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline == null) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [deadline]);
  if (deadline == null) return 0;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
