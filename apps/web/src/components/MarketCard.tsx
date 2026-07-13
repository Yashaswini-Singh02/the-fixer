"use client";

import type { BetSide, MarketKind, MarketPrice } from "@thefix/engine";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { MARKET_META, odds } from "@/lib/format";

export function MarketCard({
  market,
  price,
  sealed,
  yourBet,
  coins,
  onBet,
}: {
  market: MarketKind;
  price: MarketPrice;
  sealed: boolean;
  yourBet?: { side: BetSide; stake: number };
  coins: number;
  onBet: (side: BetSide, stake: number) => void;
}) {
  const meta = MARKET_META[market];
  const [side, setSide] = useState<BetSide | null>(yourBet?.side ?? null);

  // a highlighted side with no stake is just a draft — clear it at the seal
  // so it can't masquerade as a placed bet
  useEffect(() => {
    if (sealed && !yourBet) setSide(null);
  }, [sealed, yourBet]);

  // re-betting this market refunds the old stake, so it's spendable again
  const maxStake = coins + (yourBet?.stake ?? 0);
  const chips: (number | "MAX")[] = [1, 2, 5, "MAX"];

  const place = (chip: number | "MAX") => {
    if (!side || sealed) return;
    const stake = chip === "MAX" ? maxStake : chip;
    if (stake < 1 || stake > maxStake) return;
    onBet(side, stake);
  };

  return (
    <div className="board relative overflow-hidden rounded-slip p-3.5">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-white/5 text-lg">
          {meta.icon}
        </span>
        <div className="min-w-0">
          <div className="font-display text-sm uppercase leading-none tracking-wide text-chalk">
            {meta.label}
          </div>
          <div className="mt-0.5 truncate text-xs text-fog">{meta.q}</div>
        </div>
        {yourBet && (
          <span className="ml-auto shrink-0 rounded-full bg-gold/15 px-2 py-1 text-[11px] font-semibold tabular-nums text-gold">
            {yourBet.side} · {yourBet.stake}🪙
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <OddButton
          label="YES"
          value={odds(price.yes)}
          active={side === "YES"}
          locked={sealed}
          onClick={() => !sealed && setSide("YES")}
        />
        <OddButton
          label="NO"
          value={odds(price.no)}
          active={side === "NO"}
          locked={sealed}
          onClick={() => !sealed && setSide("NO")}
        />
      </div>

      {/* stake chips — appear once a side is chosen */}
      <div
        className={clsx(
          "grid grid-cols-4 gap-2 overflow-hidden transition-all duration-300",
          side && !sealed ? "mt-2 max-h-16 opacity-100" : "max-h-0 opacity-0",
        )}
      >
        {chips.map((chip) => {
          const stake = chip === "MAX" ? maxStake : chip;
          const disabled = stake < 1 || stake > maxStake;
          const isCurrent =
            yourBet?.side === side &&
            (chip === "MAX" ? maxStake : chip) === yourBet?.stake;
          return (
            <button
              key={String(chip)}
              disabled={disabled}
              onClick={() => place(chip)}
              className={clsx(
                "rounded-xl py-2 text-sm font-semibold tabular-nums transition-colors",
                isCurrent
                  ? "bg-gold text-[#14150a]"
                  : "bg-white/6 text-chalk active:bg-white/12",
                disabled && "opacity-25",
              )}
            >
              {chip === "MAX" ? "ALL" : chip}
            </button>
          );
        })}
      </div>

      {/* rubber-stamped diagonally across the odds, clear of the header
          where the bet pill lives — nothing overlaps */}
      {sealed && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 top-12 z-10 grid place-items-center">
          <div className="stamp-sealed -rotate-6 rounded-lg px-4 py-1.5 text-sm font-bold uppercase tracking-widest shadow-lift">
            Sealed 🤐
          </div>
        </div>
      )}
    </div>
  );
}

function OddButton({
  label,
  value,
  active,
  locked,
  onClick,
}: {
  label: string;
  value: string;
  active: boolean;
  locked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={locked}
      className={clsx(
        "flex flex-col items-center rounded-xl border py-2.5 transition-all",
        active
          ? "border-gold bg-gold/12 shadow-[0_0_0_1px_rgba(255,197,49,0.5)]"
          : "border-white/8 bg-black/20 active:border-white/20",
        locked && "opacity-60",
      )}
    >
      <span
        className={clsx(
          "font-display text-[11px] tracking-widest",
          active ? "text-gold" : "text-fog",
        )}
      >
        {label}
      </span>
      <span
        className={clsx(
          "font-display text-2xl tabular-nums leading-none",
          active ? "text-gold" : "text-chalk",
        )}
      >
        {value}
      </span>
    </button>
  );
}
