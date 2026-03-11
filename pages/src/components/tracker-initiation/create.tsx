import React, { useMemo, useSyncExternalStore } from "react";
import { ComponentLoader, ComponentLoaderStatus } from "../component-loader/component-loader";
import { ErrorState } from "../error-state/error-state";
import { LoadingState } from "../loading-state/loading-state";
import { TrackerInitiation } from "./tracker-initiation";
import { MatchSelectionList } from "./match-selection-list";
import { TrackerInitiationStore } from "./tracker-initiation-store";
import { TrackerInitiationPresenter } from "./tracker-initiation-presenter";

interface TrackerInitiationFactoryProps {
  readonly apiHost: string;
  readonly initialGamertag: string;
}

export function TrackerInitiationFactory({
  apiHost,
  initialGamertag,
}: TrackerInitiationFactoryProps): React.ReactElement {
  const store = useMemo(() => new TrackerInitiationStore(initialGamertag), [initialGamertag]);

  const presenter = useMemo(() => {
    return new TrackerInitiationPresenter({
      apiHost,
      store,
    });
  }, [apiHost, store]);

  const snapshot = useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getSnapshot(),
    () => store.getSnapshot(),
  );

  const model = useMemo(() => {
    return TrackerInitiationPresenter.present(snapshot);
  }, [snapshot]);

  const isSearching = snapshot.state.type === "loading";

  return (
    <TrackerInitiation
      gamertag={model.gamertag}
      isSearching={isSearching}
      onGamertagChange={(gamertag): void => {
        presenter.updateGamertag(gamertag);
      }}
      onSearch={(): void => {
        void presenter.search();
      }}
    >
      {snapshot.state.type === "idle" ? null : (
        <ComponentLoader
          status={
            snapshot.state.type === "loading"
              ? ComponentLoaderStatus.LOADING
              : snapshot.state.type === "error"
                ? ComponentLoaderStatus.ERROR
                : ComponentLoaderStatus.LOADED
          }
          loading={<LoadingState />}
          error={
            <ErrorState
              message={snapshot.state.type === "error" ? snapshot.state.message : "An error occurred"}
              onRetry={(): void => {
                void presenter.search();
              }}
            />
          }
          loaded={
            snapshot.state.type === "loaded" ? (
              <MatchSelectionList
                matches={snapshot.state.data.matches}
                selectedMatchIds={model.selectedMatchIds}
                groupings={model.groupings}
                onMatchToggle={(matchId): void => {
                  presenter.toggleMatch(matchId);
                }}
                onSelectAll={(): void => {
                  presenter.selectAll();
                }}
                onDeselectAll={(): void => {
                  presenter.deselectAll();
                }}
                onStartTracker={(): void => {
                  void presenter.startTracker();
                }}
              />
            ) : (
              <div />
            )
          }
        />
      )}
    </TrackerInitiation>
  );
}
