import type { MatchStats } from "halo-infinite-api";

export interface FilmChunkMetadata {
  Index: number;
  ChunkStartTimeOffsetMilliseconds: number;
  DurationMilliseconds: number;
  ChunkSize: number;
  FileRelativePath: string;
  ChunkType: number;
}

export interface FilmMetadataResponse {
  FilmStatusBond: number;
  CustomData: {
    FilmLength: number;
    Chunks: FilmChunkMetadata[];
    HasGameEnded: boolean;
    ManifestRefreshSeconds: number;
    MatchId: string;
    FilmMajorVersion: number;
  };
  BlobStoragePathPrefix: string;
  AssetId: string;
}

export type HighlightEventType = "kill" | "death" | "medal" | "mode";

export interface HighlightEvent {
  xuid: string;
  gamertag: string;
  typeHint: number;
  isMedal: boolean;
  eventType: HighlightEventType;
  timeMs: number;
  medalValue: number;
  teamId: number | null;
  weaponId: number | null;
  headshot: boolean | null;
}

export interface ScoreTimelinePoint {
  timeMs: number;
  teamScores: Record<string, number>;
  source: "initial" | "parsed-kill" | "synthetic-final";
  eventXuid: string | null;
}

export interface KothProgressPoint {
  timeMs: number;
  xuid: string;
  gamertag: string;
  teamId: number;
  teamCumulativeTicks: number;
}

export interface KothHillWindow {
  hillIndex: number;
  startTimeMs: number;
  endTimeMs: number | null;
  scoredByTeamId: number | null;
  scoredAtMs: number | null;
  progressPoints: KothProgressPoint[];
}

export interface KothHillTimeline {
  ticksPerPoint: number;
  hills: KothHillWindow[];
}

export interface PlayerValidation {
  xuid: string;
  gamertag: string | null;
  teamId: number | null;
  expected: {
    kills: number;
    deaths: number;
    medals: number;
  };
  parsed: {
    kills: number;
    deaths: number;
    medals: number;
  };
}

export interface KillPairing {
  timeMs: number;
  killerXuid: string;
  killerGamertag: string | null;
  killerTeamId: number | null;
  victimXuid: string;
  victimGamertag: string | null;
  victimTeamId: number | null;
  timeDeltaMs: number;
  classification: "enemy-kill" | "betrayal" | "suicide";
  weaponId: number | null;
  headshot: boolean | null;
}

export interface KillMatrixEntry {
  killerXuid: string;
  victimXuid: string;
  count: number;
  headshotKills: number;
  perfects: number;
  weapons: Array<{
    weaponId: number;
    count: number;
  }>;
}

export interface PerfectCounts {
  xuid: string;
  gamertag: string | null;
  teamId: number | null;
  perfects: number;
  perfections: number;
}

export interface FilmTimelineOutput {
  extractedAt: string;
  authSource: "env" | "repo-auth";
  match: {
    matchId: string;
    gameVariantCategory: MatchStats["MatchInfo"]["GameVariantCategory"];
    teams: {
      teamId: number;
      outcome: number;
      rank: number;
      finalScore: number;
      roundsWon: number;
      kills: number;
      deaths: number;
    }[];
    players: {
      xuid: string;
      teamId: number;
      kills: number;
      deaths: number;
      medals: number;
    }[];
  };
  film: {
    assetId: string;
    filmMajorVersion: number;
    filmLengthMs: number;
    highlightChunkIndex: number | null;
    chunks: {
      index: number;
      chunkType: number;
      durationMs: number;
      sizeBytes: number;
      path: string;
    }[];
  };
  events: HighlightEvent[];
  timelines: {
    teamScore: ScoreTimelinePoint[];
    kills: HighlightEvent[];
    deaths: HighlightEvent[];
    medals: HighlightEvent[];
    mode: HighlightEvent[];
    kothHills: KothHillTimeline | null;
  };
  validation: {
    players: PlayerValidation[];
    parsedCounts: {
      kills: number;
      deaths: number;
      medals: number;
      mode: number;
    };
  };
  analytics: {
    killMatrix: {
      entries: KillMatrixEntry[];
      pairings: KillPairing[];
      unpairedDeaths: {
        xuid: string;
        gamertag: string | null;
        teamId: number | null;
        count: number;
      }[];
    };
    perfects: {
      perfectMedalNameId: number;
      perfectionMedalNameId: number;
      totals: {
        perfects: number;
        perfections: number;
      };
      players: PerfectCounts[];
    };
  };
  limitations: string[];
}