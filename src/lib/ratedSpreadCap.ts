// src/lib/ratedSpreadCap.ts
//
// Ledger rule (Tyler, 2026-09-07): closing lines beyond ±35 points do not
// re-rate anyone. Whether a team closes a 35- or a 40-point favorite says
// nothing useful about its strength — books stop pricing those games with
// any care and the -/+ swings were moving ratings by 2-11 points off single
// buy games (Chicago State @ UT Martin closed -44.5 vs a -66.4 projection).
// Applies to BOTH the FBS and FCS engines and to the ledger replay, so a
// Recalculate All strips the effect of earlier over-cap games. The game is
// still written to the ledger with adjustment 0 (so it is not retried) and
// does not count toward games_processed.

export const MAX_RATED_SPREAD = 35;

export function exceedsRatedSpreadCap(closingSpread: number): boolean {
  return Math.abs(closingSpread) > MAX_RATED_SPREAD;
}
