/**
 * One-off backfill: push the local disk fixture index into Redis so a fresh
 * prod deploy already knows the past matches the snapshot has since forgotten.
 * The switch to a Redis-backed index only remembers matches seen from now on;
 * anything already past can never re-enter the snapshot, so it needs seeding.
 *
 * Run once, from a machine that has the local index, with prod REDIS_URL set:
 *   REDIS_URL=redis://... pnpm --filter @thefix/server seed-fixtures
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadSeenFixtures, persistSeenFixtures } from "./redis.js";

if (!process.env.REDIS_URL) {
  console.error("REDIS_URL unset — nothing to seed into");
  process.exit(1);
}

const file = fileURLToPath(new URL("../data/fixtures-seen.json", import.meta.url));
const fixtures = JSON.parse(readFileSync(file, "utf8")) as unknown[];
console.log(`seeding ${fixtures.length} fixtures from ${file}`);

persistSeenFixtures(fixtures as never);

// The write is fire-and-forget; read it back so we only exit once it lands.
for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 250));
  const stored = await loadSeenFixtures();
  if (stored.length >= fixtures.length) {
    console.log(`done — ${stored.length} fixtures now in Redis`);
    process.exit(0);
  }
}
console.error("seed did not confirm within timeout");
process.exit(1);
