import React, { useMemo, useSyncExternalStore } from "react";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import { Alert } from "../alert/alert";
import { Button } from "../button/button";
import { Container } from "../container/container";
import { SettingsShell, type SettingsShellItem } from "../settings-shell/settings-shell";
import { LoadingState } from "../loading-state/loading-state";
import { AdditionalOptionsSectionView } from "./additional-options/additional-options";
import type { IndividualTrackerPresenter } from "./individual-tracker-presenter";
import type { IndividualTrackerSectionId } from "./types";
import { StreamerConnectionsSectionView } from "./streamer-connections/streamer-connections";
import { IndividualTrackerViewer } from "./viewer/individual-tracker-viewer";
import styles from "./individual-tracker.module.css";

interface IndividualTrackerViewProps {
  readonly presenter: IndividualTrackerPresenter;
  readonly LiveTrackersSection: () => React.ReactElement;
}
export function IndividualTrackerView({
  presenter,
  LiveTrackersSection,
}: IndividualTrackerViewProps): React.ReactElement {
  const snapshot = useSyncExternalStore(
    (listener) => presenter.subscribe(listener),
    () => presenter.getSnapshot(),
    () => presenter.getSnapshot(),
  );

  const menuItems: readonly SettingsShellItem[] = useMemo(
    () => [
      {
        id: "live-trackers",
        label: "Live Trackers",
        description: "Start, stop, and manage your real-time Halo trackers.",
      },
      {
        id: "streamer-connections",
        label: "Streamer Settings",
        description: "Configure the active viewer and OBS overlay for your stream.",
      },
      {
        id: "additional-options",
        label: "Additional Options",
        description: "Fine-tune how your trackers behave.",
      },
    ],
    [],
  );

  if (snapshot.loading) {
    return <LoadingState text="Loading individual tracker..." />;
  }

  if (snapshot.authState === "unauthenticated") {
    return (
      <Container className={styles.pageContainer}>
        <section className={styles.authBox}>
          <h1 className={styles.authTitle}>Sign in required</h1>
          <p className={styles.authSubtitle}>
            You need a Microsoft session before you can manage an individual tracker.
          </p>
          <Button onClick={(): void => void presenter.signIn()}>Sign in with Microsoft</Button>
          {snapshot.errorMessage != null && <Alert variant="error">{snapshot.errorMessage}</Alert>}
        </section>
      </Container>
    );
  }

  if (snapshot.mode === "view") {
    return (
      <Container className={styles.pageContainer}>
        <IndividualTrackerViewer
          trackerGamertag={snapshot.viewTrackerGamertag}
          connectionStatus={snapshot.viewConnectionStatus}
          errorMessage={snapshot.viewErrorMessage}
          canManage={snapshot.viewerCanManage}
          refreshInProgress={snapshot.viewerRefreshInProgress}
          refreshStartedAt={snapshot.viewerRefreshStartedAt}
          refreshPending={snapshot.viewerRefreshPending}
          refreshMessage={snapshot.viewerRefreshMessage}
          trackerSummary={snapshot.viewerTrackerSummary}
          renderModel={snapshot.viewerRenderModel}
          matchHistoryLoading={snapshot.viewedMatchHistoryLoading}
          onBackToManage={(): void => {
            presenter.exitViewerMode();
          }}
          onRefresh={(): void => {
            void presenter.refreshViewerTracker();
          }}
        />
      </Container>
    );
  }

  let panelContent: React.ReactNode;

  const { activeSection } = snapshot;
  switch (activeSection) {
    case "live-trackers": {
      panelContent = <LiveTrackersSection />;
      break;
    }
    case "streamer-connections": {
      panelContent = <StreamerConnectionsSectionView xboxXuid={snapshot.xboxXuid} />;
      break;
    }
    case "additional-options": {
      panelContent = (
        <AdditionalOptionsSectionView
          teamColor={snapshot.viewerTeamColor}
          enemyColor={snapshot.viewerEnemyColor}
          saving={snapshot.viewerSettingsSaving}
          errorMessage={snapshot.viewerSettingsErrorMessage}
          onTeamColorChange={(nextColor): void => {
            void presenter.updateViewerColors(nextColor, snapshot.viewerEnemyColor);
          }}
          onEnemyColorChange={(nextColor): void => {
            void presenter.updateViewerColors(snapshot.viewerTeamColor, nextColor);
          }}
        />
      );
      break;
    }
    default: {
      throw new UnreachableError(activeSection);
    }
  }

  return (
    <>
      <Container className={styles.pageContainer}>
        <SettingsShell
          title="Individual Tracker"
          subtitle="Manage your live trackers, streamer integrations, and preferences."
          items={menuItems}
          activeItemId={snapshot.activeSection}
          onSelectItem={(id): void => {
            presenter.setActiveSection(id as IndividualTrackerSectionId);
          }}
        >
          {panelContent}
        </SettingsShell>
      </Container>
    </>
  );
}
