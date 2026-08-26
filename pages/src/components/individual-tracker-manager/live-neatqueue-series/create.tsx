import React, { useEffect, useMemo, useSyncExternalStore } from "react";
import type { IndividualTrackerService } from "../../../services/individual-tracker/types";
import type { IndividualTrackerViewService } from "../../../services/individual-tracker/view-types";
import type { NeatQueueClientService } from "../../../services/neatqueue/types";
import { createManualSeriesDialogSection } from "../../individual-tracker/manual-series-dialog/create";
import { LiveNeatQueueSeriesPresenter } from "./live-neatqueue-series-presenter";
import { LiveNeatQueueSeriesStore } from "./live-neatqueue-series-store";
import { LiveNeatQueueSeriesSectionView } from "./live-neatqueue-series";

export interface CreateLiveNeatQueueSeriesSectionConfig {
  readonly neatQueueService: NeatQueueClientService;
  readonly individualTrackerService: IndividualTrackerService;
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly onTrackerCreated?: (() => void) | undefined;
}

function LiveNeatQueueSeriesSectionInternal({
  config,
}: {
  readonly config: CreateLiveNeatQueueSeriesSectionConfig;
}): React.ReactElement {
  const { neatQueueService, individualTrackerService, individualTrackerViewService, onTrackerCreated } = config;

  const store = useMemo(() => new LiveNeatQueueSeriesStore(), []);
  const presenter = useMemo(
    () => new LiveNeatQueueSeriesPresenter({ neatQueueService, individualTrackerService, store, onTrackerCreated }),
    [neatQueueService, individualTrackerService, store, onTrackerCreated],
  );
  const ManualSeriesDialogSection = useMemo(
    () => createManualSeriesDialogSection({ individualTrackerService, individualTrackerViewService }),
    [individualTrackerService, individualTrackerViewService],
  );

  useEffect(() => {
    presenter.start();
    return (): void => {
      presenter.dispose();
    };
  }, [presenter]);

  const snapshot = useSyncExternalStore(
    (listener) => presenter.subscribe(listener),
    () => presenter.getSnapshot(),
    () => presenter.getSnapshot(),
  );

  return (
    <LiveNeatQueueSeriesSectionView
      errorMessage={snapshot.errorMessage}
      loading={snapshot.loading}
      cards={presenter.getSeriesCards()}
      onRefresh={(): void => {
        presenter.refresh();
      }}
      onTrack={(card): void => {
        presenter.track(card.guildId, card.queueNumber);
      }}
      onGoLive={(card): void => {
        presenter.goLive(card.guildId, card.queueNumber);
      }}
      dialog={
        snapshot.dialogState != null && (
          <ManualSeriesDialogSection
            trackerId={snapshot.dialogState.trackerId}
            trackerLabel={snapshot.dialogState.trackerLabel}
            isOpen
            mode="start"
            initialData={snapshot.dialogState.initialData}
            onClose={(): void => {
              presenter.closeDialog();
            }}
            onSeriesStarted={(): void => {
              presenter.handleSeriesStarted();
            }}
          />
        )
      }
    />
  );
}

export function createLiveNeatQueueSeriesSection(
  config: CreateLiveNeatQueueSeriesSectionConfig,
): () => React.ReactElement {
  const Component = (): React.ReactElement => <LiveNeatQueueSeriesSectionInternal config={config} />;

  return Component;
}
