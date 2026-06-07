import { describe, expect, it, vi } from "vitest";
import type { TrackerMatchHistoryEntry } from "../../../services/individual-tracker/types";
import { MatchHistoryPresenter } from "../match-history-presenter";
import { MatchHistoryStore } from "../match-history-store";

function aMatchEntry(
  matchId: string,
  category: TrackerMatchHistoryEntry["category"] = "custom",
): TrackerMatchHistoryEntry {
  return {
    matchId,
    startTime: "Jan 1, 2026, 12:00:00 AM",
    endTime: "Jan 1, 2026, 12:10:00 AM",
    mapAssetId: `map-${matchId}`,
    mapVersionId: `map-version-${matchId}`,
    modeAssetId: `mode-${matchId}`,
    modeVersionId: `mode-version-${matchId}`,
    gameVariantCategory: 6,
    duration: "10m 0s",
    mapName: "Aquarius",
    modeName: "Slayer",
    outcome: "Win",
    resultString: "Win - 50:40",
    isMatchmaking: category === "matchmaking",
    category,
    teams: [],
    mapThumbnailUrl: "data:,",
  };
}

describe("MatchHistoryPresenter.present", () => {
  it("returns empty segmentBlocks when entries is null", () => {
    const store = new MatchHistoryStore();
    const snapshot = store.getSnapshot();

    const model = MatchHistoryPresenter.present(snapshot, null, undefined, false, undefined);

    expect(model.segmentBlocks).toHaveLength(0);
  });

  it("returns single segment blocks for ungrouped entries", () => {
    const store = new MatchHistoryStore();
    const snapshot = store.getSnapshot();
    const entries = [aMatchEntry("m1"), aMatchEntry("m2")];

    const model = MatchHistoryPresenter.present(snapshot, entries, undefined, false, undefined);

    expect(model.segmentBlocks).toHaveLength(2);
    expect(model.segmentBlocks[0]).toMatchObject({ type: "single", entry: entries[0] });
    expect(model.segmentBlocks[1]).toMatchObject({ type: "single", entry: entries[1] });
  });

  it("groups entries into a group block when showGroupings is true and groupings match", () => {
    const store = new MatchHistoryStore();
    const snapshot = store.getSnapshot();
    const entries = [aMatchEntry("m1"), aMatchEntry("m2")];
    const groupings = [["m1", "m2"]];

    const model = MatchHistoryPresenter.present(snapshot, entries, groupings, true, undefined);

    expect(model.segmentBlocks).toHaveLength(1);
    expect(model.segmentBlocks[0]).toMatchObject({ type: "group", groupIndex: 0 });
  });

  it("does not group entries when showGroupings is false", () => {
    const store = new MatchHistoryStore();
    const snapshot = store.getSnapshot();
    const entries = [aMatchEntry("m1"), aMatchEntry("m2")];
    const groupings = [["m1", "m2"]];

    const model = MatchHistoryPresenter.present(snapshot, entries, groupings, false, undefined);

    expect(model.segmentBlocks).toHaveLength(2);
    expect(model.segmentBlocks[0]).toMatchObject({ type: "single" });
  });

  it("reflects isLoadingMore from the store snapshot", () => {
    const store = new MatchHistoryStore();
    store.update({ isLoadingMore: true });
    const snapshot = store.getSnapshot();

    const model = MatchHistoryPresenter.present(snapshot, [], undefined, false, undefined);

    expect(model.isLoadingMore).toBe(true);
  });

  it("assigns series group metadata to group blocks", () => {
    const store = new MatchHistoryStore();
    const snapshot = store.getSnapshot();
    const entries = [aMatchEntry("m1"), aMatchEntry("m2")];
    const groupings = [["m1", "m2"]];
    const seriesGroups = [{ matchIds: ["m1", "m2"], titleOverride: "Eagle vs Cobra", subtitleOverride: "Best of 3" }];

    const model = MatchHistoryPresenter.present(snapshot, entries, groupings, true, seriesGroups);

    const [block] = model.segmentBlocks;
    expect(block.type).toBe("group");
    if (block.type === "group") {
      expect(block.seriesGroup).toEqual(seriesGroups[0]);
    }
  });
});

describe("MatchHistoryPresenter.loadMore", () => {
  it("calls onLoadMore and sets isLoadingMore to true then false", async () => {
    const store = new MatchHistoryStore();
    let resolve: () => void = () => undefined;
    const onLoadMore = vi.fn<() => Promise<void>>(
      async () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const presenter = new MatchHistoryPresenter({ store, onLoadMore });

    const loadMorePromise = presenter.loadMore();
    expect(store.getSnapshot().isLoadingMore).toBe(true);

    resolve();
    await loadMorePromise;

    expect(store.getSnapshot().isLoadingMore).toBe(false);
    expect(onLoadMore).toHaveBeenCalledOnce();
  });

  it("sets isLoadingMore to false even when onLoadMore throws", async () => {
    const store = new MatchHistoryStore();
    const onLoadMore = vi.fn<() => Promise<void>>().mockRejectedValueOnce(new Error("network error"));
    const presenter = new MatchHistoryPresenter({ store, onLoadMore });

    await expect(presenter.loadMore()).rejects.toThrow("network error");

    expect(store.getSnapshot().isLoadingMore).toBe(false);
  });

  it("does nothing when onLoadMore is undefined", async () => {
    const store = new MatchHistoryStore();
    const presenter = new MatchHistoryPresenter({ store, onLoadMore: undefined });

    await presenter.loadMore();

    expect(store.getSnapshot().isLoadingMore).toBe(false);
  });
});
