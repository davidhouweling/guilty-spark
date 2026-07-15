import { describe, expect, it, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { TrackerDirectory } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import {
  aDirectoryWith,
  aMatchWith,
  aTrackerWith,
} from "@guilty-spark/shared/contracts/individual-tracker/fakes/follow.fake";
import * as reconnectPolicy from "../../../services/base/reconnect-policy";
import { aFakeFollowLiveServiceWith } from "../../../services/follow/fakes/follow.fake";
import { useFollowLiveDirectory } from "../use-follow-live-directory";

describe("useFollowLiveDirectory", () => {
  it("loads directory on mount and sets selectedTrackerId to the live tracker", async () => {
    const service = aFakeFollowLiveServiceWith({ directory: aDirectoryWith() });
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
      trackers: [aTrackerWith({ trackerId: "tracker-1", isLive: false, status: "active" })],
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
    const service = aFakeFollowLiveServiceWith({ directory: aDirectoryWith() });
    const { result } = renderHook(() =>
      useFollowLiveDirectory({ followLiveService: service, gamertag: "Spartan One" }),
    );

    await waitFor(() => {
      expect(result.current.directory).not.toBeNull();
    });

    const updatedDir: TrackerDirectory = {
      trackers: [
        aTrackerWith({
          trackerId: "tracker-1",
          matches: [aMatchWith({ outcome: "Win" }), aMatchWith({ outcome: "Win" })],
        }),
        aTrackerWith({ trackerId: "tracker-2", gamertag: "Spartan Two" }),
      ],
      liveTrackerId: "tracker-1",
    };

    act(() => {
      service.lastConnection?.emitDirectory(updatedDir);
    });

    expect(result.current.directory?.trackers[0]?.matches.length).toBe(2);
  });

  it("auto-switches selectedTrackerId when isFollowingLive is true and live tracker changes", async () => {
    const service = aFakeFollowLiveServiceWith({ directory: aDirectoryWith() });
    const { result } = renderHook(() =>
      useFollowLiveDirectory({ followLiveService: service, gamertag: "Spartan One" }),
    );

    await waitFor(() => {
      expect(result.current.selectedTrackerId).toBe("tracker-1");
    });

    const updatedDir: TrackerDirectory = {
      trackers: [
        aTrackerWith({ trackerId: "tracker-1", isLive: false }),
        aTrackerWith({ trackerId: "tracker-2", gamertag: "Spartan Two", isLive: true }),
      ],
      liveTrackerId: "tracker-2",
    };

    act(() => {
      service.lastConnection?.emitDirectory(updatedDir);
    });

    expect(result.current.selectedTrackerId).toBe("tracker-2");
  });

  it("does not auto-switch when isFollowingLive is false", async () => {
    const service = aFakeFollowLiveServiceWith({ directory: aDirectoryWith() });
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
        aTrackerWith({ trackerId: "tracker-1", isLive: false }),
        aTrackerWith({ trackerId: "tracker-2", gamertag: "Spartan Two", isLive: false }),
        aTrackerWith({ trackerId: "tracker-3", gamertag: "Spartan Three", isLive: true }),
      ],
      liveTrackerId: "tracker-3",
    };

    act(() => {
      service.lastConnection?.emitDirectory(updatedDir);
    });

    expect(result.current.selectedTrackerId).toBe("tracker-2");
  });

  it("falls back to preferred live tracker when manually selected tracker disappears", async () => {
    const service = aFakeFollowLiveServiceWith({ directory: aDirectoryWith() });
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
        aTrackerWith({ trackerId: "tracker-1", isLive: false, status: "active" }),
        aTrackerWith({ trackerId: "tracker-3", gamertag: "Spartan Three", isLive: true, status: "active" }),
      ],
      liveTrackerId: "tracker-3",
    };

    act(() => {
      service.lastConnection?.emitDirectory(updatedDir);
    });

    expect(result.current.selectedTrackerId).toBe("tracker-3");
    expect(result.current.isFollowingLive).toBe(true);
  });

  it("clears selectedTrackerId when selected tracker disappears and no tracker is active", async () => {
    const service = aFakeFollowLiveServiceWith({ directory: aDirectoryWith() });
    const { result } = renderHook(() =>
      useFollowLiveDirectory({ followLiveService: service, gamertag: "Spartan One" }),
    );

    await waitFor(() => {
      expect(result.current.selectedTrackerId).toBe("tracker-1");
    });

    act(() => {
      result.current.onSelectTracker("tracker-2");
    });

    const updatedDir: TrackerDirectory = {
      trackers: [
        aTrackerWith({ trackerId: "tracker-1", isLive: false, status: "stopped" }),
        aTrackerWith({ trackerId: "tracker-3", gamertag: "Spartan Three", isLive: false, status: "paused" }),
      ],
      liveTrackerId: null,
    };

    act(() => {
      service.lastConnection?.emitDirectory(updatedDir);
    });

    expect(result.current.selectedTrackerId).toBeNull();
    expect(result.current.isFollowingLive).toBe(true);
  });

  it("onSelectTracker sets isFollowingLive to false when selecting a non-live tracker", async () => {
    const service = aFakeFollowLiveServiceWith({ directory: aDirectoryWith() });
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
    const service = aFakeFollowLiveServiceWith({ directory: aDirectoryWith() });
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
    const service = aFakeFollowLiveServiceWith({ directory: aDirectoryWith() });
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
    const service = aFakeFollowLiveServiceWith({ directory: aDirectoryWith() });
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

  it("recovers directoryStatus to connected after receiving a directory message", async () => {
    const service = aFakeFollowLiveServiceWith({ directory: aDirectoryWith() });
    const { result } = renderHook(() =>
      useFollowLiveDirectory({ followLiveService: service, gamertag: "Spartan One" }),
    );

    await waitFor(() => {
      expect(result.current.directoryStatus).toBe("connected");
    });

    act(() => {
      service.lastConnection?.emitStatus("error", "Connection lost");
    });

    expect(result.current.directoryStatus).toBe("error");

    act(() => {
      service.lastConnection?.emitDirectory(aDirectoryWith());
    });

    expect(result.current.directoryStatus).toBe("connected");
  });

  it("reconnects automatically after an error status", async () => {
    const reconnectDelaySpy = vi.spyOn(reconnectPolicy, "getReconnectDelayMs").mockReturnValue(1);

    try {
      const service = aFakeFollowLiveServiceWith({ directory: aDirectoryWith() });
      const connectDirectorySpy = vi.spyOn(service, "connectDirectory");

      const { result } = renderHook(() =>
        useFollowLiveDirectory({ followLiveService: service, gamertag: "Spartan One" }),
      );

      await waitFor(() => {
        expect(result.current.directoryStatus).toBe("connected");
      });

      expect(connectDirectorySpy).toHaveBeenCalledTimes(1);

      act(() => {
        service.lastConnection?.emitStatus("error", "Connection lost");
      });

      await waitFor(() => {
        expect(connectDirectorySpy).toHaveBeenCalledTimes(2);
      });
    } finally {
      reconnectDelaySpy.mockRestore();
    }
  });

  it("does not update state after unmount when a reconnect timer fires", async () => {
    const reconnectDelaySpy = vi.spyOn(reconnectPolicy, "getReconnectDelayMs").mockReturnValue(1);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const service = aFakeFollowLiveServiceWith({ directory: aDirectoryWith() });
      const { result, unmount } = renderHook(() =>
        useFollowLiveDirectory({ followLiveService: service, gamertag: "Spartan One" }),
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.directoryStatus).toBe("connected");

      act(() => {
        service.lastConnection?.emitStatus("error", "Connection lost");
      });

      unmount();

      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    } finally {
      reconnectDelaySpy.mockRestore();
      consoleErrorSpy.mockRestore();
    }
  });
});
