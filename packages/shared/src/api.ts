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
  regularSeasonWeeks: number;
  waiverType: "priority" | "faab";
  faabBudget: number;
  waiverProcessWeekday: number;
  waiverProcessHourUtc: number;
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
  status: "pre_draft" | "drafting" | "active";
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
  status: "pre_draft" | "drafting" | "active";
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

export type DraftStatus = "lobby" | "live" | "complete";
export type DraftPickSource = "manual" | "queue" | "autopick" | "passed_full";

export interface DraftOrderSlotDto {
  slot: number;
  fantasyTeamId: string;
  teamName: string;
  ownerUserId: string;
  ownerDisplayName: string | null;
}

export interface DraftPickDto {
  pickNumber: number;
  fantasyTeamId: string;
  playerId: string | null;
  playerDisplayName: string | null;
  playerPosition: string | null;
  source: DraftPickSource;
  pickedAt: string | null;
}

export interface DraftQueueItemDto {
  playerId: string;
  rank: number;
  displayName: string;
  position: string;
  teamAbbreviation: string | null;
}

export interface DraftStateDto {
  id: string;
  leagueId: string;
  status: DraftStatus;
  secondsPerPick: number;
  currentPickNumber: number;
  currentPickStartedAt: string | null;
  secondsRemaining: number | null;
  totalPicks: number;
  onTheClockTeamId: string | null;
  order: DraftOrderSlotDto[];
  picks: DraftPickDto[];
  myQueue: DraftQueueItemDto[];
  occupiedPlayerIds: string[];
}

export interface PlayerWeekScoreDto {
  playerId: string;
  displayName: string;
  position: string;
  slot: string;
  points: number;
  teamAbbreviation: string | null;
}

export interface MatchupSideDto {
  team: FantasyTeamSummaryDto;
  points: number;
  players: PlayerWeekScoreDto[];
}

export interface MatchupDto {
  id: string;
  leagueId: string;
  week: number;
  locked: boolean;
  home: MatchupSideDto;
  away: MatchupSideDto;
}

export interface ScoreboardMatchupDto {
  id: string;
  homeTeamId: string;
  homeTeamName: string;
  homePoints: number;
  awayTeamId: string;
  awayTeamName: string;
  awayPoints: number;
}

export interface WeekScoreboardDto {
  week: number;
  currentWeek: number;
  regularSeasonWeeks: number;
  locked: boolean;
  lockedAt: string | null;
  secondsToLock: number | null;
  matchups: ScoreboardMatchupDto[];
}

export interface StandingsRowDto {
  teamId: string;
  teamName: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
}

export type WaiverTypeDto = "priority" | "faab";
export type WaiverWindowDto = "fa" | "waiver";
export type WaiverClaimStatusDto = "pending" | "won" | "lost" | "cancelled";

export interface WaiverClaimDto {
  id: string;
  playerId: string;
  playerDisplayName: string;
  playerPosition: string;
  dropPlayerId: string | null;
  dropDisplayName: string | null;
  bid: number;
  rank: number;
  status: WaiverClaimStatusDto;
}

export interface WaiverPriorityDto {
  teamId: string;
  teamName: string;
  rank: number;
  faabRemaining: number;
}

export interface WaiverBoardDto {
  window: WaiverWindowDto;
  waiverType: WaiverTypeDto;
  processAt: string | null;
  processedAt: string | null;
  secondsToProcess: number | null;
  faabRemaining: number | null;
  myTeamId: string | null;
  claims: WaiverClaimDto[];
  priority: WaiverPriorityDto[];
}
