import React, { useEffect, useMemo, useSyncExternalStore } from "react";
import type { AuthService } from "../../services/auth/types";
import type { IndividualTrackerSettingsService } from "../../services/individual-tracker/settings-types";
import type { IndividualTrackerService } from "../../services/individual-tracker/types";
import type { IndividualTrackerViewService } from "../../services/individual-tracker/view-types";
import { IndividualTrackerPresenter } from "./individual-tracker-presenter";
import { IndividualTrackerStore } from "./individual-tracker-store";
import { IndividualTrackerShell } from "./individual-tracker";
import { createLiveTrackersSection } from "./live-trackers/create";
import { StreamerConnectionsSection } from "./streamer-connections/create";

interface IndividualTrackerManagerPageProps {
  readonly authService: AuthService;
  readonly individualTrackerService: IndividualTrackerService;
  readonly settingsService: IndividualTrackerSettingsService;
  readonly individualTrackerViewService: IndividualTrackerViewService;
}

export function IndividualTrackerManagerPage({
  authService,
  individualTrackerService,
  settingsService,
  individualTrackerViewService,
}: IndividualTrackerManagerPageProps): React.ReactElement {
  const { controller: liveTrackersController, Component: LiveTrackersComponent } = useMemo(
    () =>
      createLiveTrackersSection({
        individualTrackerService,
        individualTrackerViewService,
        navigateTo: (url): void => {
          window.location.assign(url);
        },
        confirmDelete: (message): boolean => window.confirm(message),
      }),
    [individualTrackerService, individualTrackerViewService],
  );

  const store = useMemo(() => new IndividualTrackerStore(), []);

  const presenter = useMemo(
    () =>
      new IndividualTrackerPresenter({
        authService,
        settingsService,
        store,
        liveTrackersController,
      }),
    [authService, settingsService, store, liveTrackersController],
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
    <IndividualTrackerShell
      authState={snapshot.authState}
      errorMessage={snapshot.errorMessage}
      activeSection={snapshot.activeSection}
      onSignIn={(): void => {
        presenter.signIn();
      }}
      onSectionChange={(id): void => {
        presenter.setActiveSection(id);
      }}
      liveTrackersContent={<LiveTrackersComponent />}
      streamerSettingsContent={
        <StreamerConnectionsSection
          settings={snapshot.streamerSettings}
          settingsService={settingsService}
          gamertag={snapshot.gamertag}
        />
      }
    />
  );
}
