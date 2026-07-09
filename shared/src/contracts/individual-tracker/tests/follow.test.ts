import { describe, expect, it } from "vitest";
import { trackerDirectoryContract, trackerDirectoryMessageContract, type TrackerDirectoryResponse } from "../follow";

const validEntry = {
  trackerId: "t1",
  gamertag: "Spartan",
  status: "active" as const,
  isLive: true,
  matches: [
    {
      matchId: "m1",
      startTime: "2026-01-01T00:00:00.000Z",
      endTime: "2026-01-01T00:10:00.000Z",
      mapAssetId: "map-1",
      mapVersionId: "map-version-1",
      mapName: "Aquarius",
      modeAssetId: "mode-1",
      gameVariantCategory: 6,
      outcome: "Win" as const,
      score: "50:42",
      killsDeathsAssistsKda: "10:7:4 (1.62)",
      damageDealtTakenRatio: "4,200:3,900 (1.08)",
      isMatchmaking: false,
    },
  ],
  series: [],
  lastUpdateTime: "2026-01-01T00:12:00.000Z",
  lastMatchDiscoveredAt: "2026-01-01T00:10:00.000Z",
  hasActiveSeries: false,
  hasRecentCompletedSeries: false,
};

const validDirectory: TrackerDirectoryResponse = {
  trackers: [validEntry],
  liveTrackerId: "t1",
};

describe("trackerDirectoryContract", () => {
  it("parses a valid directory response", () => {
    const result = trackerDirectoryContract.parse(validDirectory);
    expect(result.trackers).toHaveLength(1);
    expect(result.trackers[0]?.trackerId).toBe("t1");
  });

  it("parses a directory with no trackers", () => {
    const result = trackerDirectoryContract.parse({ trackers: [], liveTrackerId: null });
    expect(result.trackers).toEqual([]);
  });

  it("parses a directory with streamerSettings", () => {
    const result = trackerDirectoryContract.parse({
      trackers: [],
      liveTrackerId: null,
      streamerSettings: { styleFlags: { colorMode: "observer" } },
    });
    expect(result.streamerSettings?.styleFlags?.colorMode).toBe("observer");
  });

  it("serialises to and from a Response", async () => {
    const response = trackerDirectoryContract.toResponse(validDirectory, { noStore: true });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    const parsed = await trackerDirectoryContract.fromResponse(response);
    expect(parsed.trackers[0]?.gamertag).toBe("Spartan");
    expect(parsed.trackers[0]?.matches[0]?.outcome).toBe("Win");
  });

  it("rejects an entry with an invalid status", () => {
    expect(() =>
      trackerDirectoryContract.parse({
        liveTrackerId: null,
        trackers: [{ ...validEntry, status: "invalid" }],
      }),
    ).toThrow();
  });
});

describe("trackerDirectoryMessageContract", () => {
  it("serialises and parses a directory message", () => {
    const msg = trackerDirectoryMessageContract.serialize({
      type: "directory",
      directory: { trackers: [validEntry], liveTrackerId: "t1" },
    });
    expect(typeof msg).toBe("string");

    const parsed = trackerDirectoryMessageContract.parse(msg);
    expect(parsed.type).toBe("directory");
    expect(parsed.directory.trackers[0]?.trackerId).toBe("t1");
  });

  it("rejects a message with the wrong type", () => {
    expect(() =>
      trackerDirectoryMessageContract.parse(
        JSON.stringify({ type: "wrong", directory: { trackers: [], liveTrackerId: null } }),
      ),
    ).toThrow();
  });
});
