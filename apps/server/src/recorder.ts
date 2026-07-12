import { appendFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { sseStream } from "./sse.js";

// auto-load .env from cwd or repo root, so `pnpm record` just works
for (const p of [".env", "../../.env"]) {
  try {
    process.loadEnvFile(resolve(p));
    break;
  } catch {
    /* keep looking */
  }
}



const [url, outFile] = process.argv.slice(2);
if (!url || !outFile) {
  console.error("usage: pnpm record <sse-url> <out-file.ndjson>");
  process.exit(1);
}

const headers: Record<string, string> = {};
if (process.env.TXLINE_JWT)
  headers["authorization"] = `Bearer ${process.env.TXLINE_JWT}`;
if (process.env.TXLINE_API_TOKEN)
  headers["x-api-token"] = process.env.TXLINE_API_TOKEN;

mkdirSync(dirname(outFile), { recursive: true });

// resume: pick up the last recorded event id so reconnect asks for a delta
let lastEventId: string | undefined;
if (existsSync(outFile)) {
  const lines = readFileSync(outFile, "utf8").trimEnd().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const row = JSON.parse(lines[i]!);
      if (row.id) {
        lastEventId = row.id;
        break;
      }
    } catch {
      /* torn line from a crash — skip */
    }
  }
  console.log(
    `resuming ${outFile} (${lines.length} lines, lastEventId=${lastEventId ?? "none"})`,
  );
}

let count = 0;
let backoffMs = 1000;
// reconnect if the stream goes silent this long — a dead proxy connection
// looks identical to a quiet match, and reconnecting during quiet is free
const IDLE_TIMEOUT_MS = 5 * 60_000;

for (;;) {
  const ac = new AbortController();
  let idleTimer = setTimeout(() => ac.abort(), IDLE_TIMEOUT_MS);
  const armIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => ac.abort(), IDLE_TIMEOUT_MS);
  };
  try {
    console.log(`connecting: ${url}`);
    for await (const evt of sseStream(url, {
      headers,
      lastEventId,
      signal: ac.signal,
    })) {
      armIdle();
      backoffMs = 1000; // healthy stream resets backoff
      if (evt.id) lastEventId = evt.id;
      appendFileSync(
        outFile,
        JSON.stringify({
          recordedAt: Date.now(),
          event: evt.event,
          ...(evt.id ? { id: evt.id } : {}),
          data: evt.data,
        }) + "\n",
      );
      count++;
      if (count % 25 === 0) console.log(`${count} events recorded`);
    }
    console.warn("stream ended cleanly; reconnecting…");
  } catch (err) {
    const msg = ac.signal.aborted
      ? "idle for 5m, reconnecting (normal while no match is live)"
      : `stream error: ${(err as Error).message}`;
    console.warn(msg);
  } finally {
    clearTimeout(idleTimer);
  }
  await new Promise((r) => setTimeout(r, backoffMs));
  backoffMs = Math.min(backoffMs * 2, 30_000);
}
