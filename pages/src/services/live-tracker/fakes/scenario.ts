import type { LiveTrackerMessage, LiveTrackerStateMessage } from "@guilty-spark/contracts/live-tracker/types";
import { sampleLiveTrackerStateMessage } from "@guilty-spark/contracts/live-tracker/fakes/data";

export interface LiveTrackerScenario {
  readonly intervalMs: number;
  readonly frames: readonly LiveTrackerMessage[];
}

export interface FakeLiveTrackerScenarioFactoryOpts {
  readonly baseScenario?: LiveTrackerScenario;
  readonly intervalMs?: number;
  readonly frames?: readonly LiveTrackerMessage[];
}

function cloneStateWithMatches(
  state: LiveTrackerStateMessage,
  matchIdsToInclude: readonly string[],
  timestamp: string,
): LiveTrackerStateMessage {
  const discoveredMatches: Record<string, LiveTrackerStateMessage["data"]["discoveredMatches"][string]> = {};

  for (const matchId of matchIdsToInclude) {
    if (Object.prototype.hasOwnProperty.call(state.data.discoveredMatches, matchId)) {
      discoveredMatches[matchId] = state.data.discoveredMatches[matchId];
    }
  }

  return {
    type: "state",
    timestamp,
    data: {
      ...state.data,
      discoveredMatches,
      lastUpdateTime: timestamp,
    },
  };
}

export function createSampleScenario(): LiveTrackerScenario {
  const allMatchIds = Object.keys(sampleLiveTrackerStateMessage.data.discoveredMatches);

  const baseTimestamp = new Date(sampleLiveTrackerStateMessage.timestamp);
  const frames: LiveTrackerMessage[] = [];

  frames.push(cloneStateWithMatches(sampleLiveTrackerStateMessage, [], baseTimestamp.toISOString()));

  for (let index = 0; index < allMatchIds.length; index += 1) {
    const timestamp = new Date(baseTimestamp.getTime() + (index + 1) * 30_000).toISOString();
    frames.push(cloneStateWithMatches(sampleLiveTrackerStateMessage, allMatchIds.slice(0, index + 1), timestamp));
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
