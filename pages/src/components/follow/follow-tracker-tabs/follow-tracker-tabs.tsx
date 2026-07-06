import React from "react";
import type { TrackerDirectory } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import { TabbedSection } from "../../tabbed-section/tabbed-section";
import styles from "./follow-tracker-tabs.module.css";

export interface FollowTrackerTabsProps {
  readonly directory: TrackerDirectory;
  readonly selectedTrackerId: string | null;
  readonly onSelectTracker: (trackerId: string) => void;
}

function getSelectedTabId(directory: TrackerDirectory, selectedTrackerId: string | null): string | null {
  if (selectedTrackerId == null) {
    return null;
  }

  for (const tracker of directory.trackers) {
    if (tracker.trackerId === selectedTrackerId) {
      return selectedTrackerId;
    }
  }

  return null;
}

export function FollowTrackerTabs({
  directory,
  selectedTrackerId,
  onSelectTracker,
}: FollowTrackerTabsProps): React.ReactElement {
  const selectedTabId = getSelectedTabId(directory, selectedTrackerId);
  const tabs = directory.trackers.map((entry) => ({
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
