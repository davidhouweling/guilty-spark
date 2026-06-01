import React, { useCallback, useEffect, useState } from "react";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import type { Tracker } from "@guilty-spark/shared/contracts/individual-tracker/tracker";
import { ComponentLoader, ComponentLoaderStatus } from "../component-loader/component-loader";
import { ErrorState } from "../error-state/error-state";
import { LoadingState } from "../loading-state/loading-state";
import type { IndividualTrackerService } from "../../services/individual-tracker/types";
import { IndividualTrackerManager } from "./individual-tracker-manager";
import type { TrackerRowAction } from "./manager-model";
import { isValidGamertagInput, toManagerModel } from "./manager-model";

interface IndividualTrackerManagerPageProps {
  readonly individualTrackerService: IndividualTrackerService;
}

export function IndividualTrackerManagerPage({
  individualTrackerService,
}: IndividualTrackerManagerPageProps): React.ReactElement {
  const [state, setState] = useState(ComponentLoaderStatus.LOADING);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [profileName, setProfileName] = useState("");
  const [trackers, setTrackers] = useState<readonly Tracker[]>([]);
  const [gamertagInput, setGamertagInput] = useState("");
  const [addPending, setAddPending] = useState(false);
  const [pendingTrackerId, setPendingTrackerId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setState(ComponentLoaderStatus.LOADING);
    setErrorMessage(null);
    try {
      const [profileResponse, trackersResponse] = await Promise.all([
        individualTrackerService.getProfile(),
        individualTrackerService.listTrackers(),
      ]);
      setProfileName(profileResponse.profile.name);
      setTrackers(trackersResponse.trackers);
      setState(ComponentLoaderStatus.LOADED);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load trackers");
      setState(ComponentLoaderStatus.ERROR);
    }
  }, [individualTrackerService]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshTrackers = useCallback(async (): Promise<void> => {
    const trackersResponse = await individualTrackerService.listTrackers();
    setTrackers(trackersResponse.trackers);
  }, [individualTrackerService]);

  const handleAddTracker = useCallback((): void => {
    if (!isValidGamertagInput(gamertagInput)) {
      return;
    }
    const gamertag = gamertagInput.trim();

    setAddPending(true);
    individualTrackerService
      .startTracker({ gamertag })
      .then(refreshTrackers)
      .then(() => {
        setGamertagInput("");
      })
      .catch((error: unknown) => {
        setErrorMessage(error instanceof Error ? error.message : "Failed to start tracker");
        setState(ComponentLoaderStatus.ERROR);
      })
      .finally(() => {
        setAddPending(false);
      });
  }, [gamertagInput, individualTrackerService, refreshTrackers]);

  const handleRowAction = useCallback(
    (trackerId: string, action: TrackerRowAction): void => {
      const run = async (): Promise<void> => {
        switch (action) {
          case "stop":
            await individualTrackerService.stopTracker(trackerId);
            return;
          case "pause":
            await individualTrackerService.pauseTracker(trackerId);
            return;
          case "resume":
            await individualTrackerService.resumeTracker(trackerId);
            return;
          case "setLive":
            await individualTrackerService.selectActive(trackerId);
            return;
          default:
            throw new UnreachableError(action);
        }
      };

      setPendingTrackerId(trackerId);
      run()
        .then(refreshTrackers)
        .catch((error: unknown) => {
          setErrorMessage(error instanceof Error ? error.message : "Tracker action failed");
          setState(ComponentLoaderStatus.ERROR);
        })
        .finally(() => {
          setPendingTrackerId(null);
        });
    },
    [individualTrackerService, refreshTrackers],
  );

  return (
    <ComponentLoader
      status={state}
      loading={<LoadingState text="Loading your trackers..." />}
      error={<ErrorState message={errorMessage ?? "Failed to load trackers"} onRetry={() => void load()} />}
      loaded={
        <IndividualTrackerManager
          model={toManagerModel(trackers)}
          profileName={profileName}
          gamertagInput={gamertagInput}
          addPending={addPending}
          pendingTrackerId={pendingTrackerId}
          onGamertagInputChange={setGamertagInput}
          onAddTracker={handleAddTracker}
          onRowAction={handleRowAction}
        />
      }
    />
  );
}
