# Fantasy Football Front Office

An AI-assisted fantasy football draft assistant and in-season team manager, built for an
8-team, 0.5-PPR, 2-QB ESPN league — and configurable for any league shape.

It exists to answer one question: **"Given the current state of my league, what should I
do next?"** It is not a rankings site.

> **Repository note.** This app lives in `fantasy-football/` inside a repository that also
> contains the unrelated [`rellax`](https://github.com/dixonandmoe/rellax) parallax
> library. Nothing in that library is modified by this project.

Design documents live at the repository root:
[PROJECT_PLAN.md](../PROJECT_PLAN.md) ·
[ARCHITECTURE.md](../ARCHITECTURE.md) ·
[ESPN_INTEGRATION.md](../ESPN_INTEGRATION.md)

---

## Quick start

```bash
npm install
cp .env.example .env      # optional — the app runs without any of it
npm run dev               # http://localhost:3000
```

With no configuration at all the app runs on a **clearly-labelled synthetic sample
league** so you can explore every screen. Real data comes from ESPN or a manual import.

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:generate` / `db:push` / `db:migrate` | Prisma |

---

## What it does

**Draft**
- Dynamic Draft Value Score — value, positional scarcity, roster fit, the chance a player
  survives to your next pick, and how badly the teams picking in between want his
  position. It is explicitly *not* "the highest-ranked player available".
- A dedicated 2-QB scarcity engine. In an 8-team 2-QB league 16 QBs start every week, so
  replacement level is QB17-ish rather than QB9 — every downstream number inherits that.
- Opponent next-pick prediction, pick-squeeze detection, dynamic tiers, ADP vs. this
  league's value (values and reaches).

**Season**
- Weekly "what should I do?" report: lineup changes, waiver claims, trade offers.
- FAAB bid engine — a bid is a function of what a player is worth *to your roster*, your
  remaining budget, weeks left to spend it, and which rivals have both the need and the
  money.
- Two-sided trade analyzer that measures the change in each side's *optimal starting
  lineup*, and a trade finder that only surfaces offers both managers would accept.
- Matchup analysis, playoff schedule analysis, power rankings, season simulation.

---

## How it is put together

```
src/domain/      Pure engines. No I/O, no React, no Prisma. Every metric is traceable.
src/providers/   ALL external I/O — ESPN, manual import, sample data.
src/services/    Assembles LeagueState from providers.
src/ai/          Structured-input AI layer with schema + reference validation.
src/app/         Next.js App Router pages and route handlers.
```

Dependency arrows only point downward. `src/domain/**` imports nothing from the layers
above it, which is what makes 177 unit tests possible without a database or a network.

### Traceability

Every calculated number carries its derivation and can be expanded in the UI:

```ts
interface Explained<T> {
  value: T;
  inputs: Record<string, number | string | boolean>;
  formula: string;   // "VOR = 312.4 - 248.1 (QB19)"
  sources: string[]; // ["projections:espn", "league-config"]
}
```

---

## Data honesty

These rules are enforced in code, not just documented:

1. Every player, projection and stat carries a `source` and `asOf`.
2. Sample data is tagged `synthetic-sample` and renders a persistent banner. Player names
   are deliberately obviously fake ("QB One") so no output can be mistaken for advice
   about a real player.
3. Missing data renders as **Data unavailable** with a timestamp — never as a zero.
4. The AI receives structured data only and may not introduce a player, number or injury
   that is not in its input. Responses are schema- **and** reference-validated; one naming
   an unknown player is discarded and the deterministic answer is shown instead.
5. Raw data, calculated metrics and AI narrative are stored and displayed separately.

The app ships with **no real projections**. Import them, or connect ESPN.

---

## Configuration

All server-side; nothing is exposed to the browser. See `.env.example`.

| Variable | Purpose |
| --- | --- |
| `DASHBOARD_PASSWORD` | Password gate. Required on any deploy carrying ESPN cookies |
| `DATABASE_URL` | PostgreSQL, for persistence and history |
| `ANTHROPIC_API_KEY` | Optional. Without it the deterministic engine analysis is used |
| `ESPN_LEAGUE_ID`, `ESPN_SEASON` | Your league |
| `ESPN_S2`, `ESPN_SWID` | Private leagues only — see ESPN_INTEGRATION.md |
| `LEAGUE_PROVIDER` | `espn` \| `manual` \| `sample` |

The ESPN client is a `server-only` module, so importing it into a client component is a
build error — the cookies cannot reach the browser.

---

## Deploying

See [DEPLOYMENT.md](./DEPLOYMENT.md) — Vercel or the included `Dockerfile`.

For a shareable demo, deploy with **no environment variables**: the app runs on the
labelled synthetic sample league, so there is nothing real to expose. Import the repo at
<https://vercel.com/new>, pick this branch, and set **Root Directory** to
`fantasy-football` — the repository root is an unrelated JS library, so the build fails
without it.

There are no user accounts yet, so `src/middleware.ts` enforces a password gate: with
ESPN credentials configured and no `DASHBOARD_PASSWORD`, the app refuses to serve rather
than exposing your league to anyone with the URL.

## Known limits

- **ESPN has no supported write API.** The app recommends; you execute in ESPN.
- **No live draft websocket.** Draft results are polled, and manual pick entry always works.
- **No bundled projections or ADP.** Import them; inventing them would be worse than
  having none.
- **Auth and persistence are not wired up yet.** The schema exists; see PROJECT_PLAN.md
  for exactly what is and is not built.
