"use client";

import { AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useRoom } from "@/hooks/useRoom";
import { loadIdentity, saveIdentity, type Identity } from "@/lib/identity";
import { Lobby } from "@/components/screens/Lobby";
import { MatchRoom } from "@/components/screens/MatchRoom";
import { FullTime } from "@/components/screens/FullTime";
import { NamePicker } from "@/components/screens/NamePicker";
import { RevealOverlay } from "@/components/RevealOverlay";
import { ReactionLayer } from "@/components/Reactions";

export function RoomClient({ code }: { code: string }) {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = loadIdentity();
    setIdentity(id);
    if (id.name) setReady(true);
  }, []);

  if (!identity) return <Splash label="Loading…" />;

  if (!ready) {
    return (
      <NamePicker
        identity={identity}
        roomCode={code}
        onReady={(id) => {
          saveIdentity(id);
          setIdentity(id);
          setReady(true);
        }}
      />
    );
  }

  return <ConnectedRoom code={code} identity={identity} />;
}

function ConnectedRoom({
  code,
  identity,
}: {
  code: string;
  identity: Identity;
}) {
  const router = useRouter();
  const room = useRoom(code, identity);
  const { view, reveal } = room;

  if (room.error) {
    return (
      <main className="frame grid min-h-dvh place-items-center">
        <div className="text-center">
          <div className="font-display text-3xl uppercase text-chalk">
            Room {code} not found
          </div>
          <p className="mt-3 text-sm text-fog">{room.error}</p>
          <button
            onClick={() => router.push("/")}
            className="btn-gold mt-6 rounded-full px-6 py-3 font-display text-sm uppercase tracking-wide"
          >
            Back to matches
          </button>
        </div>
      </main>
    );
  }

  if (!view) return <Splash label="Entering the room…" />;

  const status = view.state.status;

  return (
    <>
      {status === "lobby" && <Lobby view={view} onStart={room.start} />}
      {status === "live" && (
        <>
          <MatchRoom
            view={view}
            onBet={room.bet}
            onFix={room.fix}
            onReact={room.react}
          />
          <ReactionLayer reactions={room.reactions} />
        </>
      )}
      {status === "finished" && (
        <FullTime view={view} onRematch={() => router.push("/")} />
      )}

      <AnimatePresence>
        {reveal && (
          <RevealOverlay
            key={reveal.result.index}
            reveal={reveal}
            youId={view.you}
            onDone={room.dismissReveal}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function Splash({ label }: { label: string }) {
  return (
    <main className="frame grid min-h-dvh place-items-center">
      <div className="text-center">
        <div className="font-display text-5xl uppercase tracking-tight text-chalk">
          THE <span className="text-gold">FIX</span>
        </div>
        <p className="mt-3 animate-pulse text-sm text-fog">{label}</p>
      </div>
    </main>
  );
}
