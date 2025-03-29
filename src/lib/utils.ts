// src/lib/utils.ts
export function formatOdds(odds: number): string {
  if (odds >= 0) {
    return `+${odds}`;
  } else {
    return odds.toString();
  }
}