"use client";

import type { RoomView } from "@thefix/engine";
import { motion } from "framer-motion";
import clsx from "clsx";
import { Avatar } from "./Avatar";
import {
  buildDossier,
  ordinal,
  type ClimbRow,
  type JobRow,
  type OnYouRow,
} from "@/lib/stats";
import { segmentTag } from "@/lib/format";

/** "Your File" — the syndicate's confidential dossier on you. Bottom sheet. */
export function StatsSheet({
  view,
  onClose,
}: {
  view: RoomView;
  onClose: () => void;
}) {
  const d = buildDossier(view);
  const maxClimb = Math.max(1, ...d.climbs.map((c) => c.rungs));

  return (
    <motion.div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="board relative mx-auto flex max-h-[92dvh] w-full max-w-[27rem] flex-col overflow-y-auto rounded-t-[1.75rem] pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 320, damping: 34 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Your file"
      >
        {/* grabber */}
        <div className="sticky top-0 z-10 flex flex-col items-center bg-gradient-to-b from-slate to-slate/85 pt-2.5">
          <span className="h-1 w-9 rounded-full bg-white/20" />
        </div>

        <div className="px-5 pt-3">
          {/* case-file cover */}
          <div className="flex items-start justify-between">
            <span className="font-display text-[11px] uppercase tracking-[0.32em] text-gold">
              Confidential · Your file
            </span>
            <button
              onClick={onClose}
              aria-label="Close your file"
              className="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-fog active:bg-white/10"
            >
              ✕
            </button>
          </div>

          <div className="mt-3 flex items-center gap-3.5">
            <Avatar emoji={d.you?.emoji ?? "🙂"} size="lg" ring="gold" />
            <div className="min-w-0">
              <div className="truncate font-display text-2xl uppercase tracking-wide text-chalk">
                {d.you?.name ?? "You"}
              </div>
              <div className="mt-1.5 flex items-baseline gap-2">
                <span className="font-display text-3xl leading-none tabular-nums text-gold">
                  {d.rung}
                </span>
                <span className="text-xs text-fog">
                  / {d.ladderTop} · {ordinal(d.rank)} of {d.totalPlayers}
                </span>
              </div>
            </div>
          </div>

          {/* THE CLIMB */}
          <Section
            label="The climb"
            note={
              d.segmentsPlayed > 0
                ? `+${d.totalClimb} over ${d.segmentsPlayed} segment${d.segmentsPlayed > 1 ? "s" : ""}`
                : undefined
            }
          >
            {d.climbs.length === 0 ? (
              <Empty>
                The whistle hasn&apos;t blown on a segment yet. Your climb starts
                at the first reveal.
              </Empty>
            ) : (
              <div className="space-y-1.5">
                {d.climbs.map((c) => (
                  <ClimbLine
                    key={c.index}
                    row={c}
                    max={maxClimb}
                    best={d.bestSegment?.index === c.index}
                  />
                ))}
              </div>
            )}
          </Section>

          {/* YOUR FIXES */}
          <Section
            label="Your fixes 🔨"
            note={d.jobs.length > 0 ? `${d.jobsLanded} landed` : undefined}
          >
            {d.jobs.length === 0 ? (
              <Empty>You&apos;ve kept your hands clean. So far.</Empty>
            ) : (
              <div className="space-y-2">
                {d.jobs.map((j, i) => (
                  <JobLine key={i} row={j} />
                ))}
              </div>
            )}
          </Section>

          {/* ON YOU — the redacted signature */}
          <Section
            label="On you 🎯"
            note={
              d.onYou.length > 0
                ? `${d.onYouLanded} landed on you`
                : undefined
            }
          >
            {d.onYou.length === 0 ? (
              <Empty>Nobody&apos;s come for you yet. Suspicious.</Empty>
            ) : (
              <div className="space-y-2">
                {d.onYou.map((o, i) => (
                  <OnYouLine key={i} row={o} />
                ))}
              </div>
            )}
          </Section>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Section({
  label,
  note,
  children,
}: {
  label: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6">
      <div className="mb-2.5 flex items-baseline justify-between border-b border-white/8 pb-1.5">
        <span className="font-display text-xs uppercase tracking-[0.2em] text-chalk/80">
          {label}
        </span>
        {note && (
          <span className="text-[11px] uppercase tracking-widest text-fog">
            {note}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl bg-white/[0.03] px-3.5 py-3 text-sm leading-snug text-fog">
      {children}
    </p>
  );
}

function ClimbLine({
  row,
  max,
  best,
}: {
  row: ClimbRow;
  max: number;
  best: boolean;
}) {
  const won = row.rungs > 0;
  const pct = won ? Math.max(12, (row.rungs / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-6 shrink-0 font-display text-xs uppercase tracking-wide text-fog">
        {segmentTag(row.index)}
      </span>
      <div className="h-6 flex-1 overflow-hidden rounded-md bg-white/[0.04]">
        {won ? (
          <div
            className={clsx(
              "h-full rounded-md bg-gradient-to-r from-gold-deep to-gold",
              best && "shadow-[0_0_16px_-4px_rgba(255,197,49,0.8)]",
            )}
            style={{ width: `${pct}%` }}
          />
        ) : null}
      </div>
      <span
        className={clsx(
          "w-9 shrink-0 text-right font-display text-sm tabular-nums",
          won ? "text-gold" : "text-fog-dim",
        )}
      >
        {won ? `+${row.rungs}` : "held"}
      </span>
    </div>
  );
}

function JobLine({ row }: { row: JobRow }) {
  const name = row.target?.name ?? "someone";
  return (
    <div
      className={clsx(
        "flex items-center gap-2.5 rounded-xl px-3 py-2.5 ring-1",
        row.succeeded
          ? "bg-gold/[0.06] ring-gold/25"
          : "bg-vermilion/[0.06] ring-vermilion/25",
      )}
    >
      <span className="w-6 shrink-0 font-display text-xs uppercase text-fog">
        {segmentTag(row.index)}
      </span>
      <span className="text-base">🔨</span>
      <Avatar emoji={row.target?.emoji ?? "🕵️"} size="xs" dim={row.succeeded} />
      <span className="min-w-0 flex-1 truncate text-sm text-chalk/90">{name}</span>
      {row.succeeded ? (
        <span className="shrink-0 font-display text-sm uppercase tracking-wide text-gold">
          Landed +{row.rungs}
        </span>
      ) : (
        <span className="shrink-0 font-display text-xs uppercase tracking-wide text-vermilion-soft">
          Backfired
        </span>
      )}
    </div>
  );
}

function OnYouLine({ row }: { row: OnYouRow }) {
  // landed & still anonymous → a redacted case-file entry
  if (row.succeeded && !row.fixer) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl bg-vermilion/[0.05] px-3 py-2.5 ring-1 ring-vermilion/20">
        <span className="w-6 shrink-0 font-display text-xs uppercase text-fog">
          {segmentTag(row.index)}
        </span>
        <span
          className="stamp-sealed h-5 min-w-[5.5rem] flex-1 rounded"
          aria-hidden
        />
        <span className="shrink-0 text-sm text-chalk/80">fixed you</span>
        <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-vermilion-soft">
          sealed
        </span>
      </div>
    );
  }
  // backfired: you cashed and blew their cover (fixer is always named here)
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-gold/[0.06] px-3 py-2.5 ring-1 ring-gold/25">
      <span className="w-6 shrink-0 font-display text-xs uppercase text-fog">
        {segmentTag(row.index)}
      </span>
      <Avatar emoji={row.fixer?.emoji ?? "😈"} size="xs" ring="red" />
      <span className="min-w-0 flex-1 truncate text-sm leading-snug text-chalk/90">
        <b className="text-chalk">{row.fixer?.name ?? "Someone"}</b> came for you
        - it backfired
      </span>
      <span className="shrink-0 font-display text-xs uppercase tracking-wide text-gold">
        exposed 🔒
      </span>
    </div>
  );
}
