import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { DiscordSeriesStatsApp } from "../create";
import containerStyles from "../../../components/container/container.module.css";
import {
  aFakeDiscordSeriesStatsAppServicesWith,
  aFakeForbiddenDiscordSeriesStatsDetailResultWith,
  aFakeNotFoundDiscordSeriesStatsDetailResultWith,
  aFakePendingDiscordSeriesStatsDetailResultWith,
  aFakeResolvedDiscordSeriesStatsDetailResultWith,
} from "../fakes/create.fake";

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

vi.mock("../../../components/icons/team-icon", () => ({
  TeamIcon: ({ teamId }: { teamId: number }): ReactNode => <div>Team {teamId.toString()}</div>,
}));

vi.mock("../../../components/icons/medal-icon", () => ({
  MedalIcon: ({ medalName }: { medalName: string }): ReactNode => <div>{medalName}</div>,
}));

afterEach(() => {
  cleanup();
  mockInstallServices.mockReset();
  localStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("DiscordSeriesStatsApp", () => {
  it("loads and renders resolved queue stats", async () => {
    mockInstallServices.mockResolvedValue(aFakeDiscordSeriesStatsAppServicesWith());

    render(
      <DiscordSeriesStatsApp apiHost="https://api.example.test" guildId="123456789012345678" queueNumber="7777" />,
    );

    expect(await screen.findByRole("heading", { name: "Series overview" })).toBeInTheDocument();
    const matchesHeading = screen.getByRole("heading", { name: "Matches" });
    expect(matchesHeading).toBeInTheDocument();
    expect(matchesHeading.closest(`.${containerStyles.container}`)).toHaveClass(containerStyles.wide);
  });

  it("applies the URL-selected narrow layout and changes only the view mode URL parameter", async () => {
    const legacySettings = JSON.stringify({ viewMode: "wide" });
    localStorage.setItem("live-tracker-streamer-settings-global", legacySettings);
    window.history.replaceState(
      {},
      "",
      "/stats/discord/123456789012345678/7777?viewMode=standard&campaign=summer#match-one",
    );
    mockInstallServices.mockResolvedValue(aFakeDiscordSeriesStatsAppServicesWith());

    render(
      <DiscordSeriesStatsApp apiHost="https://api.example.test" guildId="123456789012345678" queueNumber="7777" />,
    );

    const matchesHeading = await screen.findByRole("heading", { name: "Matches" });
    const matchesContainer = matchesHeading.closest(`.${containerStyles.container}`);
    expect(matchesContainer).not.toHaveClass(containerStyles.wide);

    fireEvent.click(screen.getByRole("button", { name: "Change view mode" }));
    expect(screen.getByRole("button", { name: "Narrow View" })).toHaveAttribute("data-selected", "true");
    expect(screen.queryByRole("button", { name: /Streamer View/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Wide View" }));

    expect(matchesContainer).toHaveClass(containerStyles.wide);
    expect(new URL(window.location.href).searchParams.get("viewMode")).toBe("wide");
    expect(new URL(window.location.href).searchParams.get("campaign")).toBe("summer");
    expect(window.location.hash).toBe("#match-one");
    expect(localStorage.getItem("live-tracker-streamer-settings-global")).toBe(legacySettings);
  });

  it("keeps the existing wide default and does not restore or rewrite legacy stored view modes", async () => {
    const legacySettings = JSON.stringify({ viewMode: "standard", colors: { mode: "player" } });
    localStorage.setItem("live-tracker-streamer-settings-global", legacySettings);
    window.history.replaceState({}, "", "/stats/discord/123456789012345678/7777?viewMode=streamer");
    mockInstallServices.mockResolvedValue(aFakeDiscordSeriesStatsAppServicesWith());

    render(
      <DiscordSeriesStatsApp apiHost="https://api.example.test" guildId="123456789012345678" queueNumber="7777" />,
    );

    const matchesHeading = await screen.findByRole("heading", { name: "Matches" });
    expect(matchesHeading.closest(`.${containerStyles.container}`)).toHaveClass(containerStyles.wide);
    fireEvent.click(screen.getByRole("button", { name: "Change view mode" }));
    expect(screen.getByRole("button", { name: "Wide View" })).toHaveAttribute("data-selected", "true");
    expect(screen.queryByRole("button", { name: /Streamer View/ })).not.toBeInTheDocument();
    expect(localStorage.getItem("live-tracker-streamer-settings-global")).toBe(legacySettings);
  });

  it("renders pending message when stats are indexing", async () => {
    mockInstallServices.mockResolvedValue({
      ...aFakeDiscordSeriesStatsAppServicesWith(aFakePendingDiscordSeriesStatsDetailResultWith()),
    });

    render(
      <DiscordSeriesStatsApp apiHost="https://api.example.test" guildId="123456789012345678" queueNumber="7777" />,
    );

    expect(await screen.findByText("Stats are still indexing. Retry in 9s.")).toBeInTheDocument();
  });

  it("renders queue not found state", async () => {
    mockInstallServices.mockResolvedValue({
      ...aFakeDiscordSeriesStatsAppServicesWith(aFakeNotFoundDiscordSeriesStatsDetailResultWith()),
    });

    render(
      <DiscordSeriesStatsApp apiHost="https://api.example.test" guildId="123456789012345678" queueNumber="7777" />,
    );

    expect(await screen.findByText("Queue not found: No matching series overview embeds found")).toBeInTheDocument();
  });

  it("renders access forbidden state", async () => {
    mockInstallServices.mockResolvedValue({
      ...aFakeDiscordSeriesStatsAppServicesWith(aFakeForbiddenDiscordSeriesStatsDetailResultWith()),
    });

    render(
      <DiscordSeriesStatsApp apiHost="https://api.example.test" guildId="123456789012345678" queueNumber="7777" />,
    );

    expect(
      await screen.findByText("Access forbidden: Missing Discord permissions or message content access"),
    ).toBeInTheDocument();
  });

  it("renders error state when fetch fails", async () => {
    const services = aFakeDiscordSeriesStatsAppServicesWith(aFakeResolvedDiscordSeriesStatsDetailResultWith());
    vi.spyOn(services.discordSeriesStatsService, "getDetail").mockRejectedValue(new Error("boom"));
    mockInstallServices.mockResolvedValue(services);

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
