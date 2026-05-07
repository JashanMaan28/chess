# chess.edge — real-time multiplayer chess on the edge

Production-grade multiplayer chess. Frontend on Vercel, all real-time game state on Cloudflare's edge (Workers + Durable Objects + D1).

## Stack

- **Frontend**: Next.js 15 App Router (TypeScript strict), Tailwind v4, shadcn/ui, `react-chessboard`, `chess.js` (UX-only), Clerk auth.
- **Backend**: Cloudflare Workers + Hono router, Durable Objects (`GameRoomDO`, `MatchmakingDO`), D1 + Drizzle ORM, `@clerk/backend` for networkless JWT verification.
- **Shared**: pnpm workspace; `@chess/shared` for protocol + time controls + types.

## Repo layout

```
chess-app/
├── apps/
│   ├── web/        # Next.js (Vercel)
│   └── worker/     # Cloudflare Worker + Durable Objects
└── packages/
    └── shared/     # WebSocket protocol, time controls, types
```

## Local development

```bash
pnpm install

# In apps/worker copy .dev.vars.example → .dev.vars, fill Clerk secrets.
# Create local D1 db and apply migrations:
pnpm --filter @chess/worker exec wrangler d1 create chess   # paste id into wrangler.toml
pnpm --filter @chess/worker db:migrate:local

# Start the Worker (port 8787):
pnpm dev:worker

# In another terminal, copy apps/web/.env.local.example → apps/web/.env.local
# and fill Clerk + worker URLs.
pnpm dev:web
```

Open http://localhost:3000.

## Deployment

- **Web (Vercel)**: connect repo, set root directory to `apps/web`. Add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`.
- **Worker (GitHub Actions)**: push to `main` runs `wrangler d1 migrations apply --remote` and `wrangler deploy`. Set `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` repo secrets.
- Set Clerk secrets on Worker: `wrangler secret put CLERK_SECRET_KEY`, `wrangler secret put CLERK_PUBLISHABLE_KEY`, optional `wrangler secret put CLERK_JWT_KEY`.

## Architecture notes

- **Authority**: All state lives in `GameRoomDO`. Clients send intents over WS; the DO validates with `chess.js` and broadcasts.
- **Clocks**: Server-side. `state.storage.setAlarm()` fires flag-fall and disconnect-abandonment.
- **Hibernation**: WebSockets use `state.acceptWebSocket()` so rooms hibernate cheaply between moves and survive DO eviction.
- **Matchmaking**: Sharded DOs by bucket (`bullet`/`blitz`/`rapid`). Search window widens 50 → 100 → 200 → 500 → any over 20s.
- **Elo**: K=40 (<30 games), K=20 (≥30), K=10 (≥2400). Per-bucket ratings. Atomic D1 batch on game end.
- **Reconnection**: Exponential backoff (250ms → 4s cap). Sends `sync` on every reconnect. DO drops the old socket if the same user reconnects. Disconnect grace: 30s bullet/blitz, 60s rapid.

## Pages

| Path | Purpose |
|---|---|
| `/` | Landing |
| `/play` | Public matchmaking |
| `/play/friend` | Friend invite generator |
| `/g/[code]` | Friend invite landing → spawns game |
| `/game/[id]` | Live game (player or spectator) |
| `/u/[username]` | Profile, ratings, last 10 games |
| `/u/[username]/games` | Paginated, filter by time control |
| `/sign-in`, `/sign-up` | Clerk |

## Acceptance criteria

- Two browsers / two Clerk accounts complete a full game via matchmaking.
- Clock to zero → DO alarm → flag-fall → Elo deltas to D1 → PGN downloadable.
- Killing one player's network → reconnect within grace → state restored via `sync`.
- Third browser opens `/game/[id]` mid-game → spectator events.
- D1 row has correct PGN and Elo before/after.
- Friend invite expires + single-use.
