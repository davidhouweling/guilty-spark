import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { DiscordSeriesStatsApp } from "../create";
import containerStyles from "../../../components/container/container.module.css";
import { aFakeSeriesDetailWithTeamSwap } from "../../../components/series-stats/fakes/series-detail-team-swap.fake";
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
  it("opens settings from the cog and closes with the close button, Escape and backdrop", async () => {
    mockInstallServices.mockResolvedValue(aFakeDiscordSeriesStatsAppServicesWith());
    render(
      <DiscordSeriesStatsApp apiHost="https://api.example.test" guildId="123456789012345678" queueNumber="7777" />,
    );
    const trigger = await screen.findByRole("button", { name: "Open series settings" });
    expect(trigger.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Series Settings" });
    expect(dialog).toHaveFocus();
    expect(screen.getByLabelText("Title")).toBeInTheDocument();
    expect(screen.getByLabelText("Subtitle")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Team Colors" })).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "Team Names" })).toBeInTheDocument();
    expect(screen.queryByText(/Streamer Overlay|Share Settings/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("heading", { name: "Series title" }));
    expect(dialog).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close Series Settings" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByLabelText("Title"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(trigger);
    const overlay = screen.getByRole("dialog").parentElement;
    expect(overlay).not.toBeNull();
    if (overlay !== null) {
      fireEvent.mouseDown(overlay);
    }
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  function installSwappedSeries(): void {
    mockInstallServices.mockResolvedValue(
      aFakeDiscordSeriesStatsAppServicesWith({
        ...aFakeResolvedDiscordSeriesStatsDetailResultWith(),
        data: aFakeSeriesDetailWithTeamSwap(),
      }),
    );
  }

  it("uses default observer colors across swapped match sides", async () => {
    installSwappedSeries();
    render(
      <DiscordSeriesStatsApp apiHost="https://api.example.test" guildId="123456789012345678" queueNumber="7777" />,
    );

    expect(await screen.findByRole("heading", { name: "Eagle" })).toBeInTheDocument();
    const rowColors = ["match-one", "match-two"].map((id) => {
      const match = document.getElementById(id);
      if (match == null) {
        throw new Error("Missing match");
      }
      const players = within(match).getByRole("table", { name: "Player statistics" });
      return within(players).getByText("Charlie").closest("tr")?.style.getPropertyValue("--row-color");
    });
    expect(rowColors).toEqual(["#3B9DFF", "#3B9DFF"]);
    expect(screen.getByRole("heading", { name: "Eagle" }).closest("section")).toHaveStyle("--team-color: #FE3939");
    expect(screen.getByRole("heading", { name: "Cobra" }).closest("section")).toHaveStyle("--team-color: #3B9DFF");
  });

  it("uses URL observer overrides before stored preferences and preserves player settings when editing", async () => {
    const scrollDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
    Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
    try {
      localStorage.setItem(
        "live-tracker-streamer-settings-global",
        JSON.stringify({
          colors: {
            mode: "player",
            playerView: { selectedPlayerId: "12345", teamColor: "mint", enemyColor: "sky" },
            observerView: { eagleColor: "jade", cobraColor: "lavender" },
          },
        }),
      );
      window.history.replaceState(
        { marker: "kept" },
        "",
        "/?eagleColor=carrot&colorMode=player&selectedPlayerId=url-player&campaign=summer#match-one",
      );
      installSwappedSeries();
      const app = (
        <DiscordSeriesStatsApp apiHost="https://api.example.test" guildId="123456789012345678" queueNumber="7777" />
      );
      const { unmount } = render(app);

      expect(await screen.findByRole("heading", { name: "Eagle" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Eagle" }).closest("section")).toHaveStyle("--team-color: #DC5839");
      expect(screen.getByRole("heading", { name: "Cobra" }).closest("section")).toHaveStyle("--team-color: #8F67AA");
      expect(screen.queryByRole("heading", { name: "Team Colors" })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Open series settings" }));
      expect(within(screen.getByRole("dialog")).getByRole("heading", { name: "Team Colors" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Player View" })).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Select Your Player")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Select Cobra team color" }));
      fireEvent.click(screen.getByRole("button", { name: "Sky" }));

      expect(screen.getByRole("heading", { name: "Cobra" }).closest("section")).toHaveStyle("--team-color: #49B8FE");
      const rowColors = ["match-one", "match-two"].map((id) => {
        const match = document.getElementById(id);
        if (match == null) {
          throw new Error("Missing match");
        }
        const players = within(match).getByRole("table", { name: "Player statistics" });
        return within(players).getByText("Charlie").closest("tr")?.style.getPropertyValue("--row-color");
      });
      expect(rowColors).toEqual(["#49B8FE", "#49B8FE"]);
      const saved = JSON.parse(localStorage.getItem("live-tracker-streamer-settings-global") ?? "{}");
      expect(saved).toMatchObject({
        colors: {
          mode: "player",
          playerView: { selectedPlayerId: "12345", teamColor: "mint", enemyColor: "sky" },
          observerView: { eagleColor: "jade", cobraColor: "sky" },
        },
      });
      const url = new URL(window.location.href);
      expect(url.searchParams.get("eagleColor")).toBe("carrot");
      expect(url.searchParams.get("cobraColor")).toBe("sky");
      expect(url.searchParams.get("colorMode")).toBe("player");
      expect(url.searchParams.get("selectedPlayerId")).toBe("url-player");
      expect(url.searchParams.get("campaign")).toBe("summer");
      expect(url.hash).toBe("#match-one");
      expect(window.history.state).toEqual({ marker: "kept" });
      unmount();
      render(app);
      expect((await screen.findByRole("heading", { name: "Cobra" })).closest("section")).toHaveStyle(
        "--team-color: #49B8FE",
      );
    } finally {
      if (scrollDescriptor == null) {
        Reflect.deleteProperty(Element.prototype, "scrollIntoView");
      } else {
        Object.defineProperty(Element.prototype, "scrollIntoView", scrollDescriptor);
      }
    }
  });

  it("retains default colors and hides unsupported controls when series sides are ambiguous", async () => {
    const data = aFakeSeriesDetailWithTeamSwap();
    const results = data.matches.results.map((result) =>
      result.status === "resolved"
        ? {
            ...result,
            detail: { ...result.detail, teams: result.detail.teams.map((team) => ({ ...team, seriesTeamId: null })) },
          }
        : result,
    );
    window.history.replaceState({}, "", "/?eagleColor=jade");
    mockInstallServices.mockResolvedValue(
      aFakeDiscordSeriesStatsAppServicesWith({
        ...aFakeResolvedDiscordSeriesStatsDetailResultWith(),
        data: {
          ...data,
          matches: { ...data.matches, results },
          aggregation: { status: "unavailable", reason: "ambiguous-team-mapping" },
        },
      }),
    );
    render(
      <DiscordSeriesStatsApp apiHost="https://api.example.test" guildId="123456789012345678" queueNumber="7777" />,
    );

    expect(
      await screen.findByText("Series totals are unavailable because team identities could not be matched reliably."),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cobra" }).closest("section")).toHaveStyle("--team-color: #FE3939");
    fireEvent.click(screen.getByRole("button", { name: "Open series settings" }));
    expect(
      screen.getByText("Team colors cannot be customized because stable series teams are unavailable."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Select Eagle team color" })).not.toBeInTheDocument();
  });

  it("applies, edits, clears and restores stable team-name overrides through the URL", async () => {
    const storedSettings = JSON.stringify({ colors: { mode: "player", observerView: { eagleColor: "jade" } } });
    localStorage.setItem("live-tracker-streamer-settings-global", storedSettings);
    window.history.replaceState(
      { marker: "kept" },
      "",
      "/stats/discord/123456789012345678/7777?title=&eagleTeamName=URL+Eagles&cobraTeamName=URL+Cobras&disableTeamPlayerNames=true&campaign=summer#match-one",
    );
    installSwappedSeries();

    const app = (
      <DiscordSeriesStatsApp apiHost="https://api.example.test" guildId="123456789012345678" queueNumber="7777" />
    );
    const { unmount } = render(app);

    const firstTeamHeading = await screen.findByRole("heading", { name: "URL Eagles" });
    const secondTeamHeading = screen.getByRole("heading", { name: "URL Cobras" });
    expect(
      within(Preconditions.checkExists(firstTeamHeading.closest("section"))).getByText("Bravo"),
    ).toBeInTheDocument();
    expect(
      within(Preconditions.checkExists(secondTeamHeading.closest("section"))).getByText("Alpha"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Team 1 Name")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open series settings" }));
    expect(screen.getByLabelText("Team 1 Name")).toHaveValue("URL Eagles");
    expect(screen.getByRole("button", { name: "Select URL Eagles team color" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select URL Cobras team color" })).toBeInTheDocument();
    expect(screen.getByText("These names apply to overview cards and match Timeline labels.")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /player names/i })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Team 1 Name"), { target: { value: "Finals" } });
    fireEvent.change(screen.getByLabelText("Team 2 Name"), { target: { value: "" } });

    expect(screen.getByRole("heading", { name: "Finals" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cobra" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select Finals team color" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select Cobra team color" })).toBeInTheDocument();
    let url = new URL(window.location.href);
    expect(url.searchParams.get("eagleTeamName")).toBe("Finals");
    expect(url.searchParams.has("cobraTeamName")).toBe(false);
    expect(url.searchParams.has("title")).toBe(true);
    expect(url.searchParams.get("title")).toBe("");
    expect(url.searchParams.get("disableTeamPlayerNames")).toBe("true");
    expect(url.searchParams.get("campaign")).toBe("summer");
    expect(url.hash).toBe("#match-one");
    expect(window.history.state).toEqual({ marker: "kept" });
    expect(localStorage.getItem("live-tracker-streamer-settings-global")).toBe(storedSettings);

    unmount();
    render(app);
    expect(await screen.findByRole("heading", { name: "Finals" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cobra" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open series settings" }));
    fireEvent.change(screen.getByLabelText("Team 1 Name"), { target: { value: "" } });
    expect(screen.getByRole("heading", { name: "Eagle" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select Eagle team color" })).toBeInTheDocument();
    url = new URL(window.location.href);
    expect(url.searchParams.has("eagleTeamName")).toBe(false);
    expect(url.searchParams.has("cobraTeamName")).toBe(false);
    expect(url.searchParams.get("campaign")).toBe("summer");
    expect(url.hash).toBe("#match-one");
    expect(localStorage.getItem("live-tracker-streamer-settings-global")).toBe(storedSettings);
  });

  it("retains default team names when the stable mapping is ambiguous", async () => {
    const data = aFakeSeriesDetailWithTeamSwap();
    const results = data.matches.results.map((result) =>
      result.status === "resolved"
        ? {
            ...result,
            detail: { ...result.detail, teams: result.detail.teams.map((team) => ({ ...team, seriesTeamId: null })) },
          }
        : result,
    );
    window.history.replaceState({}, "", "/?eagleTeamName=Custom+One&cobraTeamName=Custom+Two");
    mockInstallServices.mockResolvedValue(
      aFakeDiscordSeriesStatsAppServicesWith({
        ...aFakeResolvedDiscordSeriesStatsDetailResultWith(),
        data: {
          ...data,
          matches: { ...data.matches, results },
          aggregation: { status: "unavailable", reason: "ambiguous-team-mapping" },
        },
      }),
    );

    render(
      <DiscordSeriesStatsApp apiHost="https://api.example.test" guildId="123456789012345678" queueNumber="7777" />,
    );

    expect(await screen.findByRole("heading", { name: "Eagle" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cobra" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Custom One" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open series settings" }));
    expect(
      screen.getByText("Team names cannot be customized because stable series teams are unavailable."),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Team 1 Name")).not.toBeInTheDocument();
  });

  it("retains default team names when a match in the series is unavailable", async () => {
    const data = aFakeSeriesDetailWithTeamSwap();
    const resolved = data.matches.results.find((result) => result.status === "resolved");
    const first = Preconditions.checkExists(resolved, "Expected a resolved match");
    window.history.replaceState({}, "", "/?eagleTeamName=Custom+One&cobraTeamName=Custom+Two");
    mockInstallServices.mockResolvedValue(
      aFakeDiscordSeriesStatsAppServicesWith({
        ...aFakeResolvedDiscordSeriesStatsDetailResultWith(),
        data: {
          ...data,
          matches: {
            matchIds: [first.matchId, "missing"],
            results: [first, { status: "unavailable", matchId: "missing", reason: "not-found" }],
          },
          aggregation: { status: "unavailable", reason: "incomplete-matches" },
        },
      }),
    );

    render(
      <DiscordSeriesStatsApp apiHost="https://api.example.test" guildId="123456789012345678" queueNumber="7777" />,
    );

    expect(await screen.findByRole("heading", { name: "Eagle" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cobra" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Custom One" })).not.toBeInTheDocument();
  });

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

    fireEvent.click(screen.getByRole("button", { name: "Open series settings" }));
    const dialog = screen.getByRole("dialog", { name: "Series Settings" });
    expect(screen.getByRole("button", { name: "Narrow View" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: /Streamer View/ })).not.toBeInTheDocument();
    const wideButton = screen.getByRole("button", { name: "Wide View" });
    wideButton.focus();
    fireEvent.click(wideButton);

    expect(screen.getByRole("dialog", { name: "Series Settings" })).toBe(dialog);
    expect(wideButton).toHaveFocus();
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
    fireEvent.click(screen.getByRole("button", { name: "Open series settings" }));
    expect(screen.getByRole("button", { name: "Wide View" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: /Streamer View/ })).not.toBeInTheDocument();
    expect(localStorage.getItem("live-tracker-streamer-settings-global")).toBe(legacySettings);
  });

  it("applies, edits, clears and restores series title overrides through the URL", async () => {
    const storedSettings = JSON.stringify({ colors: { mode: "player", observerView: { eagleColor: "jade" } } });
    localStorage.setItem("live-tracker-streamer-settings-global", storedSettings);
    window.history.replaceState(
      { marker: "kept" },
      "",
      "/stats/discord/123456789012345678/7777?title=Finals&subtitle=Season+1&viewMode=standard&campaign=summer#match-one",
    );
    mockInstallServices.mockResolvedValue(aFakeDiscordSeriesStatsAppServicesWith());

    const app = (
      <DiscordSeriesStatsApp apiHost="https://api.example.test" guildId="123456789012345678" queueNumber="7777" />
    );
    const { unmount } = render(app);

    expect(await screen.findByRole("heading", { name: "Finals" })).toBeInTheDocument();
    expect(screen.getByText("Season 1")).toBeInTheDocument();
    expect(document.title).toContain("Finals");
    fireEvent.click(screen.getByRole("button", { name: "Open series settings" }));
    expect(screen.getByLabelText("Title")).toHaveValue("Finals");
    expect(screen.getByLabelText("Subtitle")).toHaveValue("Season 1");
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Championship" } });
    fireEvent.change(screen.getByLabelText("Subtitle"), { target: { value: "" } });

    expect(screen.getByRole("heading", { name: "Championship" })).toBeInTheDocument();
    expect(screen.getByText("Guild 123456789012345678")).toBeInTheDocument();
    const url = new URL(window.location.href);
    expect(url.searchParams.get("title")).toBe("Championship");
    expect(url.searchParams.has("subtitle")).toBe(false);
    expect(url.searchParams.get("viewMode")).toBe("standard");
    expect(url.searchParams.get("campaign")).toBe("summer");
    expect(url.hash).toBe("#match-one");
    expect(window.history.state).toEqual({ marker: "kept" });
    expect(localStorage.getItem("live-tracker-streamer-settings-global")).toBe(storedSettings);

    unmount();
    render(app);
    expect(await screen.findByRole("heading", { name: "Championship" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open series settings" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "" } });
    expect(screen.getByRole("heading", { name: "Queue #7777 Series Stats" })).toBeInTheDocument();
    expect(new URL(window.location.href).searchParams.has("title")).toBe(false);
  });

  it("renders pending message when stats are indexing", async () => {
    window.history.replaceState({}, "", "/?title=Custom&subtitle=Custom");
    mockInstallServices.mockResolvedValue({
      ...aFakeDiscordSeriesStatsAppServicesWith(aFakePendingDiscordSeriesStatsDetailResultWith()),
    });

    render(
      <DiscordSeriesStatsApp apiHost="https://api.example.test" guildId="123456789012345678" queueNumber="7777" />,
    );

    expect(await screen.findByText("Stats are still indexing. Retry in 9s.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open series settings" })).not.toBeInTheDocument();
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
