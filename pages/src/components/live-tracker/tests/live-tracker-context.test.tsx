import "@testing-library/jest-dom/vitest";

import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import type { PlayerAssociationData } from "@guilty-spark/shared/live-tracker/types";
import type { LiveTrackerViewModel } from "../types";
import {
  LiveTrackerProvider,
  useTrackerInfo,
  useTrackerState,
  useTrackerTeams,
  useTrackerMatches,
  useTrackerPlayersData,
  useSeriesScore,
  useAllMatchStats,
  useSeriesStats,
  useMatchByIndex,
  useSubstitutions,
  useMatchCount,
  useHasMatches,
  useTrackerIdentity,
} from "../live-tracker-context";

// Default params for test cases
const defaultParams = { type: "team" as const, server: "test-server", queue: "5" };

function aFakeLiveTrackerViewModelWith(overrides?: Partial<LiveTrackerViewModel>): LiveTrackerViewModel {
  return {
    title: "Test Guild",
    subtitle: "Queue 5",
    iconUrl: "data:,",
    statusText: "active",
    statusClassName: "status-active",
    state: {
      type: "neatqueue",
      guildName: "Test Guild",
      guildId: "test-guild-id",
      guildIcon: null,
      queueNumber: 5,
      status: "active",
      lastUpdateTime: "2025-01-01T00:00:00.000Z",
      teams: [
        {
          name: "Team 1",
          players: [
            {
              id: "player1",
              displayName: "player_one",
            },
          ],
        },
      ],
      matches: [
        {
          matchId: "match1",
          gameTypeAndMap: "Slayer: Aquarius",
          gameType: "Slayer",
          gameMap: "Aquarius",
          gameMapThumbnailUrl: "data:,",
          duration: "10m 0s",
          gameScore: "50:49",
          gameSubScore: null,
          startTime: "2024-12-31T23:50:00.000Z",
          endTime: "2025-01-01T00:00:00.000Z",
          rawMatchStats: null,
          playerXuidToGametag: {},
        },
      ],
      substitutions: [],
      seriesScore: "1:0",
      medalMetadata: {},
      playersAssociationData: {},
    },
    ...overrides,
  };
}

describe("LiveTrackerContext", () => {
  it("throws error when hooks used outside provider", () => {
    expect(() => {
      renderHook(() => useTrackerInfo());
    }).toThrow("useLiveTrackerContext must be used within LiveTrackerProvider");
  });

  it("provides tracker info to hooks", () => {
    const model = aFakeLiveTrackerViewModelWith();

    const { result } = renderHook(() => useTrackerInfo(), {
      wrapper: ({ children }) => (
        <LiveTrackerProvider params={defaultParams} model={model} allMatchStats={[]} seriesStats={null}>
          {children}
        </LiveTrackerProvider>
      ),
    });

    expect(result.current.title).toBe("Test Guild");
    expect(result.current.subtitle).toBe("Queue 5");
    expect(result.current.iconUrl).toBe("data:,");
    expect(result.current.statusText).toBe("active");
    expect(result.current.statusClassName).toBe("status-active");
  });

  it("provides tracker state to hooks", () => {
    const model = aFakeLiveTrackerViewModelWith();

    const { result } = renderHook(() => useTrackerState(), {
      wrapper: ({ children }) => (
        <LiveTrackerProvider params={defaultParams} model={model} allMatchStats={[]} seriesStats={null}>
          {children}
        </LiveTrackerProvider>
      ),
    });

    expect.assertions(3);
    expect(result.current?.type).toBe("neatqueue");
    if (result.current?.type === "neatqueue") {
      expect(result.current.guildName).toBe("Test Guild");
      expect(result.current.status).toBe("active");
    }
  });

  it("provides teams to hooks", () => {
    const model = aFakeLiveTrackerViewModelWith();

    const { result } = renderHook(() => useTrackerTeams(), {
      wrapper: ({ children }) => (
        <LiveTrackerProvider params={defaultParams} model={model} allMatchStats={[]} seriesStats={null}>
          {children}
        </LiveTrackerProvider>
      ),
    });

    expect(result.current?.length).toBe(1);
    expect(result.current?.[0]?.name).toBe("Team 1");
  });

  it("returns null for teams when state is null", () => {
    const model = aFakeLiveTrackerViewModelWith({ state: null });

    const { result } = renderHook(() => useTrackerTeams(), {
      wrapper: ({ children }) => (
        <LiveTrackerProvider params={defaultParams} model={model} allMatchStats={[]} seriesStats={null}>
          {children}
        </LiveTrackerProvider>
      ),
    });

    expect(result.current).toBeNull();
  });

  it("provides matches to hooks", () => {
    const model = aFakeLiveTrackerViewModelWith();

    const { result } = renderHook(() => useTrackerMatches(), {
      wrapper: ({ children }) => (
        <LiveTrackerProvider params={defaultParams} model={model} allMatchStats={[]} seriesStats={null}>
          {children}
        </LiveTrackerProvider>
      ),
    });

    expect(result.current?.length).toBe(1);
    expect(result.current?.[0]?.matchId).toBe("match1");
  });

  it("returns null for matches when state is null", () => {
    const model = aFakeLiveTrackerViewModelWith({ state: null });

    const { result } = renderHook(() => useTrackerMatches(), {
      wrapper: ({ children }) => (
        <LiveTrackerProvider params={defaultParams} model={model} allMatchStats={[]} seriesStats={null}>
          {children}
        </LiveTrackerProvider>
      ),
    });

    expect(result.current).toBeNull();
  });

  it("provides players association data to hooks", () => {
    const playersData: Record<string, PlayerAssociationData> = {
      player1: {
        discordId: "player1",
        discordName: "Player One",
        xboxId: "xbox1",
        gamertag: "GamerOne",
        currentRank: 1500,
        currentRankTier: "Onyx",
        currentRankSubTier: 0,
        currentRankMeasurementMatchesRemaining: null,
        currentRankInitialMeasurementMatches: null,
        allTimePeakRank: 1600,
        esra: 1550,
        lastRankedGamePlayed: "2025-01-01T00:00:00.000Z",
      },
    };

    const defaultState = aFakeLiveTrackerViewModelWith().state;
    const model = aFakeLiveTrackerViewModelWith({
      state: defaultState
        ? {
            ...defaultState,
            playersAssociationData: playersData,
          }
        : undefined,
    });

    const { result } = renderHook(() => useTrackerPlayersData(), {
      wrapper: ({ children }) => (
        <LiveTrackerProvider params={defaultParams} model={model} allMatchStats={[]} seriesStats={null}>
          {children}
        </LiveTrackerProvider>
      ),
    });

    expect(result.current?.player1.gamertag).toBe("GamerOne");
  });

  it("provides series score to hooks", () => {
    const model = aFakeLiveTrackerViewModelWith();

    const { result } = renderHook(() => useSeriesScore(), {
      wrapper: ({ children }) => (
        <LiveTrackerProvider params={defaultParams} model={model} allMatchStats={[]} seriesStats={null}>
          {children}
        </LiveTrackerProvider>
      ),
    });

    expect(result.current).toBe("1:0");
  });

  it("returns null for series score when state is null", () => {
    const model = aFakeLiveTrackerViewModelWith({ state: null });

    const { result } = renderHook(() => useSeriesScore(), {
      wrapper: ({ children }) => (
        <LiveTrackerProvider params={defaultParams} model={model} allMatchStats={[]} seriesStats={null}>
          {children}
        </LiveTrackerProvider>
      ),
    });

    expect(result.current).toBeNull();
  });

  it("provides all match stats to hooks", () => {
    const allMatchStats = [
      { matchId: "match1", data: [] },
      { matchId: "match2", data: [] },
    ];

    const model = aFakeLiveTrackerViewModelWith();

    const { result } = renderHook(() => useAllMatchStats(), {
      wrapper: ({ children }) => (
        <LiveTrackerProvider params={defaultParams} model={model} allMatchStats={allMatchStats} seriesStats={null}>
          {children}
        </LiveTrackerProvider>
      ),
    });

    expect(result.current.length).toBe(2);
    expect(result.current[0]?.matchId).toBe("match1");
  });

  it("provides series stats to hooks", () => {
    const seriesStats = {
      teamData: [],
      playerData: [],
      metadata: null,
    };

    const model = aFakeLiveTrackerViewModelWith();

    const { result } = renderHook(() => useSeriesStats(), {
      wrapper: ({ children }) => (
        <LiveTrackerProvider params={defaultParams} model={model} allMatchStats={[]} seriesStats={seriesStats}>
          {children}
        </LiveTrackerProvider>
      ),
    });

    expect(result.current).toEqual(seriesStats);
  });

  it("provides match by index to hooks", () => {
    const model = aFakeLiveTrackerViewModelWith();

    const { result } = renderHook(() => useMatchByIndex(0), {
      wrapper: ({ children }) => (
        <LiveTrackerProvider params={defaultParams} model={model} allMatchStats={[]} seriesStats={null}>
          {children}
        </LiveTrackerProvider>
      ),
    });

    expect(result.current?.matchId).toBe("match1");
  });

  it("returns null for invalid match index", () => {
    const model = aFakeLiveTrackerViewModelWith();

    const { result } = renderHook(() => useMatchByIndex(5), {
      wrapper: ({ children }) => (
        <LiveTrackerProvider params={defaultParams} model={model} allMatchStats={[]} seriesStats={null}>
          {children}
        </LiveTrackerProvider>
      ),
    });

    expect(result.current).toBeNull();
  });

  it("returns null for negative match index", () => {
    const model = aFakeLiveTrackerViewModelWith();

    const { result } = renderHook(() => useMatchByIndex(-1), {
      wrapper: ({ children }) => (
        <LiveTrackerProvider params={defaultParams} model={model} allMatchStats={[]} seriesStats={null}>
          {children}
        </LiveTrackerProvider>
      ),
    });

    expect(result.current).toBeNull();
  });

  it("provides substitutions to hooks", () => {
    const defaultState = aFakeLiveTrackerViewModelWith().state;
    const model = aFakeLiveTrackerViewModelWith({
      state:
        defaultState?.type === "neatqueue"
          ? {
              ...defaultState,
              type: "neatqueue",
              substitutions: [
                {
                  playerInId: "player2",
                  playerInDisplayName: "Player Two",
                  playerOutId: "player1",
                  playerOutDisplayName: "Player One",
                  teamName: "Team 1",
                  timestamp: "2025-01-01T00:05:00.000Z",
                },
              ],
            }
          : defaultState,
    });

    const { result } = renderHook(() => useSubstitutions(), {
      wrapper: ({ children }) => (
        <LiveTrackerProvider params={defaultParams} model={model} allMatchStats={[]} seriesStats={null}>
          {children}
        </LiveTrackerProvider>
      ),
    });

    expect(result.current?.length).toBe(1);
    expect(result.current?.[0]?.playerInId).toBe("player2");
  });

  it("provides match count to hooks", () => {
    const model = aFakeLiveTrackerViewModelWith();

    const { result } = renderHook(() => useMatchCount(), {
      wrapper: ({ children }) => (
        <LiveTrackerProvider params={defaultParams} model={model} allMatchStats={[]} seriesStats={null}>
          {children}
        </LiveTrackerProvider>
      ),
    });

    expect(result.current).toBe(1);
  });

  it("returns 0 for match count when state is null", () => {
    const model = aFakeLiveTrackerViewModelWith({ state: null });

    const { result } = renderHook(() => useMatchCount(), {
      wrapper: ({ children }) => (
        <LiveTrackerProvider params={defaultParams} model={model} allMatchStats={[]} seriesStats={null}>
          {children}
        </LiveTrackerProvider>
      ),
    });

    expect(result.current).toBe(0);
  });

  it("provides has matches flag to hooks", () => {
    const model = aFakeLiveTrackerViewModelWith();

    const { result } = renderHook(() => useHasMatches(), {
      wrapper: ({ children }) => (
        <LiveTrackerProvider params={defaultParams} model={model} allMatchStats={[]} seriesStats={null}>
          {children}
        </LiveTrackerProvider>
      ),
    });

    expect(result.current).toBe(true);
  });

  it("returns false for has matches when state is null", () => {
    const model = aFakeLiveTrackerViewModelWith({ state: null });

    const { result } = renderHook(() => useHasMatches(), {
      wrapper: ({ children }) => (
        <LiveTrackerProvider params={defaultParams} model={model} allMatchStats={[]} seriesStats={null}>
          {children}
        </LiveTrackerProvider>
      ),
    });

    expect(result.current).toBe(false);
  });

  it("returns false for has matches when no matches exist", () => {
    const defaultState = aFakeLiveTrackerViewModelWith().state;
    const model = aFakeLiveTrackerViewModelWith({
      state:
        defaultState?.type === "neatqueue"
          ? {
              ...defaultState,
              type: "neatqueue",
              matches: [],
            }
          : defaultState,
    });

    const { result } = renderHook(() => useHasMatches(), {
      wrapper: ({ children }) => (
        <LiveTrackerProvider params={defaultParams} model={model} allMatchStats={[]} seriesStats={null}>
          {children}
        </LiveTrackerProvider>
      ),
    });

    expect(result.current).toBe(false);
  });

  it("provides tracker identity to hooks", () => {
    const model = aFakeLiveTrackerViewModelWith();

    const { result } = renderHook(() => useTrackerIdentity(), {
      wrapper: ({ children }) => (
        <LiveTrackerProvider params={defaultParams} model={model} allMatchStats={[]} seriesStats={null}>
          {children}
        </LiveTrackerProvider>
      ),
    });

    expect(result.current?.guildId).toBe("Test Guild");
    expect(result.current?.queueNumber).toBe(5);
  });

  it("returns null for tracker identity when state is null", () => {
    const model = aFakeLiveTrackerViewModelWith({ state: null });

    const { result } = renderHook(() => useTrackerIdentity(), {
      wrapper: ({ children }) => (
        <LiveTrackerProvider params={defaultParams} model={model} allMatchStats={[]} seriesStats={null}>
          {children}
        </LiveTrackerProvider>
      ),
    });

    expect(result.current).toBeNull();
  });
});
