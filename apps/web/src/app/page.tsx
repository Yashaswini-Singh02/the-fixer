"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import clsx from "clsx";
import { createRoom, fetchFixtures, type ApiFixture } from "@/lib/api";
import { FIXTURES, flagEmoji } from "@/lib/fixtures";
import { isMockMode } from "@/lib/socket";
import { newRoomCode } from "@/lib/room";
import { Intro } from "@/components/Intro";

const SIX_DAYS_MS = 6 * 24 * 60 * 60 * 1000;

/** Weekday + time soon; add month/day (and year if needed) beyond ~6 days. */
const kickoff = (ms: number) => {
  const d = new Date(ms);
  const far = Math.abs(d.getTime() - Date.now()) > SIX_DAYS_MS;
  const opts: Intl.DateTimeFormatOptions = {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  };
  if (far) {
    opts.month = "short";
    opts.day = "numeric";
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  }
  return new Intl.DateTimeFormat("en", opts).format(d);
};

/** The mock's fixed fixture list, dressed up in the API shape. */
const MOCK_FIXTURES: ApiFixture[] = FIXTURES.map((f, i) => ({
  ...f,
  kind: i === 0 ? "live" : "upcoming",
}));

export default function Landing() {
  const router = useRouter();
  const [showIntro, setShowIntro] = useState(true);
  const [joinCode, setJoinCode] = useState("");
  const [fixtures, setFixtures] = useState<ApiFixture[] | null>(
    isMockMode() ? MOCK_FIXTURES : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [creatingId, setCreatingId] = useState<string | null>(null);

  useEffect(() => {
    if (isMockMode()) return;
    let live = true;
    fetchFixtures()
      .then((f) => live && setFixtures(f))
      .catch((e) => live && setError((e as Error).message));
    return () => {
      live = false;
    };
  }, []);

  const create = async (f: ApiFixture) => {
    if (isMockMode()) {
      router.push(`/r/${newRoomCode()}`);
      return;
    }
    if (creatingId) return;
    setCreatingId(f.id);
    setError(null);
    try {
      const code = await createRoom(f.id);
      router.push(`/r/${code}`);
    } catch (e) {
      setError((e as Error).message);
      setCreatingId(null);
    }
  };

  const join = () => {
    const c = joinCode.trim().toUpperCase();
    if (c.length >= 3) router.push(`/r/${c}`);
  };

  const featured =
    fixtures?.find((f) => f.kind === "live") ??
    fixtures?.find((f) => f.kind === "upcoming") ??
    fixtures?.[0];
  const upcoming = fixtures?.filter(
    (f) => f.kind !== "past" && f.id !== featured?.id,
  );
  const past = fixtures?.filter(
    (f) => f.kind === "past" && f.id !== featured?.id,
  );

  return (
    <>
      <AnimatePresence>
        {showIntro && <Intro onDone={() => setShowIntro(false)} />}
      </AnimatePresence>

      <main className="frame flex min-h-dvh flex-col py-8">
        {/* wordmark hero */}
        <header className="text-center">
        <div className="font-display text-xs uppercase tracking-[0.4em] text-fog">
          A World Cup party game
        </div>
        <h1 className="mt-2 font-display text-[19vw] uppercase leading-[0.82] tracking-tight text-chalk sm:text-8xl">
          THE
          <br />
          <span className="relative inline-block text-gold">
            FIXER
    
          </span>
        </h1>
        <p className="mx-auto mt-4 max-w-[19rem] text-sm leading-snug text-fog">
          Watch the match together. Bet the segments in secret.{" "}
          <span className="text-chalk">Fix your friends</span> and climb the
          ladder.
        </p>
      </header>

      {error && (
        <div className="slip mt-6 border border-vermilion/40 p-3 text-center text-sm text-vermilion-soft">
          {error}
        </div>
      )}

      {!fixtures && !error && (
        <div className="mt-10 animate-pulse text-center text-sm text-fog">
          Finding matches…
        </div>
      )}

      {featured && (
        <FeaturedSlip
          fixture={featured}
          busy={creatingId === featured.id}
          onCreate={() => create(featured)}
        />
      )}

      {upcoming && upcoming.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 font-display text-xs uppercase tracking-widest text-fog">
            Coming up
          </div>
          <div className="space-y-2">
            {upcoming.map((f) => (
              <FixtureRow
                key={f.id}
                fixture={f}
                busy={creatingId === f.id}
                onCreate={() => create(f)}
              />
            ))}
          </div>
        </div>
      )}

      {past && past.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 font-display text-xs uppercase tracking-widest text-fog">
            Replay the latest matches
          </div>
          <div className="space-y-2">
            {past.map((f) => (
              <FixtureRow
                key={f.id}
                fixture={f}
                busy={creatingId === f.id}
                onCreate={() => create(f)}
              />
            ))}
          </div>
        </div>
      )}

      {/* join by code */}
      <div className="mt-auto pt-6">
        <div className="slip flex items-center gap-2 p-2">
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
            onKeyDown={(e) => e.key === "Enter" && join()}
            placeholder="Got a code?"
            className="min-w-0 flex-1 bg-transparent px-3 py-2.5 font-display text-lg uppercase tracking-[0.2em] text-chalk placeholder:tracking-normal placeholder:text-fog-dim focus:outline-none"
            aria-label="Room code"
          />
          <button
            onClick={join}
            disabled={joinCode.trim().length < 3}
            className="shrink-0 rounded-full bg-white/8 px-5 py-2.5 font-display text-sm uppercase tracking-wide text-chalk transition-opacity active:bg-white/14 disabled:opacity-30"
          >
            Join
          </button>
        </div>
      </div>
      </main>
    </>
  );
}

function FeaturedSlip({
  fixture,
  busy,
  onCreate,
}: {
  fixture: ApiFixture;
  busy: boolean;
  onCreate: () => void;
}) {
  return (
    <section className="slip mt-7 overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3.5">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-vermilion-soft">
          {fixture.kind === "live" ? (
            <>
              <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-vermilion" />
              Live now
            </>
          ) : fixture.kind === "past" ? (
            "Full replay"
          ) : (
            `Kicks off ${kickoff(fixture.kickoff)}`
          )}
        </span>
        <span className="text-[11px] uppercase tracking-widest text-fog">
          {fixture.competition}
        </span>
      </div>

      <div className="flex items-center justify-center gap-4 px-4 py-4">
        <TeamBadge flag={flagEmoji(fixture.home)} name={fixture.home} />
        <span className="font-display text-lg text-fog">vs</span>
        <TeamBadge flag={flagEmoji(fixture.away)} name={fixture.away} />
      </div>

      <button
        onClick={onCreate}
        disabled={busy}
        className="btn-gold flex w-full items-center justify-center gap-2 py-4 font-display text-lg uppercase tracking-wide disabled:opacity-50"
      >
        {busy ? "Opening room…" : "Start a room →"}
      </button>
    </section>
  );
}

function TeamBadge({ flag, name }: { flag: string; name: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-4xl">{flag}</span>
      <span className="font-display text-base uppercase tracking-wide text-chalk">
        {name}
      </span>
    </div>
  );
}

function FixtureRow({
  fixture,
  busy,
  onCreate,
}: {
  fixture: ApiFixture;
  busy: boolean;
  onCreate: () => void;
}) {
  return (
    <button
      onClick={onCreate}
      disabled={busy}
      className={clsx(
        "slip flex w-full items-center gap-3 p-3 text-left transition-colors active:bg-pitch-3",
        busy && "opacity-50",
      )}
    >
      <span className="text-xl">{flagEmoji(fixture.home)}</span>
      <span className="flex-1 truncate font-display text-sm uppercase tracking-wide text-chalk/90">
        {fixture.home} v {fixture.away}
      </span>
      <span className="text-xl">{flagEmoji(fixture.away)}</span>
      <span className="ml-1 shrink-0 text-[11px] tabular-nums text-fog">
        {busy
          ? "…"
          : fixture.kind === "past"
            ? "replay"
            : kickoff(fixture.kickoff)}
      </span>
    </button>
  );
}
