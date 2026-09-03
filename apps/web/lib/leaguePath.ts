export function leagueEntryPath(league: {
  id: string;
  status: "pre_draft" | "drafting" | "active";
}): string {
  return league.status === "active" ? `/leagues/${league.id}/match` : `/leagues/${league.id}/draft`;
}

export function leagueDraftPath(leagueId: string): string {
  return `/leagues/${leagueId}/draft`;
}

export function leagueMatchPath(leagueId: string): string {
  return `/leagues/${leagueId}/match`;
}

export function leagueTeamPath(leagueId: string, teamId: string): string {
  return `/leagues/${leagueId}/team/${teamId}`;
}

export function leagueHubPath(leagueId: string): string {
  return `/leagues/${leagueId}`;
}

export function myTeamIdForUser(
  teams: { id: string; ownerUserId: string }[],
  userId: string,
): string | null {
  return teams.find((team) => team.ownerUserId === userId)?.id ?? null;
}
