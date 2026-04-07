import type { LiveTrackerMessage, LiveTrackerStateMessage } from "@guilty-spark/shared/live-tracker/types";
import { sampleLiveTrackerStateMessage } from "@guilty-spark/shared/live-tracker/fakes/data";

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

export function createSampleScenario(): LiveTrackerScenario {
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
    intervalMs: 60000,
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
