# Fantasy Football Front Office — Project Plan

An AI-assisted fantasy football draft assistant and in-season team manager, built for a
specific ESPN league (8 teams, 0.5 PPR, 2-QB, FAAB waivers) but configurable for any
league shape.

The product question this app exists to answer is **"Given the current state of my
league, what should I do next?"** — not "who are the top 200 players".

---

## 0. Repository inspection (done before any code was written)

| Question | Finding |
| --- | --- |
| Does an application already exist? | **No.** |
| What is in this repository? | [`rellax`](https://github.com/dixonandmoe/rellax) v1.1.0 — a ~230 line vanilla-JS parallax library (`rellax.js`, `rellax.min.js`, `demo.html`, `css/`, `tests/*.html` browser fixtures). |
| Current tech stack | None relevant. No build tooling, no package dependencies, `npm test` is a stub that exits 1. |
| Conflict risk | The root `package.json` is the published `rellax` npm package manifest. Adding a Next.js app at the repository root would overwrite it. |

**Decision:** the application lives in **`fantasy-football/`**, a self-contained
workspace. Nothing in the existing `rellax` library is modified, moved, or deleted. The
root `package.json`, `rellax.js`, `rellax.min.js`, `demo.html`, `css/`, and `tests/`
are left exactly as they were.

---

## 1. Scope of the current delivery

This plan is phased deliberately (per the brief: *do not attempt to build the entire
application in one giant implementation*). What is built today versus what is scheduled
is tracked honestly below — nothing is described as complete unless it runs and is
tested.

### Delivered in this pass

**Phase 1 — Foundation**
- Project scaffolding (Next.js 16 App Router, TypeScript, Tailwind v4, Vitest).
- Full Prisma/PostgreSQL schema for every entity in the brief, including historical
  snapshots.
- League configuration domain model: teams, scoring, starting lineup, bench, IR, QB
  requirements, flex, K/DST, waiver rules, FAAB budget, draft type/position/rounds —
  all configurable, none hard-coded.
- Roster / player / team domain model and league state assembly.
- Dashboard with team grades, projections, strengths/weaknesses.

**Phase 2 — Draft intelligence**
- League-adjusted player valuation (VOR against a lineup-derived replacement level).
- Dynamic tiering (gap-based clustering, not fixed rank buckets).
- Positional scarcity model, including a dedicated **2-QB scarcity engine**.
- Team-needs inference for all 8 teams.
- Opponent next-pick prediction (probability by position).
- Pick-squeeze detection and survival probability to your next pick.
- Dynamic Draft Value Score and the "Who should I draft?" engine.
- ADP vs. league value (values and reaches).

**Phase 3 — ESPN integration (provider layer)**
- `DataProvider` abstraction with swappable implementations.
- Server-side ESPN provider hitting the real v3 endpoints, with `espn_s2` / `SWID`
  cookie auth for private leagues. Credentials never leave the server.
- Manual CSV / JSON / paste import fallback so the app is fully usable with no ESPN
  connection at all.

**Phase 4 — Waivers and trades**
- FAAB bid engine (bid, range, aggressive number, competition model, budget pacing).
- Trade analyzer (two-sided, lineup-impact aware).
- Trade target finder and partner-motivation model.

**Phase 5 — Weekly management**
- Weekly "What should I do?" report, lineup optimizer, matchup analyzer, playoff
  (weeks 14–17, configurable) analyzer.

**Phase 6 — AI + history**
- AI analysis layer over structured data only, with confidence / reasoning / data-used /
  risk / alternative on every recommendation.
- Historical power tracking and Front Office grading.

### Explicitly *not* delivered yet

These are designed for and stubbed at the interface level, but not implemented:

- **Authentication.** The app currently assumes a single local operator. `User` exists
  in the schema; wiring an auth provider is the next infrastructure task.
- **Live ESPN write operations** (submitting waiver claims, setting lineups). ESPN
  exposes no supported write API; see `ESPN_INTEGRATION.md`.
- **A bundled projection source.** The app ships with *no* real player projections,
  because inventing them would violate the correctness rules in the brief. It ships a
  clearly-labelled synthetic sample league for development and tests, and a documented
  import path for real projections. See "Data honesty" below.
- **Live news / weather feeds.** `NewsProvider` and weather inputs to the playoff
  analyzer are interfaces with no production implementation.

---

## 2. Data honesty rules

These are enforced in code, not just documented:

1. Every player, projection, and stat carries a `source` and `asOf` timestamp.
2. `source: 'synthetic-sample'` renders a persistent banner in the UI and is excluded
   from any export.
3. The AI layer receives structured data only and is instructed that it may not
   introduce a player, number, or injury that is not in its input. Responses are
   schema-validated; a response naming an unknown player is rejected, not displayed.
4. Missing data renders as `Data unavailable — last updated: <timestamp>`, never as a
   zero or a guess.
5. Raw data, calculated metrics, and AI narrative are stored and displayed separately.
   Every calculated metric exposes its inputs (`explain()` traces).

---

## 3. Phase schedule

| Phase | Contents | State |
| --- | --- | --- |
| 1 | Scaffolding, DB, league config, teams, players, rosters, dashboard | Delivered |
| 2 | Draft assistant, dynamic values, scarcity, opponent needs, recommendations | Delivered |
| 3 | ESPN provider, manual import, transactions, matchups | Provider delivered; auto-sync scheduling pending |
| 4 | FAAB engine, trade analyzer, trade target finder | Delivered |
| 5 | Weekly lineup management, matchup analysis, playoff analysis | Delivered |
| 6 | AI recommendations, historical analysis, Front Office grading | Delivered (AI needs `ANTHROPIC_API_KEY`; falls back to deterministic reasoning without one) |
| 7 | Auth, background sync jobs, real projection provider integration | Next |

---

## 4. Success criteria

The app is doing its job when it can answer, with a traceable reason, each of:

- During the draft — "Who should I pick and why?"
- Before my pick — "What are the other teams likely to do?"
- During the season — "What should I do to improve my roster?"
- Before waivers — "Who should I bid on and how much?"
- Before trades — "Who should I target and what can I realistically offer?"
- Before lineups lock — "Who should I start?"
- Before the playoffs — "What moves give me the best chance to win?"

Each answer must name *this* league's constraints (8 teams, 2 QB, 0.5 PPR, FAAB) rather
than generic fantasy advice.

---

## 5. Getting started

```bash
cd fantasy-football
npm install
cp .env.example .env        # fill in DATABASE_URL, ANTHROPIC_API_KEY, ESPN cookies
npm run db:generate
npm run dev
```

Tests: `npm test`. Typecheck: `npm run typecheck`. See `fantasy-football/README.md`.
