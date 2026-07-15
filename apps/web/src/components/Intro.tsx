"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/**
 * The front door. A struck ball arcs into a floodlit goal, the wordmark lands,
 * then a four-beat "how to play" hands off to the fixtures screen via "Let's
 * play". Shown over the Landing so fixtures load underneath. Fully skippable;
 * reduced-motion users skip straight to the wordmark + rules.
 */
export function Intro({ onDone }: { onDone: () => void }) {
  const reduced = useReducedMotion();
  const [stage, setStage] = useState<"splash" | "howto">("splash");
  const playRef = useRef<HTMLButtonElement>(null);

  // auto-advance the splash → how-to (snappy; instant for reduced motion)
  useEffect(() => {
    if (stage !== "splash") return;
    const t = setTimeout(() => setStage("howto"), reduced ? 400 : 2900);
    return () => clearTimeout(t);
  }, [stage, reduced]);

  // Escape always skips the whole intro; move focus to the CTA on the rules step
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone]);
  useEffect(() => {
    if (stage === "howto") playRef.current?.focus();
  }, [stage]);

  return (
    <motion.div
      className="fixed inset-0 z-50 overflow-hidden bg-pitch"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.4 } }}
    >
      <div className="stage" aria-hidden />

      {/* skip — always available on the splash */}
      {stage === "splash" && (
        <button
          onClick={onDone}
          className="absolute right-4 top-4 z-10 rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-fog transition-colors active:text-chalk"
        >
          Skip →
        </button>
      )}

      {stage === "splash" ? (
        <button
          type="button"
          onClick={() => setStage("howto")}
          aria-label="Continue to how to play"
          className="frame flex min-h-dvh w-full flex-col items-center justify-center"
        >
          {reduced ? <StaticWordmark /> : <KickScene />}
          <motion.p
            className="mt-10 text-[11px] uppercase tracking-[0.3em] text-fog-dim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: reduced ? 0.2 : 2.3, duration: 0.5 }}
          >
            Tap to continue
          </motion.p>
        </button>
      ) : (
        <HowToPlay ctaRef={playRef} onPlay={onDone} />
      )}
    </motion.div>
  );
}

/* ── the kick: line-art players → ball arcs into a lit goal → wordmark ── */

function KickScene() {
  // ball flight: struck from the striker's foot, arcs into the near top corner
  const flight = { delay: 0.55, duration: 0.8 };
  const impact = flight.delay + flight.duration; // ~1.35s

  return (
    <div className="relative flex w-full max-w-[23rem] flex-col items-center">
      <motion.svg
        viewBox="0 0 360 240"
        className="w-full"
        initial={{ opacity: 1 }}
        animate={{ opacity: [1, 1, 0.1] }}
        transition={{ times: [0, 0.62, 0.82], duration: 2.2, ease: "easeInOut" }}
        aria-hidden
      >
        <defs>
          <radialGradient id="flood" cx="50%" cy="8%" r="70%">
            <stop offset="0%" stopColor="#fff3d0" stopOpacity="0.5" />
            <stop offset="45%" stopColor="#fff3d0" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#fff3d0" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* floodlight flares up, then steadies */}
        <motion.rect
          x="0"
          y="0"
          width="360"
          height="240"
          fill="url(#flood)"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.9, 0.55] }}
          transition={{ duration: 0.7, times: [0, 0.4, 1] }}
        />

        {/* ground line */}
        <motion.line
          x1="14"
          y1="206"
          x2="346"
          y2="206"
          stroke="rgba(243,246,239,0.2)"
          strokeWidth="1.5"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
        />

        {/* goal + net (near left corner is the target) */}
        <motion.g
          stroke="rgba(243,246,239,0.85)"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.4 }}
        >
          <line x1="300" y1="110" x2="300" y2="206" />
          <line x1="348" y1="110" x2="348" y2="206" />
          <line x1="300" y1="110" x2="348" y2="110" />
        </motion.g>
        <motion.g
          className="net-ripple"
          stroke="rgba(243,246,239,0.16)"
          strokeWidth="1"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.8, 0.8, 1, 0.85], scaleY: [1, 1, 1, 1.05, 1] }}
          transition={{ delay: 0.15, duration: 1.4, times: [0, 0.15, 0.8, 0.86, 1] }}
          style={{ transformOrigin: "324px 110px" }}
        >
          <line x1="312" y1="110" x2="312" y2="206" />
          <line x1="324" y1="110" x2="324" y2="206" />
          <line x1="336" y1="110" x2="336" y2="206" />
          <line x1="300" y1="134" x2="348" y2="134" />
          <line x1="300" y1="158" x2="348" y2="158" />
          <line x1="300" y1="182" x2="348" y2="182" />
        </motion.g>

        {/* teammate — running, receiving the play */}
        <motion.g
          stroke="rgba(243,246,239,0.5)"
          strokeWidth="4"
          strokeLinecap="round"
          fill="none"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.35 }}
        >
          <circle cx="196" cy="112" r="8" fill="rgba(243,246,239,0.5)" stroke="none" />
          <path d="M196 121 L191 156" />
          <path d="M191 138 L178 146 M191 133 L206 128" />
          <path d="M191 156 L182 194 M191 156 L204 190" />
        </motion.g>

        {/* striker — plant leg fixed, kicking leg swings through */}
        <motion.g
          stroke="rgba(243,246,239,0.62)"
          strokeWidth="4.5"
          strokeLinecap="round"
          fill="none"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
        >
          <circle cx="82" cy="108" r="8.5" fill="rgba(243,246,239,0.62)" stroke="none" />
          <path d="M82 117 L78 156" />
          <path d="M78 138 L64 148 M78 133 L94 130" />
          {/* plant leg */}
          <path d="M78 156 L70 200" />
          {/* kicking leg — swings from cocked to extended right at the strike */}
          <motion.path
            d="M78 156 L96 182"
            initial={{ rotate: -42 }}
            animate={{ rotate: [-42, -42, 18] }}
            transition={{ duration: 0.6, delay: 0.15, times: [0, 0.6, 1] }}
            style={{ transformOrigin: "78px 156px" }}
          />
        </motion.g>

        {/* the gold flight trail, drawn as the ball travels then faded */}
        <motion.path
          d="M104 184 Q210 70 306 128"
          fill="none"
          stroke="#ffc531"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="0 1"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: [0, 1, 1], opacity: [0, 0.7, 0] }}
          transition={{ delay: flight.delay, duration: 1.0, times: [0, 0.55, 1] }}
        />

        {/* the ball — arcs to the corner, spinning */}
        <motion.g
          initial={{ x: 104, y: 184 }}
          animate={{ x: [104, 210, 306], y: [184, 84, 128] }}
          transition={{ delay: flight.delay, duration: flight.duration, ease: "easeOut" }}
        >
          <motion.g
            initial={{ rotate: 0 }}
            animate={{ rotate: 540 }}
            transition={{ delay: flight.delay, duration: flight.duration, ease: "linear" }}
          >
            <circle r="7.5" fill="#f3f6ef" />
            <circle r="2.4" fill="#0a130e" />
            <circle cx="4.5" cy="-3.5" r="1.4" fill="#0a130e" />
            <circle cx="-4.5" cy="3.5" r="1.4" fill="#0a130e" />
          </motion.g>
        </motion.g>

        {/* impact flash + a split-second vermilion "fix" glint */}
        <motion.circle
          cx="306"
          cy="128"
          fill="none"
          stroke="#ffe08a"
          strokeWidth="2.5"
          initial={{ r: 2, opacity: 0 }}
          animate={{ r: [2, 26], opacity: [0.9, 0] }}
          transition={{ delay: impact, duration: 0.5, ease: "easeOut" }}
        />
        <motion.text
          x="306"
          y="112"
          textAnchor="middle"
          fontSize="13"
          fontWeight="700"
          fill="#ff8a80"
          initial={{ opacity: 0, y: 0 }}
          animate={{ opacity: [0, 0.9, 0], y: [0, -10] }}
          transition={{ delay: impact + 0.05, duration: 0.7 }}
        >
          🔨 fixed
        </motion.text>
      </motion.svg>

      {/* the wordmark lands as the scene recedes */}
      <motion.div
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.55, duration: 0.5 }}
      >
        <motion.h1
          className="font-display text-6xl uppercase leading-[0.82] tracking-tight text-chalk"
          initial={{ scale: 1.25, opacity: 0, filter: "blur(6px)" }}
          animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
          transition={{ delay: 1.6, type: "spring", stiffness: 260, damping: 18 }}
        >
          THE
          <br />
          <span className="text-gold">FIXER</span>
        </motion.h1>
        <motion.div
          className="mt-3 font-display text-[11px] uppercase tracking-[0.4em] text-fog"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.0, duration: 0.5 }}
        >
          A World Cup party game
        </motion.div>
      </motion.div>
    </div>
  );
}

function StaticWordmark() {
  return (
    <div className="text-center">
      <h1 className="font-display text-6xl uppercase leading-[0.82] tracking-tight text-chalk">
        THE
        <br />
        <span className="text-gold">FIXER</span>
      </h1>
      <div className="mt-3 font-display text-[11px] uppercase tracking-[0.4em] text-fog">
        A World Cup party game
      </div>
    </div>
  );
}

/* ── how to play: four beats in the game's own vocabulary ── */

const STEPS = [
  {
    icon: "📺",
    title: "Watch together",
    body: "Grab 2–8 friends and one match. The game splits it into six 15-minute segments.",
  },
  {
    icon: "🪙",
    title: "Bet in secret",
    body: "Each segment you get 10 coins. Back yes or no on a goal, corners, or a card — nobody sees your slip.",
  },
  {
    icon: "🔨",
    title: "Fix a friend",
    body: "Spend 2 coins to jinx someone. If they win nothing, you climb. If they cash, it backfires — and they learn it was you.",
  },
  {
    icon: "🪜",
    title: "Climb the ladder",
    body: "Winnings move you up a shared 20-rung ladder. First to the top — or highest at full time — takes it.",
  },
];

function HowToPlay({
  ctaRef,
  onPlay,
}: {
  ctaRef: React.RefObject<HTMLButtonElement | null>;
  onPlay: () => void;
}) {
  return (
    <motion.div
      className="frame relative flex min-h-dvh flex-col py-8"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <header className="text-center">
        <div className="font-display text-[11px] uppercase tracking-[0.4em] text-gold">
          How to play
        </div>
        <h2 className="mt-2 font-display text-4xl uppercase leading-none tracking-tight text-chalk">
          THE <span className="text-gold">FIXER</span>
        </h2>
        <p className="mx-auto mt-2 max-w-[18rem] text-sm leading-snug text-fog">
          Secret bets. Backstabbing friends. One ladder. Here&apos;s the whole game.
        </p>
      </header>

      <ol className="mt-7 space-y-2.5">
        {STEPS.map((s, i) => (
          <motion.li
            key={s.title}
            className="slip flex items-start gap-3.5 p-3.5"
            initial={{ opacity: 0, x: -14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 + i * 0.1, duration: 0.35 }}
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/5 text-2xl">
              {s.icon}
            </span>
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="font-display text-[11px] tabular-nums text-fog-dim">
                  0{i + 1}
                </span>
                <span className="font-display text-lg uppercase tracking-wide text-chalk">
                  {s.title}
                </span>
              </div>
              <p className="mt-0.5 text-sm leading-snug text-fog">{s.body}</p>
            </div>
          </motion.li>
        ))}
      </ol>

      {/* the scream moment */}
      <motion.div
        className="board mt-4 flex items-center gap-3 rounded-slip p-3.5"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 + STEPS.length * 0.1, duration: 0.4 }}
      >
        <span className="text-2xl">💥</span>
        <p className="text-sm leading-snug text-chalk/90">
          Every segment ends in <b className="text-gold">the reveal</b> — slips flip,
          the ladder jumps, and the fixes come out. Brace for it.
        </p>
      </motion.div>

      <div className="mt-auto pt-6">
        <button
          ref={ctaRef}
          onClick={onPlay}
          className="btn-gold flex w-full items-center justify-center gap-2 rounded-full py-4 font-display text-lg uppercase tracking-wide"
        >
          Let&apos;s play →
        </button>
      </div>
    </motion.div>
  );
}
