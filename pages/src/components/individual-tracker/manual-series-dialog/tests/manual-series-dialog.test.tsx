import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { TrackerMatchHistoryEntry, TrackerSearchResult } from "../../../../services/individual-tracker/types";
import { ManualSeriesDialogStore } from "../manual-series-dialog-store";
import { ManualSeriesDialog } from "../manual-series-dialog";

afterEach(() => {
  cleanup();
});

function aMatchEntryWith(overrides: Partial<TrackerMatchHistoryEntry>): TrackerMatchHistoryEntry {
  return {
    matchId: "match-default",
    startTime: "Jan 1, 2026, 12:00:00 AM",
    endTime: "Jan 1, 2026, 12:10:00 AM",
    mapAssetId: "map-1",
    mapVersionId: "map-version-1",
    modeAssetId: "mode-1",
    modeVersionId: "mode-version-1",
    gameVariantCategory: 6,
    startTimeIso: "2026-01-01T00:00:00.000Z",
    endTimeIso: "2026-01-01T00:10:00.000Z",
    duration: "10m 0s",
    mapName: "Aquarius",
    modeName: "Slayer",
    outcome: "Win",
    resultString: "Win - 50:40",
    isMatchmaking: false,
    category: "custom",
    teams: [],
    mapThumbnailUrl: "data:,",
    ...overrides,
  };
}

function aSearchResultWith(gamertag: string, xuid: string): TrackerSearchResult {
  return {
    gamertag,
    xuid,
    rankLabel: null,
    csrLabel: null,
    currentRankTier: null,
    currentRankSubTier: null,
    currentRankMeasurementMatchesRemaining: null,
    currentRankInitialMeasurementMatches: null,
    allTimePeakRankLabel: null,
    allTimePeakCsrLabel: null,
    allTimePeakRankTier: null,
    allTimePeakRankSubTier: null,
    seasonPeakCsrLabel: null,
    seasonPeakRankTier: null,
    seasonPeakRankSubTier: null,
    matchmadeMatchCount: null,
    customMatchCount: null,
  };
}

function renderDialog(store: ManualSeriesDialogStore): void {
  const snapshot = store.getSnapshot();
  render(
    <ManualSeriesDialog
      isOpen={true}
      trackerLabel="Owner Tracker"
      snapshot={snapshot}
      onClose={vi.fn()}
      onTitleChange={vi.fn()}
      onSubtitleChange={vi.fn()}
      onTeamNameChange={vi.fn()}
      onTeamMemberChange={vi.fn()}
      onAddTeamMember={vi.fn()}
      onRemoveTeamMember={vi.fn()}
      onDiscoverBackfill={vi.fn()}
      onBackfillMatchToggle={vi.fn()}
      onStartSeries={vi.fn()}
    />,
  );
}

describe("ManualSeriesDialog", () => {
  it("renders team player inputs", () => {
    const store = new ManualSeriesDialogStore();
    renderDialog(store);
    const gamertag = screen.getAllByPlaceholderText("Gamertag");
    expect(gamertag.length).toBeGreaterThan(0);
  });

  it("shows backfill matches when backfillState is done", () => {
    const store = new ManualSeriesDialogStore();
    const sharedMatch = aMatchEntryWith({ matchId: "m-shared", modeName: "Slayer", mapName: "Aquarius" });
    store.setBackfillDone([sharedMatch], null, null);
    const snapshot = store.getSnapshot();

    render(
      <ManualSeriesDialog
        isOpen={true}
        trackerLabel="Owner Tracker"
        snapshot={snapshot}
        onClose={vi.fn()}
        onTitleChange={vi.fn()}
        onSubtitleChange={vi.fn()}
        onTeamNameChange={vi.fn()}
        onTeamMemberChange={vi.fn()}
        onAddTeamMember={vi.fn()}
        onRemoveTeamMember={vi.fn()}
        onDiscoverBackfill={vi.fn()}
        onBackfillMatchToggle={vi.fn()}
        onStartSeries={vi.fn()}
      />,
    );

    expect(screen.getByText("Slayer: Aquarius")).toBeInTheDocument();
  });

  it("calls onStartSeries when Start series button is clicked", async () => {
    const store = new ManualSeriesDialogStore();
    const onStartSeries = vi.fn<() => void>();

    render(
      <ManualSeriesDialog
        isOpen={true}
        trackerLabel="Owner Tracker"
        snapshot={store.getSnapshot()}
        onClose={vi.fn()}
        onTitleChange={vi.fn()}
        onSubtitleChange={vi.fn()}
        onTeamNameChange={vi.fn()}
        onTeamMemberChange={vi.fn()}
        onAddTeamMember={vi.fn()}
        onRemoveTeamMember={vi.fn()}
        onDiscoverBackfill={vi.fn()}
        onBackfillMatchToggle={vi.fn()}
        onStartSeries={onStartSeries}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start series" }));

    await waitFor(() => {
      expect(onStartSeries).toHaveBeenCalled();
    });
  });

  it("shows backfill warning when provided", () => {
    const store = new ManualSeriesDialogStore();
    store.setBackfillDone([], "Warning: some player history unavailable", null);
    renderDialog(store);
    expect(screen.getByText("Warning: some player history unavailable")).toBeInTheDocument();
  });

  it("shows submit error when present", () => {
    const store = new ManualSeriesDialogStore();
    store.setSubmitError("Failed to start series");
    renderDialog(store);
    expect(screen.getByText("Failed to start series")).toBeInTheDocument();
  });

  it("disables Start series button when busy", () => {
    const store = new ManualSeriesDialogStore();
    store.setBusy(true);
    renderDialog(store);
    const btn = screen.getByRole("button", { name: "Start series" });
    expect(btn).toBeDisabled();
  });

  it("renders null when isOpen is false", () => {
    const store = new ManualSeriesDialogStore();
    const { container } = render(
      <ManualSeriesDialog
        isOpen={false}
        trackerLabel="Owner Tracker"
        snapshot={store.getSnapshot()}
        onClose={vi.fn()}
        onTitleChange={vi.fn()}
        onSubtitleChange={vi.fn()}
        onTeamNameChange={vi.fn()}
        onTeamMemberChange={vi.fn()}
        onAddTeamMember={vi.fn()}
        onRemoveTeamMember={vi.fn()}
        onDiscoverBackfill={vi.fn()}
        onBackfillMatchToggle={vi.fn()}
        onStartSeries={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ManualSeriesDialog (backfill interaction simulation)", () => {
  it("shows shared custom match and excludes matchmaking after backfill discovery", async () => {
    const store = new ManualSeriesDialogStore();
    const onSearchGamertag = vi.fn(async (query: string): Promise<TrackerSearchResult | null> => {
      if (query === "Alpha") {
        return await Promise.resolve(aSearchResultWith("Alpha", "xuid-alpha"));
      }
      if (query === "Bravo") {
        return await Promise.resolve(aSearchResultWith("Bravo", "xuid-bravo"));
      }
      return await Promise.resolve(null);
    });

    const alphaMatches = [
      aMatchEntryWith({ matchId: "m-shared", modeName: "Slayer", mapName: "Aquarius" }),
      aMatchEntryWith({ matchId: "m-alpha-only", modeName: "Oddball", mapName: "Streets" }),
    ];

    const bravoMatches = [
      aMatchEntryWith({ matchId: "m-shared", modeName: "Slayer", mapName: "Aquarius" }),
      aMatchEntryWith({ matchId: "m-bravo-only", modeName: "CTF", mapName: "Bazaar" }),
    ];

    const onLoadMatches = vi.fn(async (xuid: string): Promise<{ matches: readonly TrackerMatchHistoryEntry[] }> => {
      if (xuid === "xuid-alpha") {
        return await Promise.resolve({ matches: alphaMatches });
      }
      if (xuid === "xuid-bravo") {
        return await Promise.resolve({ matches: bravoMatches });
      }
      return await Promise.resolve({ matches: [] });
    });

    const onDiscoverBackfill = vi.fn(async (): Promise<void> => {
      store.setBackfillLoading();

      const members = ["Alpha", "Bravo"];
      const resolvedPlayers = await Promise.all(
        members.map(async (member) => ({ member, result: await onSearchGamertag(member) })),
      );

      const withIdentity = resolvedPlayers.filter(
        (e): e is { member: string; result: TrackerSearchResult } => e.result != null,
      );

      const histories = await Promise.all(
        withIdentity.map(async ({ member, result }) => ({
          member,
          matches: (await onLoadMatches(result.xuid)).matches.filter((m) => m.category === "custom"),
        })),
      );

      const intersection = new Set(histories[0].matches.map((m) => m.matchId));
      for (const h of histories.slice(1)) {
        const ids = new Set(h.matches.map((m) => m.matchId));
        for (const id of intersection) {
          if (!ids.has(id)) {
            intersection.delete(id);
          }
        }
      }

      const matchById = new Map<string, TrackerMatchHistoryEntry>();
      for (const h of histories) {
        for (const match of h.matches) {
          if (!matchById.has(match.matchId)) {
            matchById.set(match.matchId, match);
          }
        }
      }

      const candidates = Array.from(intersection)
        .map((id) => matchById.get(id))
        .filter((m): m is TrackerMatchHistoryEntry => m != null);

      store.setBackfillDone(candidates, null, null);
    });

    let snapshot = store.getSnapshot();

    const { rerender } = render(
      <ManualSeriesDialog
        isOpen={true}
        trackerLabel="Owner Tracker"
        snapshot={snapshot}
        onClose={vi.fn()}
        onTitleChange={vi.fn()}
        onSubtitleChange={vi.fn()}
        onTeamNameChange={vi.fn()}
        onTeamMemberChange={vi.fn()}
        onAddTeamMember={vi.fn()}
        onRemoveTeamMember={vi.fn()}
        onDiscoverBackfill={(): void => {
          void onDiscoverBackfill();
        }}
        onBackfillMatchToggle={vi.fn()}
        onStartSeries={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add existing custom games" }));

    await waitFor(() => {
      expect(onSearchGamertag).toHaveBeenCalledWith("Alpha");
    });

    snapshot = store.getSnapshot();
    rerender(
      <ManualSeriesDialog
        isOpen={true}
        trackerLabel="Owner Tracker"
        snapshot={snapshot}
        onClose={vi.fn()}
        onTitleChange={vi.fn()}
        onSubtitleChange={vi.fn()}
        onTeamNameChange={vi.fn()}
        onTeamMemberChange={vi.fn()}
        onAddTeamMember={vi.fn()}
        onRemoveTeamMember={vi.fn()}
        onDiscoverBackfill={(): void => {
          void onDiscoverBackfill();
        }}
        onBackfillMatchToggle={vi.fn()}
        onStartSeries={vi.fn()}
      />,
    );

    expect(screen.getByText("Slayer: Aquarius")).toBeInTheDocument();
    expect(screen.queryByText("Oddball: Streets")).not.toBeInTheDocument();
    expect(screen.queryByText("CTF: Bazaar")).not.toBeInTheDocument();
  });
});
