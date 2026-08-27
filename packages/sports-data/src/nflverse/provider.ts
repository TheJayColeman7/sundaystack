import type {
  NormalizedGame,
  NormalizedPlayer,
  NormalizedPlayerGameStats,
  NormalizedTeam,
} from "@sundaystack/shared";
import type { SportsDataProvider } from "../provider";
import { downloadCsv, downloadCsvIfPresent, downloadCsvWithFallback, type CsvRow } from "./download";
import {
  mapGameRow,
  mapPlayerStatRow,
  mapRosterRow,
  mapTeamRow,
  mergePlayersByGsis,
} from "./normalize";
import { playerWeekStatsUrl, rosterUrl, SCHEDULE_URLS, TEAMS_URLS } from "./urls";

export interface NflverseProviderOptions {
  seasons: number[];
}

export class NflverseProvider implements SportsDataProvider {
  private readonly seasons: number[];
  private readonly cache = new Map<string, CsvRow[]>();

  constructor(options: NflverseProviderOptions) {
    this.seasons = [...options.seasons].sort((a, b) => a - b);
  }

  async getTeams(): Promise<NormalizedTeam[]> {
    const rows = await this.loadWithFallback(TEAMS_URLS);
    return rows.map(mapTeamRow).filter((team): team is NormalizedTeam => team !== null);
  }

  async getPlayers(): Promise<NormalizedPlayer[]> {
    const mapped: NormalizedPlayer[] = [];
    let skippedWithoutGsis = 0;

    for (const season of this.seasons) {
      const rows = await this.load(rosterUrl(season));
      for (const row of rows) {
        const player = mapRosterRow(row);
        if (!player) {
          skippedWithoutGsis += 1;
          continue;
        }
        mapped.push(player);
      }
    }

    if (skippedWithoutGsis > 0) {
      console.info(`[nflverse] skipped ${skippedWithoutGsis} roster rows without GSIS id`);
    }

    return mergePlayersByGsis(mapped);
  }

  async getSchedule(season: number, week?: number): Promise<NormalizedGame[]> {
    const rows = await this.loadSchedule();
    return rows
      .map(mapGameRow)
      .filter((game): game is NormalizedGame => game !== null)
      .filter((game) => game.season === season)
      .filter((game) => (week === undefined ? true : game.week === week));
  }

  async getPlayerStats(season: number, week?: number): Promise<NormalizedPlayerGameStats[]> {
    const url = playerWeekStatsUrl(season);
    const cached = this.cache.get(url);
    const rows = cached ?? (await this.loadStats(url));
    let skipped = 0;
    const stats: NormalizedPlayerGameStats[] = [];

    for (const row of rows) {
      const mapped = mapPlayerStatRow(row);
      if (!mapped) {
        skipped += 1;
        continue;
      }
      if (week !== undefined && mapped.week !== week) {
        continue;
      }
      stats.push(mapped);
    }

    if (skipped > 0) {
      console.info(`[nflverse] skipped ${skipped} ${season} stat rows without GSIS or game_id`);
    }

    return stats;
  }

  private async loadStats(url: string): Promise<CsvRow[]> {
    console.info(`[nflverse] downloading ${url}`);
    const rows = await downloadCsvIfPresent(url);
    if (rows === null) {
      console.info(`[nflverse] no stats file yet at ${url}; continuing with 0 rows`);
      this.cache.set(url, []);
      return [];
    }
    this.cache.set(url, rows);
    return rows;
  }

  private async load(url: string): Promise<CsvRow[]> {
    const cached = this.cache.get(url);
    if (cached) {
      return cached;
    }
    console.info(`[nflverse] downloading ${url}`);
    const rows = await downloadCsv(url);
    this.cache.set(url, rows);
    return rows;
  }

  private async loadWithFallback(urls: readonly string[]): Promise<CsvRow[]> {
    const cacheKey = urls.join("|");
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }
    console.info(`[nflverse] downloading ${urls[0]}`);
    const rows = await downloadCsvWithFallback(urls);
    this.cache.set(cacheKey, rows);
    return rows;
  }

  private async loadSchedule(): Promise<CsvRow[]> {
    return this.loadWithFallback(SCHEDULE_URLS);
  }
}
