"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useRef, useState } from "react";
import clsx from "clsx";
import { CONFIG } from "@thefix/engine";
import { Avatar } from "./Avatar";

interface RailPlayer {
  id: string;
  name: string;
  emoji: string;
  rung: number;
}

const HOLD_MS = 550;

export function PlayerRail({
  others,
  betCounts,
  fixCount,
  yourFixTarget,
  coins,
  sealed,
  fixLocked,
  onFix,
}: {
  others: RailPlayer[];
  betCounts: Record<string, number>;
  fixCount: number;
  yourFixTarget: string | null;
  coins: number;
  sealed: boolean;
  /** a fix backfired on you last segment — you can't fix this one */
  fixLocked: boolean;
  onFix: (targetId: string) => void;
}) {
  const [holding, setHolding] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<RailPlayer | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canAfford = coins >= CONFIG.fixCost || yourFixTarget !== null;
  const canFix = !fixLocked && canAfford;

  const startHold = useCallback(
    (p: RailPlayer) => {
      if (sealed || !canFix) return;
      setHolding(p.id);
      timer.current = setTimeout(() => {
        setHolding(null);
        setConfirm(p);
        if (navigator.vibrate) navigator.vibrate(30);
      }, HOLD_MS);
    },
    [sealed, canFix],
  );
  const cancelHold = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setHolding(null);
  }, []);

  return (
    <div className="slip px-3.5 py-3">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="font-display text-xs uppercase tracking-widest text-fog">
          The Table
        </span>
        <span
          className={clsx(
            "rounded-full px-2 py-0.5 text-[11px] font-semibold",
            fixCount > 0
              ? "bg-vermilion/15 text-vermilion-soft"
              : "text-fog-dim",
          )}
        >
          {fixCount > 0 ? `${fixCount} fix${fixCount > 1 ? "es" : ""} placed 👀` : "no fixes… yet"}
        </span>
      </div>

      <div className="no-bar flex gap-3.5 overflow-x-auto pb-1">
        {others.map((p) => {
          const isTarget = yourFixTarget === p.id;
          const dots = Math.min(betCounts[p.id] ?? 0, 3);
          return (
            <button
              key={p.id}
              onPointerDown={() => startHold(p)}
              onPointerUp={cancelHold}
              onPointerLeave={cancelHold}
              onPointerCancel={cancelHold}
              onContextMenu={(e) => e.preventDefault()}
              className="relative flex w-16 shrink-0 select-none flex-col items-center gap-1"
              style={{ touchAction: "none" }}
            >
              {/* hold-to-fix progress ring */}
              {holding === p.id && (
                <span className="pointer-events-none absolute -inset-1 top-0 z-20 grid place-items-center">
                  <span
                    className="h-14 w-14 rounded-2xl border-2 border-vermilion"
                    style={{ animation: `holdfill ${HOLD_MS}ms linear forwards` }}
                  />
                </span>
              )}
              <Avatar
                emoji={p.emoji}
                size="md"
                ring={isTarget ? "red" : "none"}
              />
              {isTarget && (
                <span className="absolute -right-0.5 -top-1 z-10 text-sm">
                  🔨
                </span>
              )}
              <span className="max-w-full truncate text-[11px] text-fog">
                {p.name}
              </span>
              {/* sealed-bet indicators */}
              <span className="flex h-1.5 gap-0.5">
                {dots > 0 ? (
                  Array.from({ length: dots }).map((_, i) => (
                    <span
                      key={i}
                      className="h-1.5 w-1.5 rounded-full bg-gold/70"
                    />
                  ))
                ) : (
                  <span className="text-[9px] leading-none text-fog-dim">—</span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-center text-[11px] text-fog-dim">
        {sealed
          ? "bets sealed — the fix window is closed"
          : fixLocked
            ? "🔒 benched — your last fix backfired, no fixing this segment"
            : canAfford
              ? "hold a friend to fix them 🔨 · costs 2🪙"
              : "not enough coins to fix this segment"}
      </p>

      <AnimatePresence>
        {confirm && (
          <FixConfirm
            player={confirm}
            already={yourFixTarget === confirm.id}
            onClose={() => setConfirm(null)}
            onConfirm={() => {
              onFix(confirm.id);
              setConfirm(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function FixConfirm({
  player,
  already,
  onClose,
  onConfirm,
}: {
  player: RailPlayer;
  already: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="slip mx-3 mb-3 w-full max-w-[27rem] border-vermilion/40 p-5 text-center"
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 text-4xl">🔨</div>
        <h3 className="font-display text-2xl uppercase tracking-wide text-chalk">
          Fix {player.name}?
        </h3>
        <p className="mx-auto mt-1 max-w-[16rem] text-sm text-fog">
          Secretly bet they win <span className="text-chalk">nothing</span> this
          segment. If they do, you climb. If they cash — it backfires and
          they&apos;ll see it was you.
        </p>
        <div className="mt-4 flex gap-2.5">
          <button
            onClick={onClose}
            className="flex-1 rounded-full bg-white/8 py-3 font-semibold text-chalk active:bg-white/14"
          >
            Back off
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-full bg-vermilion py-3 font-display uppercase tracking-wide text-white shadow-[0_10px_30px_-12px_rgba(255,68,56,0.8)] active:translate-y-px"
          >
            {already ? "Keep it" : "Do it · 2🪙"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
