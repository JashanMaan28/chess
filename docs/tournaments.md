# Tournaments — design

This document is the spec for the tournaments feature, deferred from the
initial Gambit launch. Nothing in this file is implemented yet.

## Why deferred

Tournaments touch matchmaking, scheduling, real-time presence, prize handling,
and admin tooling. Building any of those well takes longer than the rest of
the platform combined, and shipping a half-version would set the wrong
expectation. The page currently shows a "Coming soon" placeholder.

## Two formats, in order of build difficulty

### 1. Arena (build first)

Lichess-style. Open-entry, single timer.

- An arena has a **start time**, **duration** (e.g. 30 / 60 / 90 minutes), a
  **time control** (e.g. 3+0), and a **berserk** option.
- Anyone can join before or during the arena.
- Players are auto-paired against the closest-rated opponent who is also
  ready. Pairing happens whenever both sides have just finished their last
  game, not on a fixed round timer.
- **Scoring**: 2 pts for a win, 1 for a draw, 0 for a loss; **streak bonus**
  doubles points for back-to-back wins after the second consecutive win
  (Lichess's "berserk" / streak rules verbatim).
- Final standings = total points; ties broken by performance rating.

This is the right first build because:

1. There are no fixed brackets or byes to track.
2. Pairing reuses the existing `MatchmakingDO` with a tournament-scoped pool.
3. State is small and append-only — points + game results.
4. Drop-outs are harmless (player simply stops being paired).

### 2. Knockout brackets (build later)

Round-based, fixed bracket. Bracket sizes 8 / 16 / 32 / 64.

- Registration window closes at start time. Bracket is seeded by current
  rating, top-vs-bottom.
- Each round has a deadline. If a match isn't started by the deadline, the
  player ahead on the clock advances. Both no-shows = double-bye to the
  highest-seeded continuing player.
- Best-of-N (N=1 default). Tiebreak: 5+0 blitz armageddon (black has draw
  odds, fewer minutes by 30s).

## Schema

New tables. All times in ms epoch.

```sql
CREATE TABLE tournaments (
  id              TEXT PRIMARY KEY,
  kind            TEXT NOT NULL,          -- 'arena' | 'knockout'
  name            TEXT NOT NULL,
  time_control    TEXT NOT NULL,
  initial_ms      INTEGER NOT NULL,
  increment_ms    INTEGER NOT NULL,
  starts_at       INTEGER NOT NULL,
  ends_at         INTEGER,                -- arena only
  bracket_size    INTEGER,                -- knockout only
  status          TEXT NOT NULL,          -- 'scheduled' | 'live' | 'finished' | 'cancelled'
  created_by      TEXT NOT NULL REFERENCES users(clerk_id),
  created_at      INTEGER NOT NULL
);

CREATE TABLE tournament_entries (
  tournament_id   TEXT NOT NULL REFERENCES tournaments(id),
  user_id         TEXT NOT NULL REFERENCES users(clerk_id),
  joined_at       INTEGER NOT NULL,
  seed            INTEGER,                -- knockout only
  withdrew_at     INTEGER,
  PRIMARY KEY (tournament_id, user_id)
);

CREATE TABLE tournament_games (
  tournament_id   TEXT NOT NULL REFERENCES tournaments(id),
  game_id         TEXT NOT NULL REFERENCES games(id),
  round           INTEGER NOT NULL,       -- knockout only; arena = 0
  PRIMARY KEY (tournament_id, game_id)
);

CREATE TABLE tournament_scores (
  tournament_id   TEXT NOT NULL REFERENCES tournaments(id),
  user_id         TEXT NOT NULL REFERENCES users(clerk_id),
  points          INTEGER NOT NULL DEFAULT 0,
  games_played    INTEGER NOT NULL DEFAULT 0,
  current_streak  INTEGER NOT NULL DEFAULT 0,
  performance     INTEGER,                -- computed at end
  PRIMARY KEY (tournament_id, user_id)
);
```

## Runtime layout

A new Durable Object — `TournamentDO` — owns the lifecycle of a single
tournament.

```
TournamentDO
├── state.alarm() — wakes on starts_at, ends_at, and pairing ticks
├── on player join → write to tournament_entries
├── on pairing tick (every 2s while live):
│     - find ready+rested players
│     - pair closest-rated, spawn GameRoomDO with a tournament_id tag
│     - subscribe to that game's end via DO-to-DO RPC
└── on game end webhook from GameRoomDO:
      - update tournament_scores in D1
      - mark player ready
      - broadcast standings to subscribers via WebSocket
```

The arena's pairing pool is a per-tournament DO, not the global
`MatchmakingDO` — sharing the global pool would let non-tournament players get
matched into the tournament accidentally.

## Page surfaces

- `/tournaments` — index of upcoming + live + recent tournaments.
- `/tournaments/[id]` — detail page; standings, live pairings, your status,
  join/withdraw button.
- `/tournaments/new` (admin only initially) — create form.

## Open questions before build

1. **Anti-abuse**: How do we stop a single user creating dozens of public
   tournaments? Probably gate creation behind `gamesPlayed >= 100` or admin
   role.
2. **Stake / entry fee**: Out of scope for MVP. No money.
3. **Time-zone display**: Always render in user-local time. Server stores ms
   epoch only.
4. **Cancellation policy**: If creator deletes tournament after it's live,
   refund any in-progress games' Elo? MVP says no — once live, only admins
   can finish or cancel.
5. **Concurrency limit**: Cap concurrent tournaments per server to keep the
   pairing tick under the free-tier DO budget. Probably 50 simultaneous live
   tournaments to start.

## Build order

1. Schema migration (above).
2. `TournamentDO` skeleton + admin create endpoint, no pairing yet.
3. Arena pairing loop, score updates, standings WebSocket.
4. Index page (`/tournaments`) listing live + upcoming.
5. Detail page with live standings.
6. Knockout bracket variant (separate `kind`, separate pairing strategy).
7. Public tournament creation, gated by `gamesPlayed >= 100`.

Estimate: 3–4 focused weeks for arena MVP, another 2 for knockout. Roll out
behind a feature flag and only show the `/tournaments` link in the header
once arena is live.
