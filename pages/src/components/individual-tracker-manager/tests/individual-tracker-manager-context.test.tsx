import "@testing-library/jest-dom/vitest";

import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { aFakeTrackerWith } from "../../../services/individual-tracker/fakes/individual-tracker.fake";
import { aFakeIndividualTrackerSettingsServiceWith } from "../../../services/individual-tracker/fakes/settings.fake";
import { toManagerModel } from "../manager-model";
import type { IndividualTrackerManagerViewModel } from "../types";

import {
  IndividualTrackerManagerProvider,
  useManagerActions,
  useManagerModel,
} from "../individual-tracker-manager-context";

function aFakeViewModelWith(overrides?: Partial<IndividualTrackerManagerViewModel>): IndividualTrackerManagerViewModel {
  return {
    model: toManagerModel([aFakeTrackerWith({ trackerId: "t-1", gamertag: "Alpha" })]),
    profileName: "Spartan Profile",
    isAddDialogOpen: false,
    gamertagInput: "",
    searchStartTime: "",
    idleTimeoutHours: "",
    addPending: false,
    pendingTrackerId: null,
    addDisabled: true,
    settings: {},
    liveXuid: null,
    ...overrides,
  };
}

const noopActions = {
  onOpenAddDialog: (): void => undefined,
  onCloseAddDialog: (): void => undefined,
  onGamertagInputChange: (): void => undefined,
  onSearchStartTimeChange: (): void => undefined,
  onIdleTimeoutHoursChange: (): void => undefined,
  onAddTracker: (): void => undefined,
  onRowAction: (): void => undefined,
};

const fakeSettingsService = aFakeIndividualTrackerSettingsServiceWith();

describe("IndividualTrackerManagerContext", () => {
  it("throws when the model hook is used outside the provider", () => {
    expect(() => {
      renderHook(() => useManagerModel());
    }).toThrow("useIndividualTrackerManagerContext must be used within IndividualTrackerManagerProvider");
  });

  it("provides the view model to the model hook", () => {
    const model = aFakeViewModelWith();

    const { result } = renderHook(() => useManagerModel(), {
      wrapper: ({ children }) => (
        <IndividualTrackerManagerProvider model={model} actions={noopActions} settingsService={fakeSettingsService}>
          {children}
        </IndividualTrackerManagerProvider>
      ),
    });

    expect(result.current.profileName).toBe("Spartan Profile");
    expect(result.current.model.rows[0]?.gamertag).toBe("Alpha");
  });

  it("provides the bound actions to the actions hook", () => {
    const onAddTracker = vi.fn();
    const onRowAction = vi.fn();
    const onGamertagInputChange = vi.fn();

    const { result } = renderHook(() => useManagerActions(), {
      wrapper: ({ children }) => (
        <IndividualTrackerManagerProvider
          model={aFakeViewModelWith()}
          actions={{ ...noopActions, onAddTracker, onRowAction, onGamertagInputChange }}
          settingsService={fakeSettingsService}
        >
          {children}
        </IndividualTrackerManagerProvider>
      ),
    });

    result.current.onAddTracker();
    result.current.onRowAction("t-1", "stop");
    result.current.onGamertagInputChange("Bravo");

    expect(onAddTracker).toHaveBeenCalledTimes(1);
    expect(onRowAction).toHaveBeenCalledWith("t-1", "stop");
    expect(onGamertagInputChange).toHaveBeenCalledWith("Bravo");
  });
});
