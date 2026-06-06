import React, { createContext, useContext, useMemo } from "react";
import type { IndividualTrackerSettingsService } from "../../services/individual-tracker/settings-types";
import type { TrackerRowAction } from "./manager-model";
import type { IndividualTrackerManagerViewModel } from "./types";

interface IndividualTrackerManagerActions {
  readonly onOpenAddDialog: () => void;
  readonly onCloseAddDialog: () => void;
  readonly onGamertagInputChange: (value: string) => void;
  readonly onSearchStartTimeChange: (value: string) => void;
  readonly onIdleTimeoutHoursChange: (value: string) => void;
  readonly onAddTracker: () => void;
  readonly onRowAction: (trackerId: string, action: TrackerRowAction) => void;
}

interface IndividualTrackerManagerContextValue {
  readonly model: IndividualTrackerManagerViewModel;
  readonly actions: IndividualTrackerManagerActions;
  readonly settingsService: IndividualTrackerSettingsService;
}

const IndividualTrackerManagerContext = createContext<IndividualTrackerManagerContextValue | null>(null);

interface IndividualTrackerManagerProviderProps {
  readonly model: IndividualTrackerManagerViewModel;
  readonly actions: IndividualTrackerManagerActions;
  readonly settingsService: IndividualTrackerSettingsService;
  readonly children: React.ReactNode;
}

export function IndividualTrackerManagerProvider({
  model,
  actions,
  settingsService,
  children,
}: IndividualTrackerManagerProviderProps): React.ReactElement {
  const value = useMemo(() => ({ model, actions, settingsService }), [model, actions, settingsService]);

  return <IndividualTrackerManagerContext.Provider value={value}>{children}</IndividualTrackerManagerContext.Provider>;
}

function useIndividualTrackerManagerContext(): IndividualTrackerManagerContextValue {
  const context = useContext(IndividualTrackerManagerContext);
  if (context === null) {
    throw new Error("useIndividualTrackerManagerContext must be used within IndividualTrackerManagerProvider");
  }
  return context;
}

export function useManagerModel(): IndividualTrackerManagerViewModel {
  return useIndividualTrackerManagerContext().model;
}

export function useManagerActions(): IndividualTrackerManagerActions {
  return useIndividualTrackerManagerContext().actions;
}

export function useManagerSettingsService(): IndividualTrackerSettingsService {
  return useIndividualTrackerManagerContext().settingsService;
}
