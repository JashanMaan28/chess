export interface Env {
  DB: D1Database;
  GAME_ROOM: DurableObjectNamespace;
  MATCHMAKING: DurableObjectNamespace;

  CLERK_SECRET_KEY: string;
  CLERK_PUBLISHABLE_KEY: string;
  CLERK_JWT_KEY?: string;

  ALLOWED_ORIGINS: string;
}
