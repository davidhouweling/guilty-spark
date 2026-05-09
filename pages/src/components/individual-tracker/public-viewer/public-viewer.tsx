import React, { useSyncExternalStore } from "react";
import { Alert } from "../../alert/alert";
import { Container } from "../../container/container";
import { LoadingState } from "../../loading-state/loading-state";
import { IndividualTrackerViewer } from "../viewer/individual-tracker-viewer";
import { PublicIndividualTrackerOverlay } from "./public-individual-tracker-overlay";
import type { PublicViewerPresenter } from "./public-viewer-presenter";
import styles from "./public-viewer.module.css";

interface PublicViewerProps {
  readonly presenter: PublicViewerPresenter;
}

function renderAvailabilityAlert(
  availability: "active" | "offline" | "not-found" | null,
  errorMessage: string | null,
): React.ReactNode {
  if (errorMessage != null) {
    return <Alert variant="error">{errorMessage}</Alert>;
  }

  if (availability === "not-found") {
    return <Alert variant="warning">No active Xbox identity is linked for this viewer URL.</Alert>;
  }

  if (availability === "offline") {
    return <Alert variant="info">This tracker is currently offline. Start a tracker to resume live updates.</Alert>;
  }

  return null;
}

export function PublicViewer({ presenter }: PublicViewerProps): React.ReactElement {
  const snapshot = useSyncExternalStore(
    (listener) => presenter.subscribe(listener),
    () => presenter.getSnapshot(),
    () => presenter.getSnapshot(),
  );

  if (snapshot.variant === "overlay") {
    return <PublicIndividualTrackerOverlay snapshot={snapshot} />;
  }

  if (snapshot.loading) {
    return <LoadingState text="Loading active tracker view..." />;
  }

  return (
    <Container className={styles.pageContainer}>
      <section className={styles.alertSection}>
        {renderAvailabilityAlert(snapshot.availability, snapshot.errorMessage)}
      </section>
      <IndividualTrackerViewer
        trackerGamertag={snapshot.trackerState?.gamertag ?? null}
        connectionStatus={snapshot.connectionStatus}
        errorMessage={snapshot.errorMessage}
        canManage={false}
        refreshInProgress={false}
        refreshStartedAt={null}
        refreshPending={false}
        refreshMessage={null}
        trackerSummary={snapshot.trackerSummary}
        renderModel={snapshot.renderModel}
        topBarStats={snapshot.overlayTopBarStats}
        matchHistoryLoading={snapshot.matchHistoryLoading}
        onBackToManage={(): void => {
          // public route has no manage context
        }}
        onRefresh={(): void => {
          // public route has no manual refresh action
        }}
      />
    </Container>
  );
}
