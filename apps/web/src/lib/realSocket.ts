import type { ClientMsg, ServerMsg } from "@thefix/engine";
import type { GameSocket } from "./socket";

/**
 * RealSocket — thin WebSocket wrapper for the room server (:8080/ws). Buffers
 * sends until the socket opens, auto-reconnects with backoff, and re-sends the
 * last `hello` on every (re)connect so the server can re-attach this identity.
 * Selected when NEXT_PUBLIC_MOCK=0.
 */

const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8080/ws";

export class RealSocket implements GameSocket {
  private ws: WebSocket | null = null;
  private listeners = new Set<(m: ServerMsg) => void>();
  private queue: ClientMsg[] = [];
  private lastHello: ClientMsg | null = null;
  private retry = 0;
  private closed = false;

  // roomCode travels inside the `hello` frame; the server reads it from there
  constructor(_roomCode: string) {
    void _roomCode;
    this.connect();
  }

  private connect(): void {
    if (this.closed) return;
    const ws = new WebSocket(WS_URL);
    this.ws = ws;

    ws.onopen = () => {
      this.retry = 0;
      if (this.lastHello) ws.send(JSON.stringify(this.lastHello));
      for (const m of this.queue) ws.send(JSON.stringify(m));
      this.queue = [];
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as ServerMsg;
        for (const cb of this.listeners) cb(msg);
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onclose = () => {
      if (this.closed) return;
      const delay = Math.min(1000 * 2 ** this.retry++, 8000);
      setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => ws.close();
  }

  send(msg: ClientMsg): void {
    if (msg.type === "hello") this.lastHello = msg;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      this.queue.push(msg);
    }
  }

  subscribe(cb: (m: ServerMsg) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  close(): void {
    this.closed = true;
    this.listeners.clear();
    this.ws?.close();
  }
}
