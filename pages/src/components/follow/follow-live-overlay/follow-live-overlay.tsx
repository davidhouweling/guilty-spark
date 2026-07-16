import React from "react";
import type { HaloInfiniteClient } from "halo-infinite-api";
import type { TrackerViewState } from "@guilty-spark/shared/contracts/individual-tracker/view";
import type { ComponentLoaderStatus } from "../../component-loader/component-loader";
import { ComponentLoader } from "../../component-loader/component-loader";
import { LoadingState } from "../../loading-state/loading-state";
import { createIndividualTrackerOverlayPage } from "../../individual-tracker/overlay/create";
import guiltySparkIcon from "../../../assets/guilty-spark-icon.png";
import guiltySparkRampantIcon from "../../../assets/guilty-spark-rampant-icon.png";
import type { HaloMedalMetadataResolver } from "../../../services/halo/medal-metadata-resolver";
import type { IndividualTrackerViewService } from "../../../services/individual-tracker/view-types";
import type { MatchAnalyticsService } from "../../../services/stats/match-analytics-types";
import type { SeriesMatchesService } from "../../../services/stats/series-matches-types";
import styles from "./follow-live-overlay.module.css";

export interface FollowLiveOverlayProps {
  readonly loadStatus: ComponentLoaderStatus;
  readonly connectionHealth: "healthy" | "degraded";
  readonly liveTrackerId: string | null;
  readonly liveTrackerView: TrackerViewState | undefined;
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly seriesMatchesService: SeriesMatchesService;
  readonly haloClient: HaloInfiniteClient;
  readonly medalMetadataResolver: HaloMedalMetadataResolver;
  readonly showPreview?: boolean;
  readonly previewMode?: "player" | "observer";
}

export function FollowLiveOverlay({
  loadStatus,
  connectionHealth,
  liveTrackerId,
  liveTrackerView,
  individualTrackerViewService,
  matchAnalyticsService,
  seriesMatchesService,
  haloClient,
  medalMetadataResolver,
  showPreview = false,
  previewMode = "observer",
}: FollowLiveOverlayProps): React.ReactElement {
  const IndividualTrackerOverlayPage = React.useMemo(
    () =>
      createIndividualTrackerOverlayPage({
        individualTrackerViewService,
        matchAnalyticsService,
        seriesMatchesService,
        haloClient,
        medalMetadataResolver,
      }),
    [haloClient, individualTrackerViewService, matchAnalyticsService, medalMetadataResolver, seriesMatchesService],
  );

  const loadedState =
    liveTrackerId != null ? (
      <IndividualTrackerOverlayPage
        key={liveTrackerId}
        trackerId={liveTrackerId}
        externalView={liveTrackerView}
        showPreview={showPreview}
        previewMode={previewMode}
      />
    ) : (
      <LoadingState text="No active tracker — waiting for a live game" />
    );

  return (
    <div className={styles.overlay}>
      <img
        src={connectionHealth === "healthy" ? guiltySparkIcon.src : guiltySparkRampantIcon.src}
        alt={connectionHealth === "healthy" ? "Connection healthy" : "Connection issue"}
        className={styles.connectionIcon}
      />
      <ComponentLoader
        status={loadStatus}
        loading={<LoadingState text="Loading tracker directory..." />}
        error={<LoadingState text="Loading tracker directory..." />}
        loaded={loadedState}
      />
    </div>
  );
}
