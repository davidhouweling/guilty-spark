import type { LiveTrackerMessage, LiveTrackerStateMessage } from "@guilty-spark/contracts/live-tracker/types";
import {
  sampleLiveTrackerStateMessage,
  sampleIndividualTrackerStateMessage,
} from "@guilty-spark/contracts/live-tracker/fakes/data";
import { UnreachableError } from "../../../base/unreachable-error";

export interface LiveTrackerScenario {
  readonly intervalMs: number;
  readonly frames: readonly LiveTrackerMessage[];
}

export interface FakeLiveTrackerScenarioFactoryOpts {
  readonly baseScenario?: LiveTrackerScenario;
  readonly intervalMs?: number;
  readonly frames?: readonly LiveTrackerMessage[];
}

function cloneNeatQueueStateWithMatches(
  state: LiveTrackerStateMessage,
  matchIdsToInclude: readonly string[],
  timestamp: string,
): LiveTrackerStateMessage {
  if (state.data.type !== "neatqueue") {
    throw new Error("Expected NeatQueue state data");
  }

  const allowedMatchIds = new Set(matchIdsToInclude);
  const matchSummaries = state.data.matchSummaries.filter((match) => allowedMatchIds.has(match.matchId));

  return {
    type: "state",
    timestamp,
    data: {
      ...state.data,
      matchSummaries,
      lastUpdateTime: timestamp,
    },
  };
}

function cloneIndividualStateWithMatches(
  state: LiveTrackerStateMessage,
  matchIdsToInclude: readonly string[],
  timestamp: string,
): LiveTrackerStateMessage {
  if (state.data.type !== "individual") {
    throw new Error("Expected Individual state data");
  }

  const allowedMatchIds = new Set(matchIdsToInclude);

  const groups = state.data.groups
    .map((group) => {
      switch (group.type) {
        case "neatqueue-series": {
          return {
            ...group,
            matchSummaries: group.matchSummaries.filter((match) => allowedMatchIds.has(match.matchId)),
          };
        }
        case "grouped-matches": {
          return {
            ...group,
            matchSummaries: group.matchSummaries.filter((match) => allowedMatchIds.has(match.matchId)),
          };
        }
        case "single-match": {
          return allowedMatchIds.has(group.matchSummary.matchId) ? group : null;
        }
        default: {
          throw new UnreachableError(group);
        }
      }
    })
    .filter((group) => group !== null);

  return {
    type: "state",
    timestamp,
    data: {
      ...state.data,
      groups,
      lastUpdateTime: timestamp,
    },
  };
}

export function createSampleScenario(): LiveTrackerScenario {
  if (sampleLiveTrackerStateMessage.data.type !== "neatqueue") {
    throw new Error("Expected NeatQueue state data");
  }

  const allMatchIds = sampleLiveTrackerStateMessage.data.matchSummaries.map((match) => match.matchId);

  const baseTimestamp = new Date(sampleLiveTrackerStateMessage.timestamp);
  const frames: LiveTrackerMessage[] = [];

  frames.push(cloneNeatQueueStateWithMatches(sampleLiveTrackerStateMessage, [], baseTimestamp.toISOString()));

  for (let index = 0; index < allMatchIds.length; index += 1) {
    const timestamp = new Date(baseTimestamp.getTime() + (index + 1) * 30_000).toISOString();
    frames.push(
      cloneNeatQueueStateWithMatches(sampleLiveTrackerStateMessage, allMatchIds.slice(0, index + 1), timestamp),
    );
  }

  return {
    intervalMs: 1200,
    frames,
  };
}

export function createSampleIndividualScenario(): LiveTrackerScenario {
  if (sampleIndividualTrackerStateMessage.data.type !== "individual") {
    throw new Error("Expected Individual state data");
  }

  // Collect all match IDs from all groups
  const allMatchIds: string[] = [];
  for (const group of sampleIndividualTrackerStateMessage.data.groups) {
    switch (group.type) {
      case "neatqueue-series":
      case "grouped-matches": {
        for (const match of group.matchSummaries) {
          allMatchIds.push(match.matchId);
        }
        break;
      }
      case "single-match": {
        allMatchIds.push(group.matchSummary.matchId);
        break;
      }
      default: {
        throw new UnreachableError(group);
      }
    }
  }

  const baseTimestamp = new Date(sampleIndividualTrackerStateMessage.timestamp);
  const frames: LiveTrackerMessage[] = [];

  frames.push(cloneIndividualStateWithMatches(sampleIndividualTrackerStateMessage, [], baseTimestamp.toISOString()));

  for (let index = 0; index < allMatchIds.length; index += 1) {
    const timestamp = new Date(baseTimestamp.getTime() + (index + 1) * 30_000).toISOString();
    frames.push(
      cloneIndividualStateWithMatches(sampleIndividualTrackerStateMessage, allMatchIds.slice(0, index + 1), timestamp),
    );
  }

  return {
    intervalMs: 1200,
    frames,
  };
}

export function aFakeLiveTrackerScenarioWith(opts: FakeLiveTrackerScenarioFactoryOpts = {}): LiveTrackerScenario {
  const baseScenario = opts.baseScenario ?? createSampleScenario();

  return {
    intervalMs: opts.intervalMs ?? baseScenario.intervalMs,
    frames: opts.frames ?? baseScenario.frames,
  };
}
