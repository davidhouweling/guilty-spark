import { describe, expect, it, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { TrackerDirectory, TrackerDirectoryEntry } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import { aFakeFollowLiveServiceWith } from "../../../services/follow/fakes/follow.fake";
import { useFollowLiveDirectory } from "../use-follow-live-directory";

type TrackerMatchOutcome = TrackerDirectoryEntry["matches"][number]["outcome"];

function aMatch(outcome: TrackerMatchOutcome): TrackerDirectoryEntry["matches"][number] {
  return {
    matchId: crypto.randomUUID(),
    startTime: "2026-01-01T00:00:00.000Z",
    endTime: "2026-01-01T00:10:00.000Z",
    mapAssetId: "map-1",
    mapVersionId: "map-version-1",
    mapName: "Aquarius",
    modeAssetId: "mode-1",
    gameVariantCategory: 6,
    outcome,
    score: "50:42",
    isMatchmaking: false,
  };
}

function aTracker(overrides: Partial<TrackerDirectoryEntry> = {}): TrackerDirectoryEntry {
  return {
    trackerId: "tracker-1",
    gamertag: "Spartan One",
    status: "active",
    isLive: false,
    matches: [aMatch("Win")],
    series: [],
    lastUpdateTime: "2026-01-01T00:00:00.000Z",
    lastMatchDiscoveredAt: null,
    hasActiveSeries: false,
    hasRecentCompletedSeries: false,
    ...overrides,
  };
}

function aDirectory(overrides: Partial<TrackerDirectory> = {}): TrackerDirectory {
  return {
    trackers: [
      aTracker({ trackerId: "tracker-1", gamertag: "Spartan One", isLive: true, status: "active" }),
      aTracker({ trackerId: "tracker-2", gamertag: "Spartan Two", isLive: false, status: "active" }),
    ],
    liveTrackerId: "tracker-1",
    ...overrides,
  };
}

describe("useFollowLiveDirectory", () => {
  it("loads directory on mount and sets selectedTrackerId to the live tracker", async () => {
    const service = aFakeFollowLiveServiceWith({ directory: aDirectory() });
    const { result } = renderHook(() =>
      useFollowLiveDirectory({ followLiveService: service, gamertag: "Spartan One" }),
    );

    await waitFor(() => {
      expect(result.current.directory).not.toBeNull();
    });

    expect(result.current.selectedTrackerId).toBe("tracker-1");
    expect(result.current.isFollowingLive).toBe(true);
    expect(result.current.directoryStatus).toBe("connected");
  });

  it("sets selectedTrackerId to first active when no live tracker is provided", async () => {
    const dir: TrackerDirectory = {
      trackers: [aTracker({ trackerId: "tracker-1", isLive: false, status: "active" })],
      liveTrackerId: null,
    };
    const service = aFakeFollowLiveServiceWith({ directory: dir });
    const { result } = renderHook(() =>
      useFollowLiveDirectory({ followLiveService: service, gamertag: "Spartan One" }),
    );

    await waitFor(() => {
      expect(result.current.directory).not.toBeNull();
    });

    expect(result.current.selectedTrackerId).toBe("tracker-1");
  });

  it("propagates directory WS updates to directory state", async () => {
    const service = aFakeFollowLiveServiceWith({ directory: aDirectory() });
    const { result } = renderHook(() =>
      useFollowLiveDirectory({ followLiveService: service, gamertag: "Spartan One" }),
    );

    await waitFor(() => {
      expect(result.current.directory).not.toBeNull();
    });

    const updatedDir: TrackerDirectory = {
      trackers: [
        aTracker({ trackerId: "tracker-1", matches: [aMatch("Win"), aMatch("Win")] }),
        aTracker({ trackerId: "tracker-2", gamertag: "Spartan Two" }),
      ],
      liveTrackerId: "tracker-1",
    };

    act(() => {
      service.lastConnection?.emitDirectory(updatedDir);
    });

    expect(result.current.directory?.trackers[0]?.matches.length).toBe(2);
  });

  it("auto-switches selectedTrackerId when isFollowingLive is true and live tracker changes", async () => {
    const service = aFakeFollowLiveServiceWith({ directory: aDirectory() });
    const { result } = renderHook(() =>
      useFollowLiveDirectory({ followLiveService: service, gamertag: "Spartan One" }),
    );

    await waitFor(() => {
      expect(result.current.selectedTrackerId).toBe("tracker-1");
    });

    const updatedDir: TrackerDirectory = {
      trackers: [
        aTracker({ trackerId: "tracker-1", isLive: false }),
        aTracker({ trackerId: "tracker-2", gamertag: "Spartan Two", isLive: true }),
      ],
      liveTrackerId: "tracker-2",
    };

    act(() => {
      service.lastConnection?.emitDirectory(updatedDir);
    });

    expect(result.current.selectedTrackerId).toBe("tracker-2");
  });

  it("does not auto-switch when isFollowingLive is false", async () => {
    const service = aFakeFollowLiveServiceWith({ directory: aDirectory() });
    const { result } = renderHook(() =>
      useFollowLiveDirectory({ followLiveService: service, gamertag: "Spartan One" }),
    );

    await waitFor(() => {
      expect(result.current.selectedTrackerId).toBe("tracker-1");
    });

    act(() => {
      result.current.onSelectTracker("tracker-2");
    });

    expect(result.current.isFollowingLive).toBe(false);

    const updatedDir: TrackerDirectory = {
      trackers: [
        aTracker({ trackerId: "tracker-1", isLive: false }),
        aTracker({ trackerId: "tracker-2", gamertag: "Spartan Two", isLive: false }),
        aTracker({ trackerId: "tracker-3", gamertag: "Spartan Three", isLive: true }),
      ],
      liveTrackerId: "tracker-3",
    };

    act(() => {
      service.lastConnection?.emitDirectory(updatedDir);
    });

    expect(result.current.selectedTrackerId).toBe("tracker-2");
  });

  it("onSelectTracker sets isFollowingLive to false when selecting a non-live tracker", async () => {
    const service = aFakeFollowLiveServiceWith({ directory: aDirectory() });
    const { result } = renderHook(() =>
      useFollowLiveDirectory({ followLiveService: service, gamertag: "Spartan One" }),
    );

    await waitFor(() => {
      expect(result.current.directory).not.toBeNull();
    });

    act(() => {
      result.current.onSelectTracker("tracker-2");
    });

    expect(result.current.selectedTrackerId).toBe("tracker-2");
    expect(result.current.isFollowingLive).toBe(false);
  });

  it("onSelectTracker sets isFollowingLive to true when selecting the live tracker", async () => {
    const service = aFakeFollowLiveServiceWith({ directory: aDirectory() });
    const { result } = renderHook(() =>
      useFollowLiveDirectory({ followLiveService: service, gamertag: "Spartan One" }),
    );

    await waitFor(() => {
      expect(result.current.directory).not.toBeNull();
    });

    act(() => {
      result.current.onSelectTracker("tracker-2");
    });

    expect(result.current.isFollowingLive).toBe(false);

    act(() => {
      result.current.onSelectTracker("tracker-1");
    });

    expect(result.current.selectedTrackerId).toBe("tracker-1");
    expect(result.current.isFollowingLive).toBe(true);
  });

  it("sets directoryStatus to error when getDirectory fails", async () => {
    const service = aFakeFollowLiveServiceWith();
    vi.spyOn(service, "getDirectory").mockRejectedValue(new Error("Network error"));
    const { result } = renderHook(() =>
      useFollowLiveDirectory({ followLiveService: service, gamertag: "Spartan One" }),
    );

    await waitFor(() => {
      expect(result.current.directoryStatus).toBe("error");
    });

    expect(result.current.directory).toBeNull();
  });

  it("onRetry re-fetches the directory after an error", async () => {
    const service = aFakeFollowLiveServiceWith({ directory: aDirectory() });
    vi.spyOn(service, "getDirectory").mockRejectedValueOnce(new Error("Network error"));
    const { result } = renderHook(() =>
      useFollowLiveDirectory({ followLiveService: service, gamertag: "Spartan One" }),
    );

    await waitFor(() => {
      expect(result.current.directoryStatus).toBe("error");
    });

    act(() => {
      result.current.onRetry();
    });

    await waitFor(() => {
      expect(result.current.directoryStatus).toBe("connected");
    });

    expect(result.current.directory).not.toBeNull();
  });

  it("onFollowLive sets isFollowingLive to true and selects the live tracker", async () => {
    const service = aFakeFollowLiveServiceWith({ directory: aDirectory() });
    const { result } = renderHook(() =>
      useFollowLiveDirectory({ followLiveService: service, gamertag: "Spartan One" }),
    );

    await waitFor(() => {
      expect(result.current.directory).not.toBeNull();
    });

    act(() => {
      result.current.onSelectTracker("tracker-2");
    });

    expect(result.current.isFollowingLive).toBe(false);

    act(() => {
      result.current.onFollowLive();
    });

    expect(result.current.isFollowingLive).toBe(true);
    expect(result.current.selectedTrackerId).toBe("tracker-1");
  });
});
