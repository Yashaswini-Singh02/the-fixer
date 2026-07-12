import { readFileSync } from "node:fs";
import type { StreamEvent } from "@thefix/shared";
import { Normalizer } from "./ingest/normalize.js";

/**
 * Replay harness (PRD §7): recorded raw data -> the same normalized stream
 * the live ingest produces. Replay mode, balance simulation, and unit tests
 * all run through here.
 */

/**
 * Parse raw SSE text (the format of `/api/scores/historical/{fixtureId}`
 * responses and our stream captures) into an array of data records.
 */
export function parseSseText(text: string): any[] {
  return text
    .split(/\r?\n\r?\n/)
    .map((frame) => {
      const m = frame.match(/^data: ?(.*)$/m);
      if (!m) return null;
      try {
        return JSON.parse(m[1]!);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * Parse any recording format we produce:
 * - `.json`   plain JSON array (historical REST downloads)
 * - `.ndjson` recorder output, one {recordedAt, event, id?, data} per line
 * - anything else: raw SSE text (historical stream downloads)
 */
export function parseRecording(path: string): any[] {
  const text = readFileSync(path, "utf8");
  if (path.endsWith(".json")) return JSON.parse(text);
  if (path.endsWith(".ndjson")) {
    return text
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          const row = JSON.parse(line);
          return typeof row.data === "string" ? JSON.parse(row.data) : row;
        } catch {
          return null; // torn line from a crash mid-write
        }
      })
      .filter(Boolean);
  }
  return parseSseText(text);
}

export interface TimedRaw {
  src: "scores" | "odds";
  ts: number;
  raw: any;
}

/** Interleave scores + odds records into one source-time-ordered stream. */
export function merge(scores: any[], odds: any[]): TimedRaw[] {
  return [
    ...scores.map((raw) => ({ src: "scores" as const, ts: raw.Ts ?? 0, raw })),
    ...odds.map((raw) => ({ src: "odds" as const, ts: raw.Ts ?? 0, raw })),
  ].sort((a, b) => a.ts - b.ts);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Replay raw items through a normalizer, paced at `speed`x realtime
 * (Infinity = as fast as possible). Gaps are capped at 60s wall time so a
 * pre-match lull can't stall a demo.
 */
export async function* replay(
  items: TimedRaw[],
  normalizer: Normalizer,
  speed = Infinity,
): AsyncGenerator<StreamEvent> {
  let prev: number | null = null;
  for (const item of items) {
    if (speed !== Infinity && prev !== null && item.ts > prev) {
      await sleep(Math.min((item.ts - prev) / speed, 60_000));
    }
    prev = item.ts;
    const events =
      item.src === "scores"
        ? normalizer.scores(item.raw)
        : [normalizer.odds(item.raw)];
    for (const e of events) if (e) yield e;
  }
}
