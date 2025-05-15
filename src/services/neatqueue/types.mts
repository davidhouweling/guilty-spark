import type { NeatQueueConfigRow } from "../database/types/neat_queue_config.mjs";

export interface NeatQueuePlayer {
  name: string;
  id: string;
  mmr: number;
  role: string | null;
  team_num: number;
  top_role_index: number;
  ign: string | null;
  timestamp: string;
  pulled_from: string | null;
  team_name: string | null;
  party_leader: string | null;
  captain: boolean | null;
  picked: boolean;
  mmr_change: number;
  priority: number;
  guild_id: string;
  mmr_multiplier: number;
  points_multiplier: number;
  tournament_team_id: string | null;
  queue_entry_survey: Record<string, unknown>;
}

interface NeatQueueBaseRequest {
  action: string;
  guild: string;
  channel: string;
  queue: string;
}

export interface NeatQueueJoinQueueRequest extends NeatQueueBaseRequest {
  action: "JOIN_QUEUE";
  players: NeatQueuePlayer[];
  new_players: NeatQueuePlayer[];
}

export interface NeatQueueLeaveQueueRequest extends NeatQueueBaseRequest {
  action: "LEAVE_QUEUE";
  players: NeatQueuePlayer[];
  players_removed: NeatQueuePlayer[];
}

export interface NeatQueueMatchStartedRequest extends NeatQueueBaseRequest {
  action: "MATCH_STARTED";
  players: NeatQueuePlayer[];
  match_num: number;
}

export interface NeatQueueTeamsCreatedRequest extends NeatQueueBaseRequest {
  action: "TEAMS_CREATED";
  match_number: number;
  teams: NeatQueuePlayer[][];
  match_details: unknown[];
  lobby_details: unknown;
}

export interface NeatQueueSubstitutionRequest extends NeatQueueBaseRequest {
  action: "SUBSTITUTION";
  match_number?: number;
  player_subbed_out: NeatQueuePlayer;
  player_subbed_in: NeatQueuePlayer;
}

export interface NeatQueueMatchCancelledRequest extends NeatQueueBaseRequest {
  action: "MATCH_CANCELLED";
  teams: NeatQueuePlayer[][];
}

export interface NeatQueueMatchCompletedRequest extends NeatQueueBaseRequest {
  action: "MATCH_COMPLETED";
  match_number: number;
  /**
   * Index of the winning team in the teams array
   *
   * -1 if the match was cancelled
   */
  winning_team_index: number;
  teams: NeatQueuePlayer[][];
}

export type NeatQueueRequest =
  | NeatQueueJoinQueueRequest
  | NeatQueueLeaveQueueRequest
  | NeatQueueMatchStartedRequest
  | NeatQueueTeamsCreatedRequest
  | NeatQueueSubstitutionRequest
  | NeatQueueMatchCancelledRequest
  | NeatQueueMatchCompletedRequest;

export type VerifyNeatQueueResponse =
  | {
      isValid: true;
      interaction: NeatQueueRequest;
      neatQueueConfig: NeatQueueConfigRow;
    }
  | {
      isValid: false;
      error?: string;
    };

export interface NeatQueueTimelineEvent {
  timestamp: string;
  event: NeatQueueRequest;
}

export type NeatQueueTimelineRequest =
  | NeatQueueMatchStartedRequest
  | NeatQueueTeamsCreatedRequest
  | NeatQueueSubstitutionRequest
  | NeatQueueMatchCompletedRequest;
