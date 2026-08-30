# Deployment

The app is a standard Next.js 16 server application. It needs a Node runtime — it is not
a static site, because rosters, projections and every recommendation are computed
server-side and the ESPN cookies must never reach the browser.

Two supported paths: **Vercel** (simplest) and **any container host** (Fly, Railway,
Render, Cloud Run, your own box).

---

## Quickest path: a sample-data demo (no credentials)

Deploy with **no environment variables at all**. The app boots on the labelled synthetic
sample league: every screen is populated, nothing real is exposed, and no password is
needed because there is nothing to protect.

Verified with zero environment variables set: all eleven pages and the analysis API return
200, the "Synthetic sample data" banner renders, the ESPN page reports "Not configured",
and no credential values appear anywhere in the served HTML.

1. Go to <https://vercel.com/new> and import `stephenjanicki23/rellax`.
2. Select branch `claude/fantasy-football-ai-manager-bbqnyx`.
3. Set **Root Directory** to `fantasy-football`. (This is the step people miss — without
   it the build fails, because the repository root is an unrelated JS library.)
4. Skip environment variables entirely. Deploy.

That gives you a shareable URL in a couple of minutes. `vercel.json` marks it `noindex`,
so it will not turn up in search results.

When you later want it pointed at your real league, add the variables from the table below
— including `DASHBOARD_PASSWORD`, which becomes mandatory the moment ESPN cookies are
present.

> A one-click deploy button (`https://vercel.com/new/clone?repository-url=…`) would
> normally go here. `vercel.com` is unreachable from the environment this was built in, so
> the exact parameter format could not be confirmed — the four steps above are the path
> that is certain to work.

---

## Before you deploy: the password gate

This app has no user accounts yet. A deployed instance holds your ESPN session cookies
server-side, so anyone who found the URL could read your league. `src/middleware.ts`
enforces this rather than trusting you to remember:

| `DASHBOARD_PASSWORD` | `ESPN_S2` / `ESPN_SWID` | Behaviour |
| --- | --- | --- |
| not set | not set | Open. This is local development against sample data. |
| not set | **set** | **Refuses to serve (503)** and explains why. |
| set | either | HTTP Basic auth on every page and API route. |

So: **set `DASHBOARD_PASSWORD` on any deployment that has ESPN credentials.** Any username
works at the prompt; the password is the secret.

Replace this with real authentication when accounts land (PROJECT_PLAN.md, phase 7).

---

## Option A — Vercel

The app lives in a subdirectory, so the root directory must be set.

**Dashboard**
1. New Project → import `stephenjanicki23/rellax`.
2. Set **Root Directory** to `fantasy-football`. Framework auto-detects as Next.js.
3. Add environment variables (below) under Settings → Environment Variables.
4. Deploy.

**CLI**
```bash
cd fantasy-football
npx vercel link          # choose the project; set root directory to this folder
npx vercel env add DASHBOARD_PASSWORD production
npx vercel env add ESPN_LEAGUE_ID production
npx vercel env add ESPN_SEASON production
npx vercel env add ESPN_S2 production
npx vercel env add ESPN_SWID production
npx vercel env add ANTHROPIC_API_KEY production   # optional
npx vercel --prod
```

`vercel.json` already sets `X-Robots-Tag: noindex`, `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff` and a restrictive `Permissions-Policy`, so the
deployment will not be indexed or framed.

---

## Option B — Container

`next.config.ts` sets `output: 'standalone'`, so the runtime image carries a
self-contained server bundle rather than the whole `node_modules` tree.

```bash
cd fantasy-football
docker build -t ffo:latest .

docker run --rm -p 3000:3000 \
  -e DASHBOARD_PASSWORD='choose-something-long' \
  -e ESPN_LEAGUE_ID=123456 \
  -e ESPN_SEASON=2026 \
  -e ESPN_S2='...' \
  -e ESPN_SWID='{...}' \
  -e ANTHROPIC_API_KEY='...' \
  ffo:latest
```

The image runs as a non-root user and bakes in no credentials — everything is supplied at
runtime. It works unchanged on Fly (`fly launch --dockerfile Dockerfile`), Railway,
Render, or Cloud Run.

To run the standalone bundle without Docker:

```bash
npm ci && npm run build
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
cd .next/standalone && PORT=3000 node server.js
```

---

## Environment variables

All server-side. None is exposed to the browser; there is no `NEXT_PUBLIC_*` secret.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DASHBOARD_PASSWORD` | For any deploy with ESPN credentials | HTTP Basic password gate |
| `ESPN_LEAGUE_ID` | For real data | Your league id |
| `ESPN_SEASON` | For real data | e.g. `2026` |
| `ESPN_S2`, `ESPN_SWID` | Private leagues | Session cookies — see ESPN_INTEGRATION.md |
| `ESPN_TEAM_ID` | Optional | Which ESPN team is yours |
| `ANTHROPIC_API_KEY` | Optional | Narrative AI analysis; without it the deterministic engine analysis is used |
| `ANTHROPIC_MODEL` | Optional | Defaults to `claude-sonnet-5` |
| `LEAGUE_PROVIDER` | Optional | `espn` \| `manual` \| `sample`. Defaults to `espn` when a league id is present, else `sample` |
| `DATABASE_URL` | Optional | PostgreSQL. Not yet required — persistence is phase 7 |

With none of these set the app boots on the labelled synthetic sample league, which is a
safe way to share a demo link: there are no real credentials and no real player data.

---

## Notes

- **ESPN cookies expire** (roughly annually, sooner if you log out everywhere). The app
  surfaces `AUTH_EXPIRED` rather than silently showing empty rosters — refresh the cookies
  and redeploy the env var when that happens.
- **No database is required** for the app to run. Every screen recomputes from the
  provider on request. Historical tracking and Front Office grading need `DATABASE_URL`,
  and that wiring is not built yet.
- **Cold starts**: pages are `force-dynamic` because every number depends on live roster
  state. On Vercel's serverless functions expect a second or two on a cold path.
