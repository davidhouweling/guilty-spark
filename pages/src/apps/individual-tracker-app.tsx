import React, { useEffect, useMemo } from "react";
import TimeAgo from "javascript-time-ago";
import en from "javascript-time-ago/locale/en";
import * as ReactRouterDom from "react-router-dom";
import type { Services } from "../services/types";
import { ErrorState } from "../components/error-state/error-state";
import { LoadingState } from "../components/loading-state/loading-state";
import { IndividualTrackerPresenter } from "../components/individual-tracker/individual-tracker-presenter";
import { IndividualTrackerStore } from "../components/individual-tracker/individual-tracker-store";
import { createLiveTrackersSection } from "../components/individual-tracker/live-trackers/create";
import { IndividualTrackerView } from "../components/individual-tracker/individual-tracker";
import {
  buildIndividualTrackerManagePath,
  type IndividualTrackerAppRoute,
} from "../components/individual-tracker/routes";
import { BaseApp } from "./base-app";

TimeAgo.addDefaultLocale(en);

interface IndividualTrackerAppProps {
  readonly apiHost: string;
}

interface IndividualTrackerFactoryProps {
  readonly services: Services;
  readonly route?: IndividualTrackerAppRoute;
  readonly navigateTo?: (url: string) => void;
}

export function IndividualTrackerFactory({
  services,
  route = { kind: "manage" },
  navigateTo,
}: IndividualTrackerFactoryProps): React.ReactElement {
  const store = useMemo(() => new IndividualTrackerStore(), []);

  const liveTrackersSection = useMemo(
    () =>
      createLiveTrackersSection({
        services,
        navigateTo,
      }),
    [services, navigateTo],
  );

  const presenter = useMemo(
    () =>
      new IndividualTrackerPresenter({
        services,
        store,
        liveTrackersController: liveTrackersSection.controller,
        initialRoute: route,
        navigateTo,
        assignLocation: (url): void => {
          window.location.assign(url);
        },
      }),
    [services, store, liveTrackersSection.controller, route, navigateTo],
  );

  useEffect(() => {
    presenter.start();

    return (): void => {
      presenter.dispose();
    };
  }, [presenter]);

  useEffect(() => {
    presenter.setRoute(route);
  }, [presenter, route]);

  return <IndividualTrackerView presenter={presenter} LiveTrackersSection={liveTrackersSection.Component} />;
}

interface RoutedFactoryProps {
  readonly services: Services;
  readonly route: IndividualTrackerAppRoute;
}

function RoutedIndividualTrackerFactory({ services, route }: RoutedFactoryProps): React.ReactElement {
  const navigate = ReactRouterDom.useNavigate();

  return (
    <IndividualTrackerFactory
      services={services}
      route={route}
      navigateTo={(url): void => {
        void navigate(url);
      }}
    />
  );
}

function ManageRoute({ services }: { readonly services: Services }): React.ReactElement {
  return <RoutedIndividualTrackerFactory services={services} route={{ kind: "manage" }} />;
}

function ActiveViewRoute({ services }: { readonly services: Services }): React.ReactElement {
  return <RoutedIndividualTrackerFactory services={services} route={{ kind: "view-active" }} />;
}

function TrackerViewRoute({ services }: { readonly services: Services }): React.ReactElement {
  const { trackerId } = ReactRouterDom.useParams<{ trackerId: string }>();

  if (trackerId == null || trackerId.trim() === "") {
    return <ReactRouterDom.Navigate to={buildIndividualTrackerManagePath()} replace={true} />;
  }

  return <RoutedIndividualTrackerFactory services={services} route={{ kind: "view-tracker", trackerId }} />;
}

export function IndividualTrackerApp({ apiHost }: IndividualTrackerAppProps): React.ReactElement {
  const loadingState = <LoadingState text="Loading individual tracker..." />;

  return (
    <BaseApp
      apiHost={apiHost}
      loading={loadingState}
      error={<ErrorState message="Failed to load individual tracker" />}
      loaded={(services) => (
        <ReactRouterDom.BrowserRouter basename="/individual-tracker">
          <ReactRouterDom.Routes>
            <ReactRouterDom.Route path="/" element={<ManageRoute services={services} />} />
            <ReactRouterDom.Route path="/active" element={<ActiveViewRoute services={services} />} />
            <ReactRouterDom.Route path="/tracker/:trackerId" element={<TrackerViewRoute services={services} />} />
            <ReactRouterDom.Route
              path="*"
              element={<ReactRouterDom.Navigate to={buildIndividualTrackerManagePath()} replace={true} />}
            />
          </ReactRouterDom.Routes>
        </ReactRouterDom.BrowserRouter>
      )}
    />
  );
}
