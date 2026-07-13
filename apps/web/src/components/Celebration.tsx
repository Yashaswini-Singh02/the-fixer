"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo } from "react";
import { playWinTune } from "@/lib/winTune";

const COLORS = ["#ffc531", "#ffe08a", "#f3f6ef", "#ff8a80", "#7ee08a"];

/**
 * Full-screen party: confetti rain, a dancing cat, and the win fanfare.
 * Pointer-events pass straight through, so it can sit on top of anything.
 * Mount it when something good happens; unmount to stop the party.
 */
export function Celebration({
  big = false,
  label,
}: {
  /** champion mode: more confetti, bigger cat, longer fanfare */
  big?: boolean;
  /** headline under the cat, e.g. "+3 RUNGS!" */
  label?: string;
}) {
  useEffect(() => {
    playWinTune(big);
  }, [big]);

  const confetti = useMemo(
    () =>
      Array.from({ length: big ? 90 : 55 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        dur: 2.2 + Math.random() * 1.6,
        size: 6 + Math.random() * 7,
        color: COLORS[i % COLORS.length],
        tilt: Math.random() * 360,
        drift: -40 + Math.random() * 80,
      })),
    [big],
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden">
      {confetti.map((c, i) => (
        <span
          key={i}
          className="confetti absolute top-[-4%]"
          style={{
            left: `${c.left}%`,
            width: c.size,
            height: c.size * 0.45,
            background: c.color,
            animationDelay: `${c.delay}s`,
            animationDuration: `${c.dur}s`,
            ["--drift" as string]: `${c.drift}px`,
            ["--tilt" as string]: `${c.tilt}deg`,
          }}
        />
      ))}

      {/* the dancing cat */}
      <motion.div
        className="absolute inset-x-0 bottom-[16%] text-center"
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 160, damping: 14 }}
      >
        <motion.div
          className={big ? "text-8xl" : "text-7xl"}
          animate={{
            rotate: [0, -14, 12, -14, 12, 0],
            y: [0, -14, 0, -14, 0, 0],
          }}
          transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
        >
          🐈
        </motion.div>
        <motion.div
          className="text-2xl"
          animate={{ opacity: [0, 1, 0], y: [4, -12, -22] }}
          transition={{ duration: 1.2, repeat: Infinity }}
        >
          🎵🎶
        </motion.div>
        {label && (
          <motion.div
            className="mt-2 font-display text-3xl uppercase tracking-wide text-gold drop-shadow-[0_2px_12px_rgba(255,197,49,0.5)]"
            initial={{ scale: 0.7 }}
            animate={{ scale: [0.7, 1.15, 1] }}
            transition={{ duration: 0.5 }}
          >
            {label}
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
