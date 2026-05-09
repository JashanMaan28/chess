import { createClerkClient, verifyToken } from "@clerk/backend";
import type { Env } from "./env";
import { getDb, schema } from "./db/client";
import { eq } from "drizzle-orm";

export type AuthedUser = {
  clerkId: string;
  username: string;
};

export async function verifySessionToken(
  env: Env,
  token: string
): Promise<{ sub: string } | null> {
  try {
    const payload = await verifyToken(token, {
      secretKey: env.CLERK_SECRET_KEY,
      jwtKey: env.CLERK_JWT_KEY,
    });
    if (!payload?.sub) return null;
    return { sub: payload.sub as string };
  } catch {
    return null;
  }
}

/**
 * Verify token, then ensure a `users` row exists for this Clerk subject.
 * Lazily creates the row from Clerk user data on first sign-in.
 */
export async function authenticate(
  env: Env,
  token: string | null
): Promise<AuthedUser | null> {
  if (!token) return null;
  const payload = await verifySessionToken(env, token);
  if (!payload) return null;

  const db = getDb(env.DB);
  const existing = await db.query.users.findFirst({
    where: eq(schema.users.clerkId, payload.sub),
  });
  if (existing) {
    // Lazy backfill: rows created before the first_name column exists carry
    // null. Fetch once from Clerk and persist — empty string when Clerk has
    // no first name, so we don't refetch on every request.
    if (existing.firstName == null) {
      const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
      const u = await clerk.users.getUser(payload.sub);
      await db
        .update(schema.users)
        .set({ firstName: u.firstName ?? "" })
        .where(eq(schema.users.clerkId, payload.sub));
    }
    return { clerkId: existing.clerkId, username: existing.username };
  }

  const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
  const u = await clerk.users.getUser(payload.sub);
  const baseUsername =
    u.username ||
    u.primaryEmailAddress?.emailAddress?.split("@")[0] ||
    `player_${payload.sub.slice(-6)}`;

  const username = await pickUniqueUsername(env, baseUsername);

  await db.insert(schema.users).values({
    clerkId: payload.sub,
    username,
    firstName: u.firstName ?? "",
    createdAt: Date.now(),
  });

  return { clerkId: payload.sub, username };
}

async function pickUniqueUsername(env: Env, base: string): Promise<string> {
  const db = getDb(env.DB);
  const sanitized = base.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "player";
  let candidate = sanitized;
  for (let i = 0; i < 8; i++) {
    const exists = await db.query.users.findFirst({
      where: eq(schema.users.username, candidate),
    });
    if (!exists) return candidate;
    candidate = `${sanitized}${Math.floor(Math.random() * 9999)}`;
  }
  return `${sanitized}_${Date.now().toString(36)}`;
}

/**
 * Marker subprotocol used to carry a bearer token on WebSocket upgrades.
 * Browsers can't set Authorization on WS, and URL query params land in CDN
 * access logs, so the token rides as the second value of Sec-WebSocket-Protocol:
 *   Sec-WebSocket-Protocol: chess.bearer.v1, <jwt>
 * The server echoes back only the marker in its 101 response.
 */
export const WS_BEARER_PROTOCOL = "chess.bearer.v1";

export function bearerToken(req: Request): string | null {
  const auth = req.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  const proto = req.headers.get("Sec-WebSocket-Protocol");
  if (proto) {
    const parts = proto.split(",").map((s) => s.trim()).filter(Boolean);
    const idx = parts.indexOf(WS_BEARER_PROTOCOL);
    if (idx >= 0 && idx + 1 < parts.length) return parts[idx + 1] ?? null;
  }
  return null;
}
