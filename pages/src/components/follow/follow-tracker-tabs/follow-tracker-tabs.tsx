import React from "react";
import { TabbedSection } from "../../tabbed-section/tabbed-section";
import type { FollowTrackerTab } from "../types";
import styles from "./follow-tracker-tabs.module.css";

export interface FollowTrackerTabsProps {
  readonly trackers: readonly FollowTrackerTab[];
  readonly selectedTrackerId: string | null;
  readonly onSelectTracker: (trackerId: string) => void;
}

function getSelectedTabId(trackers: readonly FollowTrackerTab[], selectedTrackerId: string | null): string | null {
  if (selectedTrackerId == null) {
    return null;
  }

  for (const tracker of trackers) {
    if (tracker.trackerId === selectedTrackerId) {
      return selectedTrackerId;
    }
  }

  return null;
}

export function FollowTrackerTabs({
  trackers,
  selectedTrackerId,
  onSelectTracker,
}: FollowTrackerTabsProps): React.ReactElement {
  const selectedTabId = getSelectedTabId(trackers, selectedTrackerId);
  const tabs = trackers.map((entry) => ({
    id: entry.trackerId,
    label: (
      <span className={styles.tabLabel}>
        <span className={styles.tabGamertag}>{entry.gamertag}</span>
        {entry.isLive && (
          <span className={styles.liveBadge} data-testid="live-badge">
            Live
          </span>
        )}
      </span>
    ),
    content: null,
  }));

  return (
    <>
      {tabs.length > 0 && (
        <TabbedSection
          tabs={tabs}
          selectedTabId={selectedTabId}
          tabListAriaLabel="Followed trackers"
          onTabChange={onSelectTracker}
          variant="navigation"
          tabsClassName={styles.tabs}
        />
      )}
    </>
  );
}
