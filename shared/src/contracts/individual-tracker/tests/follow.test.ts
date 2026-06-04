import { describe, expect, it } from "vitest";
import { trackerDirectoryContract, trackerDirectoryMessageContract, type TrackerDirectoryResponse } from "../follow";

const validEntry = {
  trackerId: "t1",
  gamertag: "Spartan",
  status: "active" as const,
  isLive: true,
  accumulated: { total: 3, wins: 2, losses: 1, ties: 0 },
};

const validDirectory: TrackerDirectoryResponse = {
  trackers: [validEntry],
};

describe("trackerDirectoryContract", () => {
  it("parses a valid directory response", () => {
    const result = trackerDirectoryContract.parse(validDirectory);
    expect(result.trackers).toHaveLength(1);
    expect(result.trackers[0]?.trackerId).toBe("t1");
  });

  it("parses a directory with no trackers", () => {
    const result = trackerDirectoryContract.parse({ trackers: [] });
    expect(result.trackers).toEqual([]);
  });

  it("parses a directory with streamerSettings", () => {
    const result = trackerDirectoryContract.parse({
      trackers: [],
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
    expect(parsed.trackers[0]?.accumulated.wins).toBe(2);
  });

  it("rejects an entry with an invalid status", () => {
    expect(() =>
      trackerDirectoryContract.parse({
        trackers: [{ ...validEntry, status: "invalid" }],
      }),
    ).toThrow();
  });
});

describe("trackerDirectoryMessageContract", () => {
  it("serialises and parses a directory message", () => {
    const msg = trackerDirectoryMessageContract.serialize({
      type: "directory",
      directory: { trackers: [validEntry] },
    });
    expect(typeof msg).toBe("string");

    const parsed = trackerDirectoryMessageContract.parse(msg);
    expect(parsed.type).toBe("directory");
    expect(parsed.directory.trackers[0]?.trackerId).toBe("t1");
  });

  it("rejects a message with the wrong type", () => {
    expect(() =>
      trackerDirectoryMessageContract.parse(JSON.stringify({ type: "wrong", directory: { trackers: [] } })),
    ).toThrow();
  });
});
