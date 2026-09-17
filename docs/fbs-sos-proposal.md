# FBS Strength of Schedule — proposal (2026-09-17)

Status: **BUILT 2026-09-17** (uncommitted): `src/lib/fbs/sos.ts`, `GET /api/fbs/sos`,
`src/components/FbsSosPanel.tsx`, `?view=sos` tab in `FbsRatingsView` (shows on /fbs and
/admin/fbs-ratings). Rank metric = median-team win % (expected wins / rated games) so 12- and
13-game slates and the conference-only toggle compare fairly. Default sort = avg-team record;
avg opponent and remaining-only sorts are one click away.

## Ask

Add an SOS area to the FBS admin section (`/admin/fbs-ratings`) that ranks every
team's strength of schedule and lets you pull up one conference to see its SOS.

## Why "sum of opponent power ratings" skews

- **Game count.** 12 games vs 13 (or an early bye) changes the total for no
  reason. Averaging fixes that.
- **Venue.** Ohio State at home is a different schedule than Ohio State in
  Columbus. A raw rating ignores the per-team HFA we already store.
- **Linear scale.** One rating point vs a +30 team and vs a -10 team count the
  same, but the second barely changes the odds of losing. Sagarin and Massey
  both moved off raw averages for this reason.

## Recommended method: expected wins for an average team

For each game on a team's schedule, use the existing spread projection
(`projectFbsSpread` = rating gap + venue HFA, FCS opponents bridged with
`FCS_TO_FBS_OFFSET_FALLBACK`) to get the probability that a **median FBS team**
would win that game (`normalCdf(-spread / 13.5)`, same sigma as futures). Sum
them. A schedule an average team goes 4-8 against is brutal; 9-3 is soft.
Massey and Torvik use this. It is on our existing scale and needs no new
inputs.

Show three numbers per team:

| Column | Meaning |
|---|---|
| **SOS rank** | by expected wins for an average team; low = hardest |
| **Avg opponent rating** | venue-adjusted; the simple view Tyler first described |
| **Remaining SOS** | same calc on unplayed games only; what matters for futures |

Plus played / remaining game counts.

## Layout

- New tab `?view=sos` next to Futures on `/admin/fbs-ratings`.
- Ranked table of all FBS teams with the columns above.
- Conference dropdown filters the table; header shows the conference's average
  SOS.
- Click a team to expand its game-by-game list: opponent, opponent rating,
  venue, average-team win probability.
- "Conference games only" toggle to compare conference slates apart from
  non-conference scheduling.

## Cost / plumbing

- `src/lib/fbs/sos.ts` — reuse `fetchFbsSeasonSchedule` (ESPN weeks 1–15,
  already cached 5 min) + `projectFbsSpread` / `hfaForGame` from
  `src/lib/fbs/engine.ts` + `normalCdf` from `src/lib/fbs/futures.ts`.
- `GET /api/fbs/sos` — 5-minute in-process cache, `?fresh=1` like futures.
- `FbsSosPanel.tsx` in `src/app/admin/fbs-ratings/`.
- Display + math only; no schema or sync changes.

## Open choice

Default sort = expected wins (recommended) **or** plain average opponent
rating with expected wins as the secondary column. Tyler to pick.
