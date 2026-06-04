import "@testing-library/jest-dom/vitest";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  aFakeIndividualTrackerServiceWith,
  aFakeTrackerWith,
} from "../../../services/individual-tracker/fakes/individual-tracker.fake";
import type { FakeIndividualTrackerService } from "../../../services/individual-tracker/fakes/individual-tracker.fake";
import { aFakeIndividualTrackerSettingsServiceWith } from "../../../services/individual-tracker/fakes/settings.fake";
import { IndividualTrackerManagerPage } from "../create";

describe("IndividualTrackerManagerView", () => {
  let service: FakeIndividualTrackerService;
  const settingsService = aFakeIndividualTrackerSettingsServiceWith();

  beforeEach(() => {
    service = aFakeIndividualTrackerServiceWith({
      trackers: [
        aFakeTrackerWith({ trackerId: "t-1", gamertag: "Active Spartan", status: "active", isLive: true }),
        aFakeTrackerWith({ trackerId: "t-2", gamertag: "Paused Spartan", status: "paused", isLive: false }),
      ],
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders a row per tracker with gamertag, status badge, and a live indicator", async () => {
    render(<IndividualTrackerManagerPage individualTrackerService={service} settingsService={settingsService} />);

    await waitFor(() => {
      expect(screen.getByText("Active Spartan")).toBeInTheDocument();
    });

    const rows = screen.getAllByTestId("tracker-row");
    expect(rows).toHaveLength(2);

    const activeRow = within(rows[0]);
    expect(activeRow.getByText("Active")).toBeInTheDocument();
    expect(activeRow.getByText("Live")).toBeInTheDocument();

    const pausedRow = within(rows[1]);
    expect(pausedRow.getByText("Paused Spartan")).toBeInTheDocument();
    expect(pausedRow.getByText("Paused")).toBeInTheDocument();
  });

  it("invokes pauseTracker when the pause action of an active row is clicked", async () => {
    const user = userEvent.setup();
    const pauseSpy: MockInstance = vi.spyOn(service, "pauseTracker");

    render(<IndividualTrackerManagerPage individualTrackerService={service} settingsService={settingsService} />);

    await waitFor(() => {
      expect(screen.getByText("Active Spartan")).toBeInTheDocument();
    });

    const activeRow = within(screen.getAllByTestId("tracker-row")[0]);
    await user.click(activeRow.getByRole("button", { name: "Pause" }));

    await waitFor(() => {
      expect(pauseSpy).toHaveBeenCalledWith("t-1");
    });
  });

  it("stops a tracker and removes its row after the list refreshes", async () => {
    const user = userEvent.setup();
    const stopSpy: MockInstance = vi.spyOn(service, "stopTracker");

    render(<IndividualTrackerManagerPage individualTrackerService={service} settingsService={settingsService} />);

    await waitFor(() => {
      expect(screen.getByText("Paused Spartan")).toBeInTheDocument();
    });

    const pausedRow = within(screen.getAllByTestId("tracker-row")[1]);
    await user.click(pausedRow.getByRole("button", { name: "Stop" }));

    await waitFor(() => {
      expect(stopSpy).toHaveBeenCalledWith("t-2");
    });

    await waitFor(() => {
      expect(screen.queryByText("Paused Spartan")).not.toBeInTheDocument();
    });
    expect(screen.getAllByTestId("tracker-row")).toHaveLength(1);
  });

  it("sets a tracker live and moves the live indicator to its row after the list refreshes", async () => {
    const user = userEvent.setup();
    const selectActiveSpy: MockInstance = vi.spyOn(service, "selectActive");

    render(<IndividualTrackerManagerPage individualTrackerService={service} settingsService={settingsService} />);

    await waitFor(() => {
      expect(screen.getByText("Paused Spartan")).toBeInTheDocument();
    });

    const pausedRow = within(screen.getAllByTestId("tracker-row")[1]);
    await user.click(pausedRow.getByRole("button", { name: "Set live" }));

    await waitFor(() => {
      expect(selectActiveSpy).toHaveBeenCalledWith("t-2");
    });

    await waitFor(() => {
      const refreshedPausedRow = within(screen.getAllByTestId("tracker-row")[1]);
      expect(refreshedPausedRow.getByText("Live")).toBeInTheDocument();
    });
    const refreshedActiveRow = within(screen.getAllByTestId("tracker-row")[0]);
    expect(refreshedActiveRow.queryByText("Live")).not.toBeInTheDocument();
  });

  it("disables the add control when the tracker limit is reached", async () => {
    const fullService = aFakeIndividualTrackerServiceWith({
      trackers: Array.from({ length: 5 }, (_unused, index) =>
        aFakeTrackerWith({ trackerId: `full-${index.toString()}`, gamertag: `Spartan ${index.toString()}` }),
      ),
    });

    render(<IndividualTrackerManagerPage individualTrackerService={fullService} settingsService={settingsService} />);

    await waitFor(() => {
      expect(screen.getByText("Spartan 0")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "Add tracker" })).toBeDisabled();
    expect(screen.getByText(/reached the limit of 5 trackers/i)).toBeInTheDocument();
  });

  it("opens the add dialog and invokes startTracker with the entered gamertag, then adds its row", async () => {
    const user = userEvent.setup();
    const startSpy: MockInstance = vi.spyOn(service, "startTracker");

    render(<IndividualTrackerManagerPage individualTrackerService={service} settingsService={settingsService} />);

    await waitFor(() => {
      expect(screen.getByText("Active Spartan")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Add tracker" }));

    const dialog = within(screen.getByRole("dialog"));
    await user.type(dialog.getByLabelText("Gamertag"), "New Recruit");
    await user.click(dialog.getByRole("button", { name: "Track" }));

    await waitFor(() => {
      expect(startSpy).toHaveBeenCalledWith({ gamertag: "New Recruit" });
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText("New Recruit")).toBeInTheDocument();
    });
  });

  it("sends the optional search start time and idle timeout when provided in the dialog", async () => {
    const user = userEvent.setup();
    const startSpy: MockInstance = vi.spyOn(service, "startTracker");

    render(<IndividualTrackerManagerPage individualTrackerService={service} settingsService={settingsService} />);

    await waitFor(() => {
      expect(screen.getByText("Active Spartan")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Add tracker" }));

    const dialog = within(screen.getByRole("dialog"));
    await user.type(dialog.getByLabelText("Gamertag"), "New Recruit");
    await user.type(dialog.getByLabelText("Search start time"), "2026-01-02T03:04");
    await user.type(dialog.getByLabelText("Idle timeout (hours)"), "12");
    await user.click(dialog.getByRole("button", { name: "Track" }));

    await waitFor(() => {
      expect(startSpy).toHaveBeenCalledWith({
        gamertag: "New Recruit",
        searchStartTime: new Date("2026-01-02T03:04").toISOString(),
        idleTimeoutHours: 12,
      });
    });
  });

  it("shows an empty state when the owner has no trackers", async () => {
    const emptyService = aFakeIndividualTrackerServiceWith({ trackers: [] });

    render(<IndividualTrackerManagerPage individualTrackerService={emptyService} settingsService={settingsService} />);

    await waitFor(() => {
      expect(screen.getByText(/No trackers yet/i)).toBeInTheDocument();
    });
    expect(screen.queryAllByTestId("tracker-row")).toHaveLength(0);
  });

  it("renders the error state when loading trackers fails", async () => {
    vi.spyOn(service, "listTrackers").mockRejectedValue(new Error("Trackers unavailable"));

    render(<IndividualTrackerManagerPage individualTrackerService={service} settingsService={settingsService} />);

    await waitFor(() => {
      expect(screen.getByText("Trackers unavailable")).toBeInTheDocument();
    });
  });
});
