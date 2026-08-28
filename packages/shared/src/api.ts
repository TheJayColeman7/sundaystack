export interface PlayerListTeam {
  id: string;
  abbreviation: string;
  name: string;
}

export interface PlayerListItem {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  position: string;
  jerseyNumber: number | null;
  status: string | null;
  headshotUrl: string | null;
  team: PlayerListTeam | null;
}

export interface PlayerListQuery {
  search?: string;
  team?: string;
  position?: string;
  limit: number;
  offset: number;
}

export interface PlayerListResponse {
  data: PlayerListItem[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}

export interface PlayerRecentGame {
  week: number;
  seasonYear: number;
  opponentAbbreviation: string | null;
  passingYards: number;
  rushingYards: number;
  receivingYards: number;
  receptions: number;
  passingTds: number;
  rushingTds: number;
  receivingTds: number;
}

export interface PlayerProfile extends PlayerListItem {
  recentGames: PlayerRecentGame[];
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

export interface LeagueSettingsDto {
  qb: number;
  rb: number;
  wr: number;
  te: number;
  flex: number;
  superflex: number;
  k: number;
  def: number;
  bench: number;
  ir: number;
}

export interface ScoringRuleDto {
  statKey: string;
  pointsPer: number;
}

export interface LeagueMemberDto {
  userId: string;
  displayName: string | null;
  role: "commissioner" | "member";
}

export interface FantasyTeamSummaryDto {
  id: string;
  leagueId: string;
  name: string;
  ownerUserId: string;
  ownerDisplayName: string | null;
}

export interface LeagueSummaryDto {
  id: string;
  name: string;
  status: "pre_draft" | "active";
  inviteCode: string;
  maxTeams: number;
  seasonYear: number;
  teamCount: number;
  myTeamId: string | null;
  role: "commissioner" | "member";
}

export interface LeagueDetailDto {
  id: string;
  name: string;
  status: "pre_draft" | "active";
  inviteCode: string;
  maxTeams: number;
  seasonYear: number;
  commissionerUserId: string;
  members: LeagueMemberDto[];
  teams: FantasyTeamSummaryDto[];
  settings: LeagueSettingsDto;
  scoring: ScoringRuleDto[];
}

export interface RosterPlayerDto {
  id: string;
  playerId: string;
  slot: string;
  displayName: string;
  position: string;
  status: string | null;
  teamAbbreviation: string | null;
}

export interface RosterDto {
  team: FantasyTeamSummaryDto;
  players: RosterPlayerDto[];
}
