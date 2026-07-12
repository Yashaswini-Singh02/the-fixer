"use client";

import type { FloatingReaction } from "@/hooks/useRoom";

const EMOJI = ["🔥", "😱", "😭", "🤣", "🙏", "🤬"];

export function ReactionLayer({ reactions }: { reactions: FloatingReaction[] }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-40 mx-auto max-w-[27rem]">
      {reactions.map((r) => (
        <span
          key={r.id}
          className="react-float absolute bottom-24 text-3xl"
          style={{ left: `${r.lane * 100}%` }}
        >
          {r.emoji}
        </span>
      ))}
    </div>
  );
}

export function ReactionBar({ onReact }: { onReact: (emoji: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-1 rounded-full bg-pitch-2/90 px-2 py-1.5 ring-1 ring-white/8 backdrop-blur">
      {EMOJI.map((e) => (
        <button
          key={e}
          onClick={() => onReact(e)}
          className="grid h-9 w-9 place-items-center rounded-full text-xl transition-transform active:scale-90 active:bg-white/10"
          aria-label={`react ${e}`}
        >
          {e}
        </button>
      ))}
    </div>
  );
}
