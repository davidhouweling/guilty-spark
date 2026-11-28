import "@testing-library/jest-dom/vitest";

import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { sampleLiveTrackerStateMessage } from "@guilty-spark/shared/live-tracker/fakes/data";
import { LiveTrackerApp } from "../../apps/live-tracker/create";
import * as liveServices from "../../apps/live-tracker/services";
import * as archiveServices from "../../apps/discord-series-stats/services";
import {
  aFakeDiscordSeriesStatsAppServicesWith,
  aFakeForbiddenDiscordSeriesStatsDetailResultWith,
  aFakeNotFoundDiscordSeriesStatsDetailResultWith,
  aFakePendingDiscordSeriesStatsDetailResultWith,
} from "../../apps/discord-series-stats/fakes/create.fake";
import { RealLiveTrackerService } from "../../services/live-tracker/live-tracker";
import { resolveSeriesSource } from "../../services/live-tracker/resolve-series-source";
import { aFakeLiveTrackerServiceWith } from "../../services/live-tracker/fakes/live-tracker.fake";
import { aFakeLiveTrackerScenarioWith } from "../../services/live-tracker/fakes/scenario";

vi.mock("../../components/icons/team-icon", () => ({
  TeamIcon: (): React.ReactNode => <div>Team</div>,
}));

const identity = { type: "team", guildId: "123", queueNumber: "5" } as const;
const apiHost = "http://example.local";

class TestWebSocket {
  public static current: TestWebSocket | null = null;
  public onerror?: (event: Event) => void;
  public onclose?: (event: CloseEvent) => void;
  public constructor() {
    TestWebSocket.current = this;
  }
  public close = vi.fn();
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  TestWebSocket.current = null;
});

async function installRealTracker(): Promise<void> {
  const services = await liveServices.installServices(apiHost);
  vi.spyOn(liveServices, "installServices").mockResolvedValue({
    ...services,
    liveTrackerService: new RealLiveTrackerService({ apiHost, detectStopped: true }),
  });
  vi.stubGlobal("WebSocket", TestWebSocket);
}

describe("canonical live-to-archive race", () => {
  it.each([
    ["absent", new Response(null, { status: 404 })],
    ["stopped", Response.json({ state: { status: "stopped" } })],
  ])("falls back after SSR selected live and preflight finds %s", async (_label, preflight) => {
    await installRealTracker();
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ state: { status: "active" } }))
      .mockResolvedValueOnce(preflight);
    const archive = aFakeDiscordSeriesStatsAppServicesWith();
    const getDetail = vi.spyOn(archive.discordSeriesStatsService, "getDetail");
    vi.spyOn(archiveServices, "installServices").mockResolvedValue(archive);
    expect(await resolveSeriesSource(apiHost, identity.guildId, identity.queueNumber, vi.fn())).toEqual({
      source: "live",
    });
    const url = "/stats/discord/123/5?viewMode=wide#matches";
    window.history.pushState({}, "", url);
    render(<LiveTrackerApp apiHost={apiHost} identity={identity} />);
    expect(await screen.findByRole("heading", { name: "Series overview" })).toBeInTheDocument();
    expect(getDetail).toHaveBeenCalledWith("123", "5");
    expect(window.location.pathname + window.location.search + window.location.hash).toBe(url);
  });
  it.each([
    [aFakePendingDiscordSeriesStatsDetailResultWith(), "Stats are still indexing. Retry in 9s."],
    [aFakeForbiddenDiscordSeriesStatsDetailResultWith(), /Access forbidden/],
    [aFakeNotFoundDiscordSeriesStatsDetailResultWith(), /Queue not found/],
  ])("preserves archive result states after disappearance", async (result, message) => {
    await installRealTracker();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 404 }));
    vi.spyOn(archiveServices, "installServices").mockResolvedValue(aFakeDiscordSeriesStatsAppServicesWith(result));
    render(<LiveTrackerApp apiHost={apiHost} identity={identity} />);
    expect(await screen.findByText(message)).toBeInTheDocument();
  });
  it("shows archive errors after disappearance", async () => {
    await installRealTracker();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 404 }));
    const archive = aFakeDiscordSeriesStatsAppServicesWith();
    vi.spyOn(archive.discordSeriesStatsService, "getDetail").mockRejectedValue(new Error("archive failed"));
    vi.spyOn(archiveServices, "installServices").mockResolvedValue(archive);
    render(<LiveTrackerApp apiHost={apiHost} identity={identity} />);
    expect(await screen.findByText("Failed to load stats")).toBeInTheDocument();
  });
  it.each([403, 500, "transport"])("does not fall back for preflight failure %s", async (failure) => {
    await installRealTracker();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    if (typeof failure === "number") {
      fetchSpy.mockResolvedValue(new Response(null, { status: failure }));
    } else {
      fetchSpy.mockRejectedValue(new Error("offline"));
    }
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const archive = vi.spyOn(archiveServices, "installServices");
    render(<LiveTrackerApp apiHost={apiHost} identity={identity} />);
    expect(await screen.findByText("Unable to connect to tracker")).toBeInTheDocument();
    expect(archive).not.toHaveBeenCalled();
  });
  it("does not fall back for an ordinary WebSocket error", async () => {
    await installRealTracker();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ state: { status: "active" } }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const archive = vi.spyOn(archiveServices, "installServices");
    render(<LiveTrackerApp apiHost={apiHost} identity={identity} />);
    await waitFor((): void => {
      expect(TestWebSocket.current?.onerror).toBeDefined();
    });
    TestWebSocket.current?.onerror?.(new Event("error"));
    expect(await screen.findByText("Unable to connect to tracker")).toBeInTheDocument();
    expect(archive).not.toHaveBeenCalled();
  });
  it.each([
    ["absent after error and close", new Response(null, { status: 404 }), true],
    ["stopped after close", Response.json({ state: { status: "stopped" } }), false],
  ])("falls back when the recheck finds %s", async (_label, status, emitError) => {
    await installRealTracker();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ state: { status: "active" } }))
      .mockResolvedValueOnce(status);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const archive = aFakeDiscordSeriesStatsAppServicesWith();
    const getDetail = vi.spyOn(archive.discordSeriesStatsService, "getDetail");
    vi.spyOn(archiveServices, "installServices").mockResolvedValue(archive);
    render(<LiveTrackerApp apiHost={apiHost} identity={identity} />);
    await waitFor(() => {
      expect(TestWebSocket.current?.onerror).toBeDefined();
    });
    if (emitError) {
      TestWebSocket.current?.onerror?.(new Event("error"));
    }
    TestWebSocket.current?.onclose?.(new CloseEvent("close", { code: 1006 }));
    expect(await screen.findByRole("heading", { name: "Series overview" })).toBeInTheDocument();
    expect(getDetail).toHaveBeenCalledWith("123", "5");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
  it.each([403, 500, "transport"])("does not fall back when a socket failure recheck fails: %s", async (failure) => {
    await installRealTracker();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ state: { status: "active" } }));
    if (typeof failure === "number") {
      fetchSpy.mockResolvedValueOnce(new Response(null, { status: failure }));
    } else {
      fetchSpy.mockRejectedValueOnce(new Error("offline"));
    }
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const archive = vi.spyOn(archiveServices, "installServices");
    render(<LiveTrackerApp apiHost={apiHost} identity={identity} />);
    await waitFor(() => {
      expect(TestWebSocket.current?.onerror).toBeDefined();
    });
    TestWebSocket.current?.onerror?.(new Event("error"));
    expect(await screen.findByText("Unable to connect to tracker")).toBeInTheDocument();
    expect(archive).not.toHaveBeenCalled();
  });
  it("keeps the legacy alias not-found behavior", async () => {
    await installRealTracker();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 404 }));
    const archive = vi.spyOn(archiveServices, "installServices");
    window.history.pushState({}, "", "/tracker?server=123&queue=5");
    render(<LiveTrackerApp apiHost={apiHost} />);
    expect(
      await screen.findByText("No active tracker found for this queue. Start a tracker first."),
    ).toBeInTheDocument();
    expect(archive).not.toHaveBeenCalled();
  });
  it("retains a first stopped snapshot instead of switching to archive", async () => {
    const services = await liveServices.installServices(apiHost);
    const scenario = aFakeLiveTrackerScenarioWith({
      frames: [
        { ...sampleLiveTrackerStateMessage, data: { ...sampleLiveTrackerStateMessage.data, status: "stopped" } },
      ],
    });
    vi.spyOn(liveServices, "installServices").mockResolvedValue({
      ...services,
      liveTrackerService: aFakeLiveTrackerServiceWith({ scenario }),
    });
    const archive = vi.spyOn(archiveServices, "installServices");
    render(<LiveTrackerApp apiHost={apiHost} identity={identity} />);
    expect(await screen.findByText("Tracker Stopped", { selector: "span" })).toBeInTheDocument();
    expect(archive).not.toHaveBeenCalled();
  });
  it("does not switch to archive when unmounted before preflight completes", async () => {
    await installRealTracker();
    let finish: ((response: Response) => void) | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        await new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const archive = vi.spyOn(archiveServices, "installServices");
    const rendered = render(<LiveTrackerApp apiHost={apiHost} identity={identity} />);
    await waitFor((): void => {
      expect(finish).toBeDefined();
    });
    rendered.unmount();
    finish?.(new Response(null, { status: 404 }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(archive).not.toHaveBeenCalled();
  });
});
