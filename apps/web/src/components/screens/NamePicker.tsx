"use client";

import { useState } from "react";
import clsx from "clsx";
import { AVATARS, suggestName, type Identity } from "@/lib/identity";
import { Avatar } from "@/components/Avatar";

export function NamePicker({
  identity,
  roomCode,
  onReady,
}: {
  identity: Identity;
  roomCode: string;
  onReady: (id: Identity) => void;
}) {
  const [name, setName] = useState(identity.name || "");
  const [emoji, setEmoji] = useState(identity.emoji || AVATARS[0]);

  const finalName = name.trim() || suggestName();
  const submit = () =>
    onReady({ ...identity, name: finalName, emoji });

  return (
    <main className="frame flex min-h-dvh flex-col justify-center py-8">
      <div className="mb-6 text-center">
        <div className="font-display text-xs uppercase tracking-[0.3em] text-gold">
          Joining room {roomCode}
        </div>
        <h1 className="mt-2 font-display text-4xl uppercase leading-none tracking-wide text-chalk">
          Take your seat
        </h1>
        <p className="mt-2 text-sm text-fog">
          Pick a face and a name your friends will love to fix.
        </p>
      </div>

      <div className="slip p-5">
        <div className="mb-4 flex flex-col items-center gap-3">
          <Avatar emoji={emoji} size="xl" ring="gold" />
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 14))}
            placeholder={suggestName()}
            className="w-full rounded-xl bg-black/25 px-4 py-3 text-center font-display text-2xl uppercase tracking-wide text-chalk placeholder:text-fog-dim focus:outline-none focus:ring-2 focus:ring-gold/60"
            aria-label="Your name"
          />
        </div>

        <div className="grid grid-cols-8 gap-1.5">
          {AVATARS.map((e) => (
            <button
              key={e}
              onClick={() => setEmoji(e)}
              className={clsx(
                "grid aspect-square place-items-center rounded-lg text-xl transition-all",
                emoji === e
                  ? "bg-gold/20 ring-2 ring-gold"
                  : "bg-white/4 active:bg-white/10",
              )}
              aria-label={`avatar ${e}`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={submit}
        className="btn-gold mt-5 w-full rounded-full py-4 font-display text-lg uppercase tracking-wide"
      >
        Enter the room →
      </button>
    </main>
  );
}
