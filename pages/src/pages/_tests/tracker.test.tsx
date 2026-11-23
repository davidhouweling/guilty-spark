import "@testing-library/jest-dom/vitest";

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// Mock TeamIcon to avoid PNG import issues in tests
vi.mock("../../components/icons/team-icon", () => ({
  TeamIcon: (): React.ReactNode => <div data-testid="team-icon">Team</div>,
}));

import { LiveTrackerApp } from "../../apps/live-tracker/create";
import * as servicesInstaller from "../../apps/live-tracker/services";

describe("/tracker page wiring", () => {
  it("boots the tracker island via the services installer", async () => {
    window.history.pushState({}, "", "/tracker?server=1&queue=3");

    render(<LiveTrackerApp apiHost="http://example.local" />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Queue\s*#\s*\d+ Live Tracker/i })).toBeInTheDocument();
    });

    expect(screen.getByText(/Dog\s*Crew/i)).toBeInTheDocument();
    expect(screen.getByText(/Status/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Series overview/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Waiting for first match to complete/i)).toBeInTheDocument();
  });

  it("uses canonical identity instead of conflicting legacy parameters without changing the URL", async () => {
    const services = await servicesInstaller.installServices("http://example.local");
    const connect = vi.spyOn(services.liveTrackerService, "connect");
    const install = vi.spyOn(servicesInstaller, "installServices").mockResolvedValue(services);
    const url = "/stats/discord/123/5?server=999&queue=9&viewMode=wide#matches";
    window.history.pushState({}, "", url);

    try {
      render(
        <LiveTrackerApp apiHost="http://example.local" identity={{ type: "team", guildId: "123", queueNumber: "5" }} />,
      );
      await waitFor(() => {
        expect(connect).toHaveBeenCalledWith({ type: "team", guildId: "123", queueNumber: "5" });
      });
      expect(window.location.pathname + window.location.search + window.location.hash).toBe(url);
    } finally {
      install.mockRestore();
      connect.mockRestore();
    }
  });
});
