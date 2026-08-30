# Architecture

## Guiding constraints

1. **Logic lives in services, not components.** Every number the UI shows is produced by
   a pure function in `src/domain/` that can be unit-tested without React, a database, or
   a network call.
2. **Raw data / calculated metrics / AI narrative are three separate layers.** They are
   computed separately, stored separately, and rendered with different visual treatment.
3. **External providers are swappable.** No file outside `src/providers/` may issue an
   HTTP request to an external data source.
4. **Secrets are server-only.** ESPN cookies and the Anthropic key are read from
   `process.env` inside server modules marked `import 'server-only'`.

---

## Layer diagram

```
                          ┌──────────────────────────────┐
   Browser                │  Next.js App Router (RSC)    │
                          │  src/app/**                  │
                          │  - dashboard, draft, league  │
                          │  - waivers, trades, playoffs │
                          └──────────────┬───────────────┘
                                         │ server actions / route handlers
                          ┌──────────────▼───────────────┐
                          │  Application services        │
                          │  src/services/**             │
                          │  - leagueState assembly      │
                          │  - persistence + snapshots   │
                          │  - orchestration             │
                          └───────┬──────────────┬───────┘
                                  │              │
             ┌────────────────────▼───┐   ┌──────▼─────────────────────┐
             │  Domain engines        │   │  AI analysis layer         │
             │  src/domain/**         │   │  src/ai/**                 │
             │  PURE, SYNCHRONOUS     │   │  - structured input only   │
             │  - scoring             │   │  - schema-validated output │
             │  - valuation / VOR     │   │  - AIProvider abstraction  │
             │  - tiers               │   │    ├── AnthropicProvider   │
             │  - scarcity (2QB)      │   │    └── DeterministicProvider│
             │  - team needs          │   └────────────────────────────┘
             │  - draft engine        │
             │  - faab engine         │
             │  - trade engine        │
             │  - power rankings      │
             └────────────────────────┘
                                  │
             ┌────────────────────▼─────────────────────────────────┐
             │  Provider layer  src/providers/**                    │
             │  DataProvider                                        │
             │   ├── ESPNProvider          (league, rosters, draft) │
             │   ├── ManualProvider        (CSV / JSON / paste)     │
             │   ├── SampleProvider        (synthetic, labelled)    │
             │   ├── ProjectionProvider    (interface + manual impl)│
             │   ├── InjuryProvider        (interface)              │
             │   └── NewsProvider          (interface)              │
             └────────────────────┬─────────────────────────────────┘
                                  │
                       ┌──────────▼──────────┐
                       │ PostgreSQL / Prisma │
                       └─────────────────────┘
```

Dependency rule: **arrows only point downward.** `src/domain/**` imports nothing from
`src/app`, `src/services`, `src/providers`, or `src/ai`. This is what makes the engines
testable and the metrics traceable.

---

## Directory map

```
fantasy-football/
├── prisma/schema.prisma        # full relational schema
├── src/
│   ├── app/                    # Next.js App Router pages + API routes
│   │   ├── (dashboard)/        # dashboard, my-team, league, players ...
│   │   └── api/                # route handlers (espn connect, ai, import)
│   ├── components/             # presentational React only
│   ├── domain/                 # PURE engines — the actual product
│   │   ├── types.ts            # canonical domain types
│   │   ├── league-config.ts    # league settings + derived counts
│   │   ├── scoring.ts          # stat line -> fantasy points
│   │   ├── valuation.ts        # projections -> league-adjusted value, VOR
│   │   ├── replacement.ts      # replacement level from lineup requirements
│   │   ├── tiers.ts            # gap-based dynamic tiering
│   │   ├── scarcity.ts         # positional scarcity + 2QB engine
│   │   ├── team-needs.ts       # per-team positional need inference
│   │   ├── opponent-model.ts   # next-pick prediction, survival probability
│   │   ├── draft-engine.ts     # dynamic draft value score, recommendations
│   │   ├── squeeze.ts          # pick-squeeze detection
│   │   ├── adp.ts              # ADP vs league value (values / reaches)
│   │   ├── lineup.ts           # optimal lineup solver
│   │   ├── team-grade.ts       # grades, strengths, weaknesses
│   │   ├── power-rankings.ts   # league-wide ranking with explanations
│   │   ├── matchup.ts          # weekly matchup + win probability
│   │   ├── faab.ts             # bid engine + competition model
│   │   ├── trade.ts            # two-sided trade evaluation
│   │   ├── trade-finder.ts     # target finder + motivation model
│   │   ├── playoffs.ts         # playoff schedule analysis
│   │   ├── front-office.ts     # season grading
│   │   └── explain.ts          # metric traceability primitives
│   ├── providers/              # ALL external I/O
│   ├── services/               # orchestration + persistence
│   ├── ai/                     # AI analysis layer
│   └── lib/                    # env, db client, formatting
└── tests/                      # vitest unit tests per engine
```

---

## Core domain model

```ts
LeagueConfig     // teams, scoring, lineup slots, bench, IR, FAAB, draft settings
Player           // id, name, position, nflTeam, byeWeek, status, source, asOf
Projection       // playerId, week|season, points, source, asOf
RosterSlot       // teamId, playerId, slot (starter/bench/IR)
FantasyTeam      // id, name, owner, roster[], faabRemaining, record
DraftState       // picks made, order, currentPick, availablePlayerIds
LeagueState      // LeagueConfig + teams + players + projections + draftState
```

`LeagueState` is the single input to every engine. Engines are
`(LeagueState, params) => Result` — no hidden state, no I/O.

---

## Traceability

Every calculated metric returns an `Explained<T>`:

```ts
interface Explained<T> {
  value: T;
  inputs: Record<string, number | string>;   // exactly what went in
  formula: string;                            // human-readable derivation
  sources: string[];                          // data provenance
}
```

The UI can expand any number to show `formula` and `inputs`. This is why the app can say
"your RB depth is 0.7 points/week above replacement" and prove it.

---

## Valuation model (summary)

1. **Replacement level** is derived from the league, not assumed. For position `p`:
   `replacementRank(p) = teams × (startersAt(p) + flexShare(p) + benchAllowance(p))`.
   In an 8-team 2-QB league that is 16 starting QBs, so QB16 — not QB12 — sets the bar.
2. **VOR** = `projectedPoints(player) − projectedPoints(replacementRank(position))`.
3. **League-adjusted value** normalises VOR to a 0–100 scale across the available pool,
   so values move as the pool drains during a draft.
4. **Roster fit** scores a player against *your* unfilled lineup slots and bye/injury
   exposure.
5. **Dynamic Draft Value Score** =
   `w1·value + w2·scarcity + w3·rosterFit + w4·(1 − expectedAvailability) + w5·opponentDemand`
   with weights that shift by draft round (early rounds weight raw value; middle rounds
   weight scarcity and squeeze risk).

Weights are constants in one place (`draft-engine.ts`) and are covered by tests that
assert behavioural properties (e.g. "in a 2-QB league, QB scarcity outranks equal-value
WR by round 3"), not magic numbers.

---

## AI layer contract

The AI never receives free text about players. It receives:

```json
{ "league": {}, "myTeam": {}, "otherTeams": [], "availablePlayers": [],
  "injuries": [], "projections": [], "draftState": {}, "computedMetrics": {} }
```

and must return objects matching:

```ts
{ recommendation, confidence, reasoning[], dataUsed[], risk, alternative }
```

Output is validated with Zod. Any player name in the response that is not in
`availablePlayers`/rosters causes the response to be discarded and the deterministic
provider's answer to be shown instead, with a note that AI validation failed.

`DeterministicProvider` produces the same shape from the domain engines alone, so the
app works with no API key and every AI claim has a non-AI counterpart to check against.

---

## Persistence and snapshots

Weekly snapshots (`TeamSnapshot`, `PlayerValueSnapshot`) are written on every sync so the
app can answer "how has my team changed over the season?" and grade Front Office
decisions at season end (draft value gained, waiver value gained, trade value gained,
FAAB efficiency, lineup management).

---

## Configuration

All settings live in `LeagueConfig` rows in the database, seeded from a default that
matches the target league (8 teams, 0.5 PPR, 2 QB, FAAB). Nothing about "8" or "2 QB" is
hard-coded in an engine; tests run the engines against 10-team 1-QB PPR leagues too, to
prove it.
