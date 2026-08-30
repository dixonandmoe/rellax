# ESPN Fantasy Football Integration

**Read this before assuming anything works.** ESPN publishes **no documented, supported
public API** for fantasy football. What exists is the private JSON API that
`fantasy.espn.com` itself calls from the browser. It is usable, it is what every
open-source client uses, and it can change or break without notice.

Everything below was verified against current public documentation of the v3 API
(August 2026). Where something is uncertain, it says so.

---

## 1. Base endpoints

**Current season (2018 onward):**

```
https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{season}/segments/0/leagues/{leagueId}
```

`lm-api-reads.fantasy.espn.com` is the read host ESPN's own site moved to; the older
`fantasy.espn.com/apis/v3/...` host still resolves for many requests but the read host is
the one to prefer.

**Historical seasons (pre-2018 / archived):**

```
https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/leagueHistory/{leagueId}?seasonId={season}
```

**Player universe (not league-scoped):**

```
https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{season}/players?view=players_wl
```

**Pro schedule / NFL games:**

```
https://site.web.api.espn.com/apis/fantasy/v2/games/ffl/games?dates=YYYYMMDD
```

---

## 2. The `view` parameter

The league endpoint returns almost nothing on its own. You request *views*, and you can
request several at once (`?view=mTeam&view=mRoster&view=mSettings`).

| View | Returns |
| --- | --- |
| `mSettings` | League name, size, scoring rules, roster slot counts, waiver type, FAAB budget, draft settings, playoff weeks |
| `mTeam` | Teams, owners, records, points for/against, **FAAB spent / remaining** (`transactionCounter.acquisitionBudgetSpent`) |
| `mRoster` | Full rosters, lineup slot per player, acquisition type |
| `mMatchup` | Schedule and matchup results for the season |
| `mMatchupScore` | Matchup scores by scoring period |
| `mBoxscore` | Per-matchup player-level scoring |
| `mLiveScoring` | In-progress week scoring |
| `mStandings` | Standings, streaks, tiebreakers |
| `mDraftDetail` | Complete draft results: pick number, round, team, player, keeper flag |
| `mTransactions2` / `mPendingTransactions` | Transaction log: adds, drops, trades, **waiver bid amounts** |
| `kona_player_info` | Player pool with ESPN projections, ownership %, injury status |
| `players_wl` | Lightweight player list (id ↔ name ↔ position) |

⚠️ Requesting views in combination can return *different* payloads than requesting them
separately. The provider in this repo requests them in the combinations it has verified,
and does not assume a field exists because it appeared in another combination.

---

## 3. `X-Fantasy-Filter`

Player queries are capped at ~50 results unless you send a filter header:

```
X-Fantasy-Filter: {"players":{"limit":2000,"filterStatus":{"value":["FREEAGENT","WAIVERS"]},
                   "sortPercOwned":{"sortAsc":false,"sortPriority":1}}}
```

This is how free agents / waiver-wire players are retrieved, and how the pool is sorted
by ownership. The header value must be compact JSON.

---

## 4. Authentication

| League type | Requirement |
| --- | --- |
| Public league | No auth. Anonymous GET works. |
| Private league | Two cookies: **`espn_s2`** and **`SWID`** |

Getting the cookies: log in at `espn.com`, open DevTools → Application → Cookies →
`https://www.espn.com`, copy the `espn_s2` value (long URL-encoded string) and the `SWID`
value (a GUID **including** the surrounding braces, e.g. `{ABC1-...}`).

They are sent as a `Cookie` header:

```
Cookie: espn_s2=<value>; SWID={<guid>}
```

**Security requirements enforced in this app:**

- Cookies are read from server-side environment variables only (`ESPN_S2`, `ESPN_SWID`).
- They are never sent to the browser, never embedded in a client component, never placed
  in a URL, and never logged. `src/providers/espn/client.ts` is marked `import
  'server-only'`, which makes bundling it into client code a build error.
- The ESPN Connection page posts credentials to a server route; the page only ever
  displays a masked fingerprint (last 4 characters) and a connection status.
- Cookies expire (roughly a year, sooner if you log out everywhere). The app surfaces a
  `AUTH_EXPIRED` status rather than silently returning empty rosters.

---

## 5. What this app can retrieve

| Data | Endpoint / view | Status |
| --- | --- | --- |
| League settings (size, scoring, lineup, FAAB budget, playoffs) | `mSettings` | ✅ Reliable |
| Teams and owners | `mTeam` | ✅ Reliable |
| Rosters with lineup slots | `mRoster` | ✅ Reliable |
| Draft results | `mDraftDetail` | ✅ Reliable (after the draft; live-draft polling is best-effort, see below) |
| Matchups and scores | `mMatchup`, `mMatchupScore`, `mBoxscore` | ✅ Reliable |
| Standings | `mStandings` | ✅ Reliable |
| Transactions incl. waiver bids | `mTransactions2` | ✅ Reliable, shape varies by transaction type |
| FAAB remaining per team | `mTeam` → `transactionCounter.acquisitionBudgetSpent` | ✅ Reliable (derive remaining = budget − spent) |
| Free agents / waiver pool | `kona_player_info` + `X-Fantasy-Filter` | ✅ Works; large payload, must be paged/limited |
| ESPN's own projections | `kona_player_info` → `stats[]` where `statSourceId === 1` | ⚠️ Available but see §6 |
| Injury status | `kona_player_info` → `injuryStatus` | ⚠️ Coarse (ACTIVE/QUESTIONABLE/OUT/IR), no practice detail |
| NFL pro schedule | `site.web.api.espn.com/.../games` | ✅ Reliable |

### What it cannot do

| Not available | Why |
| --- | --- |
| **Any write operation** — submit a waiver claim, set a lineup, propose a trade | ESPN exposes no supported write API. Attempting to reverse-engineer the write endpoints would mean automating actions against ESPN's servers with your credentials; this app deliberately does not do it. The app produces the recommendation; you execute it in ESPN. |
| **Live draft feed** | The draft room uses a websocket protocol that is not documented and not stable. `mDraftDetail` polling (every few seconds) is the supported approach here, and the Draft Assistant also accepts fully manual pick entry so it never depends on it. |
| **ADP** | Not exposed as a first-class field. ESPN's `averageDraftPosition` appears inside some `kona_player_info` payloads but is not consistently present. The app treats ADP as an **imported** dataset with its own provider. |
| **Historical data for old leagues** | ESPN has deleted data for some older seasons. `leagueHistory` may return 404 or partial payloads. |
| **Rate limits / SLA** | Undocumented. The client uses conservative caching and backoff (see §7) because there is no published quota to design against. |
| **Weather, snap counts, target share, red-zone usage** | Not in the fantasy API at all. These are separate provider interfaces (`PlayerStatsProvider`, `NewsProvider`) with no bundled implementation. |

---

## 6. On ESPN's projections

`kona_player_info` returns `stats[]` entries distinguished by:

- `statSourceId`: `0` = actual, `1` = projected
- `statSplitTypeId`: `0` = season, `1` = week
- `scoringPeriodId`: the week (`0` = full season)

So a season projection is `statSourceId === 1 && scoringPeriodId === 0`, and a week-6
projection is `statSourceId === 1 && scoringPeriodId === 6`.

Two caveats the app handles explicitly:

1. The values are **stat lines**, not points, and points must be recomputed against
   *your* league's scoring — ESPN's `appliedTotal` reflects ESPN's own scoring config,
   which for a 0.5-PPR league you should verify rather than trust. The app recomputes
   points from raw stats via `src/domain/scoring.ts` and shows both numbers when they
   disagree by more than 2%.
2. ESPN projections are widely regarded as weak relative to consensus sources. The app
   supports multiple projection sources ranked by preference in settings; ESPN is the
   fallback, not the default, when another source is configured.

**The app ships with no projection data.** If nothing is connected or imported, the
projection-dependent screens render `Data unavailable`, not zeros.

---

## 7. Client behaviour in this app

- **Caching:** league-shaped data (settings, teams) cached 10 minutes; roster/FA data 60
  seconds during a draft, 5 minutes otherwise. Cache is in-process and keyed by
  `season:leagueId:view`.
- **Backoff:** 429/5xx retried up to 3 times with exponential backoff (1s, 2s, 4s) and
  jitter. A 401 is **not** retried — it means `AUTH_EXPIRED`.
- **Status model:** every fetch returns `{ ok, data, source: 'espn', asOf, status }`
  where `status ∈ CONNECTED | AUTH_EXPIRED | NOT_FOUND | RATE_LIMITED | UPSTREAM_ERROR |
  NOT_CONFIGURED`. The UI renders the status; it never renders an empty roster as if the
  team had no players.
- **Schema tolerance:** responses are parsed through Zod schemas that mark unknown fields
  as passthrough and required fields narrowly, so an ESPN field addition does not break
  the app, but a field *removal* fails loudly with a named error instead of silently
  producing `undefined`.

---

## 8. Configuration

```bash
# .env  (server-side only — never NEXT_PUBLIC_*)
ESPN_LEAGUE_ID=123456
ESPN_SEASON=2026
ESPN_S2=AEB...long-url-encoded-value...
ESPN_SWID={XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}
```

Or configure at runtime on the **ESPN Connection** page, which stores them server-side
(encrypted at rest via `ESPN_CREDENTIAL_KEY`) and reports connection status.

Verify a connection:

```bash
curl -s 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026/segments/0/leagues/<ID>?view=mSettings' \
  -H 'Cookie: espn_s2=<ESPN_S2>; SWID={<SWID>}' | head -c 400
```

A private league without cookies returns `401`; a wrong league id returns `404`.

---

## 9. Swapping ESPN out

`ESPNProvider` implements the `LeagueProvider` interface in
`src/providers/types.ts`. Nothing outside `src/providers/espn/` knows ESPN exists. To
support Sleeper/Yahoo, or to run fully manually, implement the same interface and
register it in `src/providers/registry.ts` — no engine, page, or service changes.

If ESPN breaks mid-season, the app degrades to `ManualProvider` (CSV/JSON/paste import)
with no loss of analytical capability.
