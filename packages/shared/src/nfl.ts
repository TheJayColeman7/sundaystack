export const CURRENT_NFL_ABBREVIATIONS = [
  "ARI",
  "ATL",
  "BAL",
  "BUF",
  "CAR",
  "CHI",
  "CIN",
  "CLE",
  "DAL",
  "DEN",
  "DET",
  "GB",
  "HOU",
  "IND",
  "JAX",
  "KC",
  "LAC",
  "LAR",
  "LV",
  "MIA",
  "MIN",
  "NE",
  "NO",
  "NYG",
  "NYJ",
  "PHI",
  "PIT",
  "SEA",
  "SF",
  "TB",
  "TEN",
  "WAS",
] as const;

export type CurrentNflAbbreviation = (typeof CURRENT_NFL_ABBREVIATIONS)[number];

const CURRENT = new Set<string>(CURRENT_NFL_ABBREVIATIONS);

export function isCurrentNflAbbreviation(value: string): value is CurrentNflAbbreviation {
  return CURRENT.has(value);
}
