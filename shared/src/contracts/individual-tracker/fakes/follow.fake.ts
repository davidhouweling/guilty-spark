import type { TrackerDirectory, TrackerDirectoryEntry } from "../follow";
import type { TrackerMatchSummary } from "../view";

let nextMatchId = 0;

export function aMatchWith(overrides: Partial<TrackerMatchSummary> = {}): TrackerMatchSummary {
  return {
    matchId: `match-${(nextMatchId += 1).toString()}`,
    startTime: "2026-01-01T00:00:00.000Z",
    endTime: "2026-01-01T00:10:00.000Z",
    mapAssetId: "map-1",
    mapVersionId: "map-version-1",
    mapName: "Aquarius",
    modeAssetId: "mode-1",
    gameVariantCategory: 6,
    outcome: "Win",
    score: "50:42",
    isMatchmaking: false,
    ...overrides,
  };
}

export function aTrackerWith(overrides: Partial<TrackerDirectoryEntry> = {}): TrackerDirectoryEntry {
  return {
    trackerId: "tracker-1",
    gamertag: "Spartan One",
    status: "active",
    isLive: false,
    matches: [],
    series: [],
    lastUpdateTime: "2026-01-01T00:00:00.000Z",
    lastMatchDiscoveredAt: null,
    hasActiveSeries: false,
    hasRecentCompletedSeries: false,
    ...overrides,
  };
}

export function aDirectoryWith(overrides: Partial<TrackerDirectory> = {}): TrackerDirectory {
  return {
    trackers: [
      aTrackerWith({ trackerId: "tracker-1", gamertag: "Spartan One", isLive: true, status: "active" }),
      aTrackerWith({ trackerId: "tracker-2", gamertag: "Spartan Two", isLive: false, status: "active" }),
    ],
    liveTrackerId: "tracker-1",
    ...overrides,
  };
}
