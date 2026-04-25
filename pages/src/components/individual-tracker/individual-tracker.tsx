import React, { useMemo, useSyncExternalStore } from "react";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import { Alert } from "../alert/alert";
import { Button } from "../button/button";
import { Container } from "../container/container";
import { SettingsShell, type SettingsShellItem } from "../settings-shell/settings-shell";
import { LoadingState } from "../loading-state/loading-state";
import { AdditionalOptionsSectionView } from "./additional-options/additional-options";
import { AddTrackerDialog } from "./add-tracker-dialog/add-tracker-dialog";
import type { IndividualTrackerPresenter } from "./individual-tracker-presenter";
import type { IndividualTrackerSectionId } from "./types";
import { GameSelectionDialog } from "./game-selection-dialog/game-selection-dialog";
import { LiveTrackersSectionView } from "./live-trackers/live-trackers";
import { StreamerConnectionsSectionView } from "./streamer-connections/streamer-connections";
import styles from "./individual-tracker.module.css";

interface IndividualTrackerViewProps {
  readonly presenter: IndividualTrackerPresenter;
}
export function IndividualTrackerView({ presenter }: IndividualTrackerViewProps): React.ReactElement {
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
        label: "Streamer Connections",
        description: "Connect your accounts and automate your stream.",
      },
      {
        id: "additional-options",
        label: "Additional Options",
        description: "Fine-tune how your trackers behave.",
      },
    ],
    [],
  );
  const trackerItems = presenter.getTrackerItems();

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

  let panelContent: React.ReactNode;

  const { activeSection } = snapshot;
  switch (activeSection) {
    case "live-trackers": {
      panelContent = (
        <LiveTrackersSectionView
          errorMessage={snapshot.errorMessage}
          trackerItems={trackerItems}
          getActions={(item) => presenter.getActions(item)}
          onAddTracker={(): void => {
            presenter.openAddDialog();
          }}
          dialogs={
            <>
              <AddTrackerDialog
                isOpen={snapshot.isAddDialogOpen}
                busy={snapshot.busy}
                onClose={(): void => {
                  presenter.closeAddDialog();
                }}
                onSearchGamertag={async (query) => presenter.searchGamertag(query)}
                onLoadMatches={async (xuid, start, count) => presenter.loadMatches(xuid, start, count)}
                onStartTracker={async (payload) => presenter.addTracker(payload)}
              />

              <GameSelectionDialog
                isOpen={snapshot.gameSelectionDialogState != null}
                busy={snapshot.busy}
                trackerLabel={snapshot.gameSelectionDialogState?.trackerLabel ?? ""}
                trackerId={snapshot.gameSelectionDialogState?.trackerId ?? ""}
                xuid={snapshot.gameSelectionDialogState?.xuid ?? ""}
                initialSelectedMatchIds={snapshot.gameSelectionDialogState?.initialSelectedMatchIds ?? []}
                onClose={(): void => {
                  presenter.closeGameSelectionDialog();
                }}
                onLoadEnrichedMatches={async (xuid, start, count) => presenter.loadMatches(xuid, start, count)}
                onSync={async (payload) => presenter.syncGameSelection(payload)}
              />
            </>
          }
        />
      );
      break;
    }
    case "streamer-connections": {
      panelContent = <StreamerConnectionsSectionView />;
      break;
    }
    case "additional-options": {
      panelContent = <AdditionalOptionsSectionView />;
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
