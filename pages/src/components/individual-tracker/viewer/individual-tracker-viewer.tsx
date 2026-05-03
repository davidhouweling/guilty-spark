import React from "react";
import classNames from "classnames";
import type { ImageMetadata } from "astro";
import assaultPng from "../../../assets/game-modes/assault.png";
import captureTheFlagPng from "../../../assets/game-modes/capture-the-flag.png";
import kingOfTheHillPng from "../../../assets/game-modes/king-of-the-hill.png";
import oddballPng from "../../../assets/game-modes/oddball.png";
import slayerPng from "../../../assets/game-modes/slayer.png";
import strongholdsPng from "../../../assets/game-modes/strongholds.png";
import { Alert } from "../../alert/alert";
import { Button } from "../../button/button";
import { CollapsiblePanel } from "../../collapsible-panel/collapsible-panel";
import { Container } from "../../container/container";
import { MatchStats as MatchStatsView, MatchStatsHeader } from "../../stats/match-stats";
import { SeriesStats } from "../../stats/series-stats";
import { SeriesOverview } from "../../stats/series-overview/series-overview";
import liveStyles from "../../live-tracker/live-tracker.module.css";
import { LoadingState } from "../../loading-state/loading-state";
import type { IndividualTrackerViewerRenderModel } from "../types";
import { HALO_TEAM_COLORS } from "../../team-colors/team-colors";
import styles from "./individual-tracker-viewer.module.css";

interface IndividualTrackerViewerProps {
  readonly trackerId: string | null;
  readonly viewSource: "tracker" | "active" | null;
  readonly connectionStatus: "idle" | "connecting" | "connected" | "stopped" | "error" | "disconnected" | "not_found";
  readonly errorMessage: string | null;
  readonly renderModel: IndividualTrackerViewerRenderModel | null;
  readonly matchHistoryLoading: boolean;
  readonly onBackToManage: () => void;
}

const GAME_MODE_ICONS: Record<string, ImageMetadata> = {
  Slayer: slayerPng,
  "Capture the Flag": captureTheFlagPng,
  Strongholds: strongholdsPng,
  Oddball: oddballPng,
  "King of the Hill": kingOfTheHillPng,
  "Neutral Bomb": assaultPng,
};

function gameModeIconSrc(gameMode: string): string {
  return (GAME_MODE_ICONS[gameMode] ?? GAME_MODE_ICONS.Slayer).src;
}

function formatDateTime(value: unknown): string {
  if (typeof value !== "string") {
    return "Unknown";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleString();
}

function ExpandWidthIcon(): React.ReactElement {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.inlineIcon}>
      <path
        d="M3 9V4h5M21 9V4h-5M3 15v5h5M21 15v5h-5M9 4 4 9M15 4l5 5M9 20l-5-5M15 20l5-5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }): React.ReactElement {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={classNames(styles.chevronIcon, { [styles.chevronExpanded]: expanded })}
    >
      <path
        d="M6 9l6 6 6-6"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export function IndividualTrackerViewer({
  trackerId,
  viewSource,
  connectionStatus,
  errorMessage,
  renderModel,
  matchHistoryLoading,
  onBackToManage,
}: IndividualTrackerViewerProps): React.ReactElement {
  const lastUpdatedTime = renderModel?.lastUpdatedTime ?? null;
  const trackerStatus = renderModel?.trackerStatus ?? null;
  const [isWideView, setIsWideView] = React.useState(false);

  const groupColorById = React.useMemo(() => {
    const next = new Map<string, string>();
    if (renderModel == null) {
      return next;
    }

    let visibleSeriesIndex = 0;
    for (const item of renderModel.gameplayTimeline) {
      if (item.type !== "group") {
        continue;
      }

      const color = HALO_TEAM_COLORS[visibleSeriesIndex % HALO_TEAM_COLORS.length]?.hex ?? HALO_TEAM_COLORS[0].hex;
      next.set(item.id, color);
      visibleSeriesIndex += 1;
    }

    return next;
  }, [renderModel]);

  return (
    <>
      <Container>
        <div className={liveStyles.headerBar}>
          <div className={liveStyles.headerLeft}>
            <h1 className={liveStyles.headerTitle}>Viewing Tracker</h1>
            <div className={liveStyles.headerSubtitle}>
              {viewSource === "active"
                ? "Following your currently active on-stream tracker"
                : trackerId != null
                  ? `Live view for tracker ${trackerId}`
                  : "Live tracker view"}
            </div>
          </div>

          <div className={liveStyles.headerRight}>
            <div className={liveStyles.headerMetaRow}>
              <span className={liveStyles.headerMetaLabel}>Last updated</span>
              <span className={liveStyles.headerMetaValue}>
                {lastUpdatedTime != null ? formatDateTime(lastUpdatedTime) : "-"}
              </span>
            </div>
            <div className={liveStyles.headerMetaRow}>
              <span className={liveStyles.headerMetaLabel}>Status</span>
              <span
                className={classNames(liveStyles.headerMetaValue, {
                  [styles.statusActiveText]: trackerStatus === "active",
                  [styles.statusPausedText]: trackerStatus === "paused",
                  [styles.statusStoppedText]: trackerStatus === "stopped",
                })}
              >
                {trackerStatus ?? connectionStatus}
              </span>
            </div>
            <div className={styles.inlineControls}>
              <Button onClick={onBackToManage}>Back to manager</Button>
            </div>
          </div>
        </div>
      </Container>

      <Container
        mobileDown="0"
        tabletUp={isWideView ? "0" : undefined}
        desktopUp={isWideView ? "0" : undefined}
        ultrawideUp={isWideView ? "0" : undefined}
        className={classNames(liveStyles.dataContainer, liveStyles.contentContainer, styles.viewerDataContainer, {
          [liveStyles.wide]: isWideView,
        })}
      >
        {connectionStatus === "not_found" && (
          <Container className={classNames(liveStyles.contentContainer, styles.viewerSection)}>
            <Alert variant="warning">This tracker could not be found. It may have been deleted or stopped.</Alert>
          </Container>
        )}

        {connectionStatus === "error" && (
          <Container className={classNames(liveStyles.contentContainer, styles.viewerSection)}>
            <Alert variant="error">{errorMessage ?? "Tracker connection failed."}</Alert>
          </Container>
        )}

        {renderModel == null ? (
          <Container className={classNames(liveStyles.contentContainer, styles.viewerSection)}>
            <Alert variant="info">Waiting for tracker state...</Alert>
          </Container>
        ) : (
          <>
            <Container
              className={classNames(liveStyles.contentContainer, styles.viewerSection, {
                [liveStyles.wide]: isWideView,
              })}
            >
              <div className={styles.sectionHeaderRow}>
                <h2 className={styles.sectionTitle}>Accumulated Stats</h2>
                <Button
                  variant="secondary"
                  size="small"
                  icon={<ExpandWidthIcon />}
                  onClick={(): void => {
                    setIsWideView((current) => !current);
                  }}
                >
                  {isWideView ? "Standard width" : "Wide view"}
                </Button>
              </div>
              <ul className={styles.accumulatedGrid}>
                <li className={styles.statCard}>
                  <span className={styles.statLabel}>Total Games</span>
                  <span className={styles.statValue}>{renderModel.accumulatedStats.total.toString()}</span>
                </li>
                <li className={styles.statCard}>
                  <span className={styles.statLabel}>Record</span>
                  <span className={styles.statValue}>
                    {renderModel.accumulatedStats.wins.toString()}W {renderModel.accumulatedStats.losses.toString()}L{" "}
                    {renderModel.accumulatedStats.ties.toString()}T
                  </span>
                </li>
                <li className={styles.statCard}>
                  <span className={styles.statLabel}>Series Groups</span>
                  <span className={styles.statValue}>{renderModel.accumulatedStats.groupedSeries.toString()}</span>
                </li>
                <li className={styles.statCard}>
                  <span className={styles.statLabel}>Standalone Matches</span>
                  <span className={styles.statValue}>{renderModel.accumulatedStats.standalone.toString()}</span>
                </li>
                <li className={styles.statCard}>
                  <span className={styles.statLabel}>Matchmaking</span>
                  <span className={styles.statValue}>{renderModel.accumulatedStats.matchmaking.toString()}</span>
                </li>
                <li className={styles.statCard}>
                  <span className={styles.statLabel}>Custom / Local</span>
                  <span className={styles.statValue}>{renderModel.accumulatedStats.customOrLocal.toString()}</span>
                </li>
              </ul>
              {renderModel.trackedPlayerTotals != null ? (
                <div className={classNames(styles.matchStatsCard, styles.accumulatedTableCard)}>
                  <SeriesStats
                    teamData={renderModel.trackedPlayerTotals.teamData}
                    playerData={renderModel.trackedPlayerTotals.playerData}
                    title={renderModel.trackedPlayerTotals.title}
                    metadata={renderModel.trackedPlayerTotals.metadata}
                    teamColors={renderModel.teamColors}
                    showHeader={false}
                    showSectionHeaders={false}
                    highlightBestStats={false}
                    omitStatKeys={["team", "gamertag"]}
                  />
                </div>
              ) : null}
            </Container>

            <Container
              className={classNames(liveStyles.contentContainer, styles.viewerSection, {
                [liveStyles.wide]: isWideView,
              })}
            >
              <h2 className={styles.matchesTitle}>Tracked Gameplay</h2>

              {matchHistoryLoading && <LoadingState text="Loading enriched match history..." />}

              {renderModel.gameplayTimeline.map((item) => {
                if (item.type === "group") {
                  const groupColor = groupColorById.get(item.id) ?? HALO_TEAM_COLORS[0].hex;
                  return (
                    <section
                      className={styles.seriesSection}
                      key={item.id}
                      style={{ "--group-color": groupColor } as React.CSSProperties}
                    >
                      <CollapsiblePanel
                        id={item.id}
                        defaultExpanded={true}
                        className={styles.seriesGroup}
                        toggleClassName={styles.seriesSummary}
                        contentClassName={styles.collapsibleBody}
                        contentInnerClassName={styles.collapsibleBody}
                        header={(expanded) => (
                          <>
                            <div className={styles.seriesHeading}>
                              <div className={styles.seriesTitleRow}>
                                <span className={styles.seriesTitle}>{item.title}</span>
                                <span className={styles.seriesSubtitle}>{item.subtitle}</span>
                              </div>
                            </div>
                            <div className={styles.seriesSummaryRight}>
                              <span className={styles.seriesScore}>{item.seriesScore}</span>
                              <ChevronIcon expanded={expanded} />
                            </div>
                          </>
                        )}
                      >
                        <>
                          <SeriesOverview
                            className={styles.groupSeriesOverview}
                            hidePartBorders={true}
                            seriesScore={item.seriesScore}
                            matches={item.overviewMatches}
                            teams={item.teams}
                            gameModeIconSrc={gameModeIconSrc}
                          />

                          <div className={styles.seriesMatches}>
                            {item.seriesTotals != null ? (
                              <div className={styles.matchStatsCard}>
                                <SeriesStats
                                  teamData={item.seriesTotals.teamData}
                                  playerData={item.seriesTotals.playerData}
                                  title="Series Totals"
                                  metadata={item.seriesTotals.metadata}
                                  teamColors={renderModel.teamColors}
                                />
                              </div>
                            ) : null}

                            {item.matches.map((match) => {
                              if (match.matchStats == null) {
                                return (
                                  <Alert key={match.id} variant="warning">
                                    Match stats unavailable for {match.id}
                                  </Alert>
                                );
                              }

                              return (
                                <div className={styles.matchStatsCard} key={match.id}>
                                  <MatchStatsView
                                    data={match.matchStats}
                                    id={match.id}
                                    backgroundImageUrl={match.backgroundImageUrl}
                                    gameModeIconUrl={gameModeIconSrc(match.gameMode)}
                                    gameModeAlt={match.gameMode}
                                    matchNumber={match.matchNumber}
                                    gameTypeAndMap={match.gameTypeAndMap}
                                    duration={match.duration}
                                    score={match.score}
                                    startTime={match.startTime}
                                    endTime={match.endTime}
                                    teamColors={renderModel.teamColors}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </>
                      </CollapsiblePanel>
                    </section>
                  );
                }

                return (
                  <section className={styles.standaloneSection} key={item.id}>
                    <CollapsiblePanel
                      id={item.id}
                      defaultExpanded={true}
                      className={styles.standaloneMatch}
                      toggleClassName={styles.matchToggle}
                      contentClassName={styles.collapsibleBody}
                      contentInnerClassName={styles.collapsibleBody}
                      header={(expanded) => (
                        <div className={styles.matchToggleHeader}>
                          <MatchStatsHeader
                            className={styles.standaloneMatchHeader}
                            title={`Match ${item.match.matchNumber.toString()}: ${item.match.gameTypeAndMap}`}
                            backgroundImageUrl={item.match.backgroundImageUrl}
                            gameModeIconUrl={gameModeIconSrc(item.match.gameMode)}
                            gameModeAlt={item.match.gameMode}
                            duration={item.match.duration}
                            score={item.match.score}
                            startTime={item.match.startTime}
                            endTime={item.match.endTime}
                            showFade={expanded}
                          />
                          <span className={styles.matchToggleIndicator}>
                            <ChevronIcon expanded={expanded} />
                          </span>
                        </div>
                      )}
                    >
                      {item.match.matchStats == null ? (
                        <Alert variant="warning">Match stats unavailable for {item.match.id}</Alert>
                      ) : (
                        <MatchStatsView
                          data={item.match.matchStats}
                          id={item.match.id}
                          backgroundImageUrl={item.match.backgroundImageUrl}
                          gameModeIconUrl={gameModeIconSrc(item.match.gameMode)}
                          gameModeAlt={item.match.gameMode}
                          matchNumber={item.match.matchNumber}
                          gameTypeAndMap={item.match.gameTypeAndMap}
                          duration={item.match.duration}
                          score={item.match.score}
                          startTime={item.match.startTime}
                          endTime={item.match.endTime}
                          teamColors={renderModel.teamColors}
                          showHeader={false}
                          seamlessTop={true}
                        />
                      )}
                    </CollapsiblePanel>
                  </section>
                );
              })}

              {!matchHistoryLoading && renderModel.trackedEntriesCount === 0 ? (
                <p className={styles.placeholderText}>No tracked matches available yet.</p>
              ) : (
                <></>
              )}
            </Container>
          </>
        )}
      </Container>
    </>
  );
}
