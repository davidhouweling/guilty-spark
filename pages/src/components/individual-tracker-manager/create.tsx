import React, { useEffect, useMemo, useSyncExternalStore } from "react";
import type { AuthService } from "../../services/auth/types";
import type { IndividualTrackerService } from "../../services/individual-tracker/types";
import type { IndividualTrackerViewService } from "../../services/individual-tracker/view-types";
import { IndividualTrackerPresenter } from "./individual-tracker-presenter";
import { IndividualTrackerStore } from "./individual-tracker-store";
import { IndividualTrackerShell } from "./individual-tracker";
import { createLiveTrackersSection } from "./live-trackers/create";

export interface CreateIndividualTrackerManagerPageConfig {
  readonly authService: AuthService;
  readonly individualTrackerService: IndividualTrackerService;
  readonly individualTrackerViewService: IndividualTrackerViewService;
}

interface IndividualTrackerManagerPageInternalProps {
  readonly presenter: IndividualTrackerPresenter;
  readonly LiveTrackersComponent: () => React.ReactElement;
}

function IndividualTrackerManagerPageInternal({
  presenter,
  LiveTrackersComponent,
}: IndividualTrackerManagerPageInternalProps): React.ReactElement {
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
    <IndividualTrackerShell
      authState={snapshot.authState}
      errorMessage={snapshot.errorMessage}
      onSignIn={(): void => {
        presenter.signIn();
      }}
      liveTrackersContent={<LiveTrackersComponent />}
    />
  );
}

export function createIndividualTrackerManagerPage(
  config: CreateIndividualTrackerManagerPageConfig,
): () => React.ReactElement {
  const Component = (): React.ReactElement => {
    const store = useMemo(() => new IndividualTrackerStore(), []);

    const { controller: liveTrackersController, Component: LiveTrackersComponent } = useMemo(
      () =>
        createLiveTrackersSection({
          individualTrackerService: config.individualTrackerService,
          individualTrackerViewService: config.individualTrackerViewService,
          navigateTo: (url): void => {
            window.location.assign(url);
          },
          confirmDelete: (message): boolean => window.confirm(message),
        }),
      [],
    );

    const presenter = useMemo(
      () =>
        new IndividualTrackerPresenter({
          authService: config.authService,
          store,
          liveTrackersController,
        }),
      [store, liveTrackersController],
    );

    return <IndividualTrackerManagerPageInternal presenter={presenter} LiveTrackersComponent={LiveTrackersComponent} />;
  };

  return Component;
}
