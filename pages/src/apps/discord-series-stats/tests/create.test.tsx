import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type {
  DiscordSeriesStats,
  DiscordSeriesStatsForbidden,
  DiscordSeriesStatsNotFound,
  DiscordSeriesStatsPending,
  DiscordSeriesStatsResolved,
} from "@guilty-spark/shared/contracts/stats/discord-series";
import { DiscordSeriesStatsApp } from "../create";

const { mockInstallServices } = vi.hoisted(() => {
  return {
    mockInstallServices: vi.fn(),
  };
});

vi.mock("../services", () => {
  return {
    installServices: mockInstallServices,
  };
});

afterEach(() => {
  cleanup();
  mockInstallServices.mockReset();
});

function aFakeResolvedDataWith(overrides: Partial<DiscordSeriesStatsResolved> = {}): DiscordSeriesStatsResolved {
  return {
    status: "resolved",
    guildId: "123456789012345678",
    queueNumber: 7777,
    matchIds: ["match-1"],
    renderData: {
      title: "Queue #7777 Series Stats",
      subtitle: "Guild 123456789012345678",
      seriesScore: "1:0",
      teams: [
        { name: "Eagle", players: ["Player One"] },
        { name: "Cobra", players: ["Player Two"] },
      ],
      matches: [
        {
          matchId: "match-1",
          gameTypeAndMap: "Slayer: Live Fire",
          gameVariantCategory: 0,
          gameType: "Slayer",
          gameMap: "Live Fire",
          gameMapThumbnailUrl: "data:,",
          duration: "10m 00s",
          gameScore: "50:45",
          gameSubScore: null,
          startTime: "2026-01-01T00:00:00.000Z",
          endTime: "2026-01-01T00:10:00.000Z",
          playerXuidToGametag: { "xuid-1": "Player One" },
          rawMatch: {},
        },
      ],
    },
    ...overrides,
  };
}

function aFakePendingData(): DiscordSeriesStatsPending {
  return {
    status: "pending-index",
    guildId: "123456789012345678",
    queueNumber: 7777,
    retryAfterSeconds: 9,
  };
}

function aFakeNotFoundData(): DiscordSeriesStatsNotFound {
  return {
    status: "not-found",
    guildId: "123456789012345678",
    queueNumber: 7777,
    reason: "No matching series overview embeds found",
  };
}

function aFakeForbiddenData(): DiscordSeriesStatsForbidden {
  return {
    status: "forbidden",
    guildId: "123456789012345678",
    queueNumber: 7777,
    reason: "Missing Discord permissions or message content access",
  };
}

function aFakeServiceWith(response: DiscordSeriesStats): {
  getStats: () => Promise<{ status: number; data: DiscordSeriesStats; retryAfterSeconds: number | null }>;
} {
  return {
    getStats: async (): Promise<{ status: number; data: DiscordSeriesStats; retryAfterSeconds: number | null }> => {
      return Promise.resolve({
        status:
          response.status === "pending-index"
            ? 503
            : response.status === "not-found"
              ? 404
              : response.status === "forbidden"
                ? 403
                : 200,
        data: response,
        retryAfterSeconds: response.status === "pending-index" ? response.retryAfterSeconds : null,
      });
    },
  };
}

describe("DiscordSeriesStatsApp", () => {
  it("loads and renders resolved queue stats", async () => {
    mockInstallServices.mockResolvedValue({
      discordSeriesStatsService: aFakeServiceWith(aFakeResolvedDataWith()),
    });

    render(
      <DiscordSeriesStatsApp apiHost="https://api.example.test" guildId="123456789012345678" queueNumber="7777" />,
    );

    expect(await screen.findByRole("heading", { name: "Queue #7777 Series Stats" })).toBeInTheDocument();
  });

  it("renders pending message when stats are indexing", async () => {
    mockInstallServices.mockResolvedValue({
      discordSeriesStatsService: aFakeServiceWith(aFakePendingData()),
    });

    render(
      <DiscordSeriesStatsApp apiHost="https://api.example.test" guildId="123456789012345678" queueNumber="7777" />,
    );

    expect(await screen.findByText("Stats are still indexing. Retry in 9s.")).toBeInTheDocument();
  });

  it("renders queue not found state", async () => {
    mockInstallServices.mockResolvedValue({
      discordSeriesStatsService: aFakeServiceWith(aFakeNotFoundData()),
    });

    render(
      <DiscordSeriesStatsApp apiHost="https://api.example.test" guildId="123456789012345678" queueNumber="7777" />,
    );

    expect(await screen.findByText("Queue not found: No matching series overview embeds found")).toBeInTheDocument();
  });

  it("renders access forbidden state", async () => {
    mockInstallServices.mockResolvedValue({
      discordSeriesStatsService: aFakeServiceWith(aFakeForbiddenData()),
    });

    render(
      <DiscordSeriesStatsApp apiHost="https://api.example.test" guildId="123456789012345678" queueNumber="7777" />,
    );

    expect(
      await screen.findByText("Access forbidden: Missing Discord permissions or message content access"),
    ).toBeInTheDocument();
  });

  it("renders error state when fetch fails", async () => {
    mockInstallServices.mockResolvedValue({
      discordSeriesStatsService: {
        getStats: async (): Promise<never> => Promise.reject(new Error("boom")),
      },
    });

    render(
      <DiscordSeriesStatsApp apiHost="https://api.example.test" guildId="123456789012345678" queueNumber="7777" />,
    );

    expect(await screen.findByText("Failed to load stats")).toBeInTheDocument();
  });

  it("renders service installation error state", async () => {
    mockInstallServices.mockRejectedValue(new Error("service failed"));

    render(
      <DiscordSeriesStatsApp apiHost="https://api.example.test" guildId="123456789012345678" queueNumber="7777" />,
    );

    expect(await screen.findByText("Failed to load stats service")).toBeInTheDocument();
  });
});
