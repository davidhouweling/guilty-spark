import React, { useEffect, useMemo } from "react";
import TimeAgo from "javascript-time-ago";
import en from "javascript-time-ago/locale/en";
import type { Services } from "../services/types";
import { ErrorState } from "../components/error-state/error-state";
import { LoadingState } from "../components/loading-state/loading-state";
import { IndividualTrackerPresenter } from "../components/individual-tracker/individual-tracker-presenter";
import { IndividualTrackerStore } from "../components/individual-tracker/individual-tracker-store";
import { createLiveTrackersSection } from "../components/individual-tracker/live-trackers/create";
import { IndividualTrackerView } from "../components/individual-tracker/individual-tracker";
import { BaseApp } from "./base-app";

TimeAgo.addDefaultLocale(en);

interface IndividualTrackerAppProps {
  readonly apiHost: string;
}

interface IndividualTrackerFactoryProps {
  readonly services: Services;
}

export function IndividualTrackerFactory({ services }: IndividualTrackerFactoryProps): React.ReactElement {
  const store = useMemo(() => new IndividualTrackerStore(), []);

  const liveTrackersSection = useMemo(
    () =>
      createLiveTrackersSection({
        services,
        assignLocation: (url): void => {
          window.location.assign(url);
        },
      }),
    [services],
  );

  const presenter = useMemo(
    () =>
      new IndividualTrackerPresenter({
        services,
        store,
        liveTrackersController: liveTrackersSection.controller,
        assignLocation: (url): void => {
          window.location.assign(url);
        },
      }),
    [services, store, liveTrackersSection.controller],
  );

  useEffect(() => {
    presenter.start();

    return (): void => {
      presenter.dispose();
    };
  }, [presenter]);

  return <IndividualTrackerView presenter={presenter} LiveTrackersSection={liveTrackersSection.Component} />;
}

export function IndividualTrackerApp({ apiHost }: IndividualTrackerAppProps): React.ReactElement {
  const loadingState = <LoadingState text="Loading individual tracker..." />;

  return (
    <BaseApp
      apiHost={apiHost}
      loading={loadingState}
      error={<ErrorState message="Failed to load individual tracker" />}
      loaded={(services) => <IndividualTrackerFactory services={services} />}
    />
  );
}
