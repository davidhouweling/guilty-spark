import React from "react";
import type { FollowLiveService } from "../../../services/follow/follow-types";
import type { HaloMedalMetadataResolver } from "../../../services/halo/medal-metadata-resolver";
import type { IndividualTrackerViewService } from "../../../services/individual-tracker/view-types";
import type { MatchAnalyticsService } from "../../../services/stats/match-analytics-types";
import type { SeriesMatchesService } from "../../../services/stats/series-matches-types";
import { useFollowLiveDirectory } from "../use-follow-live-directory";
import { FollowLiveViewerPresenter } from "./follow-live-viewer-presenter";
import { FollowLiveViewer } from "./follow-live-viewer";

export interface FollowLiveViewerDependencies {
  readonly followLiveService: FollowLiveService;
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly seriesMatchesService: SeriesMatchesService;
  readonly medalMetadataResolver: HaloMedalMetadataResolver;
}

export interface FollowLiveViewerProps {
  readonly gamertag: string;
}

export function createFollowLiveViewer({
  followLiveService,
  individualTrackerViewService,
  matchAnalyticsService,
  seriesMatchesService,
  medalMetadataResolver,
}: FollowLiveViewerDependencies) {
  return function FollowLiveViewerCreate({ gamertag }: FollowLiveViewerProps): React.ReactElement {
    const presenter = React.useMemo(() => new FollowLiveViewerPresenter(), []);
    const { directory, directoryStatus, selectedTrackerId, onSelectTracker, onRetry } = useFollowLiveDirectory({
      followLiveService,
      gamertag,
    });
    const model = React.useMemo(
      () => presenter.present({ gamertag, directory, directoryStatus, selectedTrackerId }),
      [directory, directoryStatus, gamertag, presenter, selectedTrackerId],
    );

    React.useEffect(() => {
      document.title = model.title;
    }, [model.title]);

    return (
      <FollowLiveViewer
        {...model}
        onSelectTracker={onSelectTracker}
        onRetry={onRetry}
        individualTrackerViewService={individualTrackerViewService}
        matchAnalyticsService={matchAnalyticsService}
        seriesMatchesService={seriesMatchesService}
        medalMetadataResolver={medalMetadataResolver}
      />
    );
  };
}
