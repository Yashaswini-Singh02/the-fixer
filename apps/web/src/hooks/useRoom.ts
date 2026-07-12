"use client";

import type {
  BetSide,
  MarketKind,
  RoomView,
  SegmentResult,
  Bet,
  ServerMsg,
} from "@thefix/engine";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Identity } from "@/lib/identity";
import { openRoom, type GameSocket } from "@/lib/socket";

export interface Reveal {
  result: SegmentResult;
  bets: Bet[];
  /** player rungs the instant the segment resolved (post-climb) */
  playersAtReveal: RoomView["state"]["players"];
}

export interface FloatingReaction {
  id: number;
  playerId: string;
  emoji: string;
  lane: number; // 0..1 horizontal position
}

export interface RoomApi {
  view: RoomView | null;
  reveal: Reveal | null;
  dismissReveal: () => void;
  reactions: FloatingReaction[];
  connected: boolean;
  /** fatal server error (e.g. room_not_found) — the room won't load */
  error: string | null;
  start: () => void;
  bet: (market: MarketKind, side: BetSide, stake: number) => void;
  fix: (targetId: string) => void;
  react: (emoji: string) => void;
}

export function useRoom(roomCode: string, identity: Identity): RoomApi {
  const [view, setView] = useState<RoomView | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<GameSocket | null>(null);
  const viewRef = useRef<RoomView | null>(null);
  const reactSeq = useRef(0);

  useEffect(() => {
    let live = true;
    let unsub: (() => void) | undefined;

    (async () => {
      const socket = await openRoom(roomCode);
      if (!live) {
        socket.close();
        return;
      }
      socketRef.current = socket;
      setConnected(true);

      unsub = socket.subscribe((msg: ServerMsg) => {
        if (!live) return;
        handleMessage(msg);
      });

      socket.send({
        type: "hello",
        roomCode,
        playerId: identity.playerId,
        name: identity.name,
        emoji: identity.emoji,
      });
    })();

    function handleMessage(msg: ServerMsg) {
      switch (msg.type) {
        case "view":
          viewRef.current = msg.view;
          setView(msg.view);
          break;
        case "reveal":
          setReveal({
            result: msg.result,
            bets: msg.bets,
            playersAtReveal: viewRef.current?.state.players ?? {},
          });
          break;
        case "react": {
          const id = reactSeq.current++;
          const lane = 0.12 + Math.random() * 0.76;
          setReactions((r) => [
            ...r,
            { id, playerId: msg.playerId, emoji: msg.emoji, lane },
          ]);
          setTimeout(() => {
            if (live) setReactions((r) => r.filter((x) => x.id !== id));
          }, 2400);
          break;
        }
        case "error":
          console.warn("[room] server error:", msg.code, msg.message);
          if (msg.code === "room_not_found") {
            setError("This room doesn't exist (or the server restarted).");
          }
          break;
      }
    }

    return () => {
      live = false;
      unsub?.();
      socketRef.current?.close();
      socketRef.current = null;
    };
    // identity is stable for a room session; reconnect only if the room changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode]);

  const start = useCallback(() => {
    socketRef.current?.send({ type: "start" });
  }, []);
  const bet = useCallback(
    (market: MarketKind, side: BetSide, stake: number) => {
      socketRef.current?.send({ type: "bet", market, side, stake });
    },
    [],
  );
  const fix = useCallback((targetId: string) => {
    socketRef.current?.send({ type: "fix", targetId });
  }, []);
  const react = useCallback((emoji: string) => {
    socketRef.current?.send({ type: "react", emoji });
  }, []);
  const dismissReveal = useCallback(() => setReveal(null), []);

  return {
    view,
    reveal,
    dismissReveal,
    reactions,
    connected,
    error,
    start,
    bet,
    fix,
    react,
  };
}
