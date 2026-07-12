"use client";

/**
 * Local identity: a stable playerId (uuid) + chosen name & emoji, persisted in
 * localStorage. This is the client's identity across reloads and reconnects.
 */

const KEY = "thefix:identity";

export interface Identity {
  playerId: string;
  name: string;
  emoji: string;
}

/** Avatar emojis to pick from — expressive faces + a few mascots. */
export const AVATARS = [
  "😎",
  "🦊",
  "🐼",
  "🐙",
  "🐲",
  "🦁",
  "👽",
  "🤠",
  "🥷",
  "🐧",
  "🦉",
  "🐺",
  "🦈",
  "🐝",
  "👾",
  "🦖",
];

const NAME_POOL = [
  "Striker",
  "Hat-Trick",
  "Offside",
  "Nutmeg",
  "Golazo",
  "Keeper",
  "Sweeper",
  "Volley",
];

function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Read identity, minting a playerId on first ever visit (name empty until set). */
export function loadIdentity(): Identity {
  if (typeof window === "undefined") {
    return { playerId: "", name: "", emoji: AVATARS[0] };
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Identity>;
      if (parsed.playerId) {
        return {
          playerId: parsed.playerId,
          name: parsed.name ?? "",
          emoji: parsed.emoji ?? AVATARS[0],
        };
      }
    }
  } catch {
    /* corrupt — remint below */
  }
  const fresh: Identity = { playerId: uuid(), name: "", emoji: AVATARS[0] };
  localStorage.setItem(KEY, JSON.stringify(fresh));
  return fresh;
}

export function saveIdentity(id: Identity): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(id));
}

export function suggestName(): string {
  return NAME_POOL[Math.floor(Math.random() * NAME_POOL.length)];
}
