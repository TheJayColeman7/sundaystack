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

export function leaguePlayersPath(leagueId: string): string {
  return `/leagues/${leagueId}/players`;
}

export function leagueTradesPath(leagueId: string, withTeamId?: string): string {
  const base = `/leagues/${leagueId}/trades`;
  return withTeamId ? `${base}?with=${withTeamId}` : base;
}

export function leagueWaiversPath(leagueId: string): string {
  return `/leagues/${leagueId}/waivers`;
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
