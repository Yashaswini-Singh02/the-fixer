import type { Fixture } from "./fixtures";

/**
 * REST client for the room server. Only used in real mode — the mock never
 * touches the network. Fixtures come from the server's registry (fed by the
 * live TxLINE snapshot), rooms are created server-side and joined by the
 * returned code.
 */

export type FixtureKind = "upcoming" | "live" | "past";
export type ApiFixture = Fixture & { kind: FixtureKind };

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export async function fetchFixtures(): Promise<ApiFixture[]> {
  const res = await fetch(`${API_URL}/api/fixtures`);
  if (!res.ok) throw new Error(`fixtures failed (HTTP ${res.status})`);
  return res.json();
}

export async function createRoom(
  fixtureId: string,
  speed?: number,
): Promise<string> {
  const res = await fetch(`${API_URL}/api/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(speed ? { fixtureId, speed } : { fixtureId }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    roomCode?: string;
    error?: string;
  };
  if (!res.ok || !body.roomCode) {
    throw new Error(body.error ?? `room creation failed (HTTP ${res.status})`);
  }
  return body.roomCode;
}
