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
