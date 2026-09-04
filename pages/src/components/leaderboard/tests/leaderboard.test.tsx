import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it } from "vitest";
import { LeaderboardMetric, LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
import { cleanup, render, screen } from "@testing-library/react";
import { Leaderboard } from "../leaderboard";
import type { LeaderboardViewModel } from "../types";

function aLeaderboardViewModelWith(rows: LeaderboardViewModel["rows"]): LeaderboardViewModel {
  return {
    state: "loaded",
    title: "Leaderboard",
    scopeLabel: "Test Server / All configured queues",
    windowLabel: "12M",
    metricLabel: "Kills",
    rows,
    queueOptions: [{ value: "all", label: "All configured queues" }],
    windowOptions: [{ value: LeaderboardWindow.TwelveMonths, label: "12 months" }],
    metricGroups: [{ label: "Total", options: [{ value: LeaderboardMetric.Kills, label: "Kills" }] }],
    selectedQueueChannelId: null,
    selectedWindow: LeaderboardWindow.TwelveMonths,
    selectedMetric: LeaderboardMetric.Kills,
    onQueueChange: (): void => void 0,
    onWindowChange: (): void => void 0,
    onMetricChange: (): void => void 0,
  };
}

describe("Leaderboard", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows a loading state instead of an empty rankings table while fetching", () => {
    render(<Leaderboard {...aLeaderboardViewModelWith([])} state="loading" />);

    expect(screen.getByText("Loading leaderboard...")).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Leaderboard rankings" })).not.toBeInTheDocument();
  });

  it("explains when no players qualify for the selected view", () => {
    render(<Leaderboard {...aLeaderboardViewModelWith([])} />);

    expect(screen.getByRole("heading", { name: "No qualifying players" })).toBeInTheDocument();
    expect(
      screen.getByText("No players match this leaderboard's selected queue, stat, and time window."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Leaderboard rankings" })).not.toBeInTheDocument();
  });
});
