import React from "react";
import { Alert } from "../../alert/alert";
import type { TrackerListItem, TrackerRowAction } from "../tracker-list/tracker-list";
import { TrackerList } from "../tracker-list/tracker-list";

interface LiveTrackersSectionViewProps {
  readonly errorMessage: string | null;
  readonly trackerItems: readonly TrackerListItem[];
  readonly getActions: (item: TrackerListItem) => readonly TrackerRowAction[];
  readonly onAddTracker: () => void;
  readonly dialogs?: React.ReactNode;
}

export function LiveTrackersSectionView({
  errorMessage,
  trackerItems,
  getActions,
  onAddTracker,
  dialogs,
}: LiveTrackersSectionViewProps): React.ReactElement {
  return (
    <>
      {errorMessage != null && <Alert variant="error">{errorMessage}</Alert>}
      <TrackerList items={trackerItems} getActions={getActions} onAddTracker={onAddTracker} />
      {dialogs}
    </>
  );
}
