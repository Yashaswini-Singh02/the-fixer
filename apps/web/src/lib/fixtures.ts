import type { RoomView } from "@thefix/engine";

export type Fixture = RoomView["fixture"];

/** The mock's headline fixture (from the brief's starter data). */
export const DEMO_FIXTURE: Fixture = {
  id: "18213979",
  home: "Norway",
  away: "England",
  competition: "World Cup",
  kickoff: 1783803600000,
};

/** Fixtures shown on the landing screen in mock mode (mirrors fixtures.json). */
export const FIXTURES: Fixture[] = [
  DEMO_FIXTURE,
  {
    id: "18222446",
    home: "Argentina",
    away: "Switzerland",
    competition: "World Cup",
    kickoff: 1783818000000,
  },
  {
    id: "18237038",
    home: "France",
    away: "Spain",
    competition: "World Cup",
    kickoff: 1784055600000,
  },
  {
    id: "18182808",
    home: "Australia",
    away: "Brazil",
    competition: "Friendlies",
    kickoff: 1790348400000,
  },
];

/** Flag-ish country tint pairs — used to color the score strip, not real crests. */
export const COUNTRY_TINT: Record<string, string> = {
  Norway: "#ba1a2c",
  England: "#f6f7f2",
  Argentina: "#6cb6ff",
  Switzerland: "#ff4438",
  France: "#3a5bd9",
  Spain: "#ffb020",
  Australia: "#00843d",
  Brazil: "#ffd23f",
  Myanmar: "#ffb020",
  Vietnam: "#ff4438",
};

export const flagEmoji = (name: string): string =>
  ({
    Norway: "🇳🇴",
    England: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    Argentina: "🇦🇷",
    Switzerland: "🇨🇭",
    France: "🇫🇷",
    Spain: "🇪🇸",
    Australia: "🇦🇺",
    Brazil: "🇧🇷",
    Myanmar: "🇲🇲",
    Vietnam: "🇻🇳",
  })[name] ?? "🏳️";
