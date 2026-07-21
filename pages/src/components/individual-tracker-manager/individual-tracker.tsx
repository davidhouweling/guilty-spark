import type { ReactElement, ReactNode } from "react";
import { useMemo } from "react";
import { Button } from "../button/button";
import { Heading } from "../heading/heading";
import { LoadingState } from "../loading-state/loading-state";
import { TabbedSection } from "../tabbed-section/tabbed-section";
import type { TabbedSectionTab } from "../tabbed-section/types";
import type { IndividualTrackerAuthState, IndividualTrackerSectionId } from "./individual-tracker-store";
import styles from "./individual-tracker.module.css";

interface IndividualTrackerShellProps {
  readonly authState: IndividualTrackerAuthState;
  readonly errorMessage: string | null;
  readonly activeSection: IndividualTrackerSectionId;
  readonly onSignIn: () => void;
  readonly onSectionChange: (id: IndividualTrackerSectionId) => void;
  readonly liveTrackersContent: ReactNode;
  readonly statsHighlightsContent: ReactNode;
  readonly streamerSettingsContent: ReactNode;
}

export function IndividualTrackerShell({
  authState,
  errorMessage,
  activeSection,
  onSignIn,
  onSectionChange,
  liveTrackersContent,
  statsHighlightsContent,
  streamerSettingsContent,
}: IndividualTrackerShellProps): ReactElement {
  const sectionTabs = useMemo(
    (): readonly TabbedSectionTab<IndividualTrackerSectionId>[] => [
      {
        id: "live-trackers",
        label: "Live Trackers",
        content: liveTrackersContent,
      },
      {
        id: "stats-highlights",
        label: "Stats Highlights",
        content: statsHighlightsContent,
      },
      {
        id: "streamer-settings",
        label: "Streamer Settings",
        content: streamerSettingsContent,
      },
    ],
    [liveTrackersContent, statsHighlightsContent, streamerSettingsContent],
  );

  return (
    <div className={styles.container}>
      <Heading tagName="h1" variant="display" spacing={6} className={styles.heading}>
        Individual Tracker
      </Heading>

      {authState === "loading" && <LoadingState text="Checking session..." />}

      {authState === "unauthenticated" && (
        <div className={styles.authWall}>
          <p className={styles.authWallText}>Sign in to manage your trackers.</p>
          {errorMessage != null && <p className={styles.errorMessage}>{errorMessage}</p>}
          <Button onClick={onSignIn}>Sign in with Microsoft</Button>
        </div>
      )}

      {authState === "authenticated" && (
        <TabbedSection
          tabs={sectionTabs}
          selectedTabId={activeSection}
          onTabChange={onSectionChange}
          tabListAriaLabel="Individual tracker sections"
        />
      )}
    </div>
  );
}
