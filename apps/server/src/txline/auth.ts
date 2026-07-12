/**
 * TxLINE auth: the durable x-api-token comes from .env; the short-lived JWT
 * is a free anonymous guest token (POST /auth/guest/start, no credentials),
 * so we mint one lazily and re-mint whenever a request comes back 401.
 * This replaces the stale TXLINE_JWT-in-.env workflow.
 */

let jwt: string | null = process.env.TXLINE_JWT ?? null;

async function mintGuestJwt(origin: string): Promise<string | null> {
  try {
    const res = await fetch(`${origin}/auth/guest/start`, { method: "POST" });
    if (!res.ok) return null;
    const body = (await res.json()) as { token?: unknown };
    return typeof body.token === "string" ? body.token : null;
  } catch {
    return null;
  }
}

/** Headers for TxLINE calls; `refresh` forces a fresh guest JWT. */
export async function authHeaders(
  origin: string,
  refresh = false,
): Promise<Record<string, string>> {
  if (refresh || !jwt) jwt = (await mintGuestJwt(origin)) ?? jwt;
  const h: Record<string, string> = {};
  if (jwt) h["authorization"] = `Bearer ${jwt}`;
  if (process.env.TXLINE_API_TOKEN)
    h["x-api-token"] = process.env.TXLINE_API_TOKEN;
  return h;
}

/** GET a TxLINE endpoint, retrying once with a fresh JWT on 401. */
export async function authedFetch(
  origin: string,
  path: string,
): Promise<Response> {
  let res = await fetch(`${origin}${path}`, {
    headers: await authHeaders(origin),
  });
  if (res.status === 401) {
    res = await fetch(`${origin}${path}`, {
      headers: await authHeaders(origin, true),
    });
  }
  return res;
}
