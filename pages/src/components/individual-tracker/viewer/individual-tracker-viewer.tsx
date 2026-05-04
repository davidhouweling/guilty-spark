import React from "react";
import { addMinutes } from "date-fns";
import ReactTimeAgo from "react-time-ago";
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
import { PlayerPreSeriesInfo } from "../../player-pre-series-info/player-pre-series-info";
import liveStyles from "../../live-tracker/live-tracker.module.css";
import { LoadingState } from "../../loading-state/loading-state";
import type { TrackerSearchResult } from "../../../services/individual-tracker/types";
import { TrackerSummary } from "../tracker-summary/tracker-summary";
import type { IndividualTrackerViewerRenderModel } from "../types";
import { HALO_TEAM_COLORS } from "../../team-colors/team-colors";
import styles from "./individual-tracker-viewer.module.css";

interface IndividualTrackerViewerProps {
  readonly trackerGamertag: string | null;
  readonly connectionStatus: "idle" | "connecting" | "connected" | "stopped" | "error" | "disconnected" | "not_found";
  readonly errorMessage: string | null;
  readonly canManage: boolean;
  readonly refreshInProgress: boolean;
  readonly refreshStartedAt: string | null;
  readonly refreshPending: boolean;
  readonly refreshMessage: string | null;
  readonly trackerSummary: TrackerSearchResult | null;
  readonly renderModel: IndividualTrackerViewerRenderModel | null;
  readonly matchHistoryLoading: boolean;
  readonly onBackToManage: () => void;
  readonly onRefresh: () => void;
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

function parseDate(value: string | null): Date | null {
  if (value == null) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
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
  trackerGamertag,
  connectionStatus,
  errorMessage,
  canManage,
  refreshInProgress,
  refreshStartedAt,
  refreshPending,
  refreshMessage,
  trackerSummary,
  renderModel,
  matchHistoryLoading,
  onBackToManage,
  onRefresh,
}: IndividualTrackerViewerProps): React.ReactElement {
  const lastUpdatedTime = renderModel?.lastUpdatedTime ?? null;
  const trackerStatus = renderModel?.trackerStatus ?? null;
  const [isWideView, setIsWideView] = React.useState(false);
  const headerTitle = trackerGamertag != null && trackerGamertag !== "" ? `${trackerGamertag} Tracker` : "Tracker";
  const lastUpdatedDate = parseDate(lastUpdatedTime);
  const refreshStartedDate = parseDate(refreshStartedAt);
  const nextAutomaticRefreshDate =
    trackerStatus === "active" && lastUpdatedDate != null ? addMinutes(lastUpdatedDate, 3) : null;

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
      {canManage && (
        <Container>
          <div className={styles.viewerActionBar}>
            <Button variant="secondary" size="small" className={styles.backButton} onClick={onBackToManage}>
              Back to manager
            </Button>

            <div className={styles.viewerActionRight}>
              <p className={styles.refreshHint}>
                {refreshInProgress ? (
                  refreshStartedDate != null ? (
                    <>
                      Refresh started <ReactTimeAgo date={refreshStartedDate} locale="en" />
                    </>
                  ) : (
                    "Refreshing now."
                  )
                ) : trackerStatus === "paused" ? (
                  "Automatic refresh paused."
                ) : trackerStatus === "stopped" ? (
                  "Automatic refresh stopped."
                ) : nextAutomaticRefreshDate != null ? (
                  <>
                    Next automatic refresh <ReactTimeAgo date={nextAutomaticRefreshDate} locale="en" />
                  </>
                ) : (
                  "Automatic refresh schedule unavailable."
                )}
              </p>
              <Button
                variant="secondary"
                size="small"
                onClick={onRefresh}
                disabled={refreshPending || refreshInProgress || trackerStatus !== "active"}
              >
                Refresh
              </Button>
            </div>
          </div>
        </Container>
      )}

      <Container>
        <div className={liveStyles.headerBar}>
          <div className={liveStyles.headerLeft}>
            <div className={styles.viewerHeader}>
              <h1 className={liveStyles.headerTitle}>{headerTitle}</h1>
              {trackerSummary != null ? (
                <TrackerSummary tracker={trackerSummary} className={styles.viewerSummary} />
              ) : null}
            </div>
          </div>

          <div className={liveStyles.headerRight}>
            <div className={liveStyles.headerMetaRow}>
              <span className={liveStyles.headerMetaLabel}>Last updated</span>
              <span className={liveStyles.headerMetaValue}>
                {lastUpdatedDate != null ? <ReactTimeAgo date={lastUpdatedDate} locale="en" /> : "-"}
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

        {refreshMessage != null && canManage && (
          <Container className={classNames(liveStyles.contentContainer, styles.viewerSection)}>
            <Alert variant="info">{refreshMessage}</Alert>
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

              {renderModel.activeNeatQueueSeries != null && (
                <section className={styles.seriesSection}>
                  <div className={styles.seriesGroup}>
                    <div className={styles.seriesSummary}>
                      <div className={styles.seriesHeading}>
                        <div className={styles.seriesTitleRow}>
                          <span className={styles.seriesTitle}>{renderModel.activeNeatQueueSeries.title}</span>
                          <span className={styles.seriesSubtitle}>{renderModel.activeNeatQueueSeries.subtitle}</span>
                        </div>
                      </div>
                      <div className={styles.seriesSummaryRight}>
                        <span className={styles.seriesScore}>{renderModel.activeNeatQueueSeries.seriesScore}</span>
                      </div>
                    </div>

                    <SeriesOverview
                      className={styles.groupSeriesOverview}
                      hidePartBorders={true}
                      seriesScore={renderModel.activeNeatQueueSeries.seriesScore}
                      matches={[]}
                      teams={renderModel.activeNeatQueueSeries.teams.map((team, teamIndex) => ({
                        id: `active-neatqueue-team-${teamIndex.toString()}`,
                        name: team.name,
                        colorHex: renderModel.teamColors[teamIndex]?.hex,
                        players: team.players.map((player) => ({
                          id: player.id,
                          content: player.displayName,
                        })),
                      }))}
                      gameModeIconSrc={gameModeIconSrc}
                      emptyState={
                        <Alert variant="info" icon="⏳">
                          Waiting for first match to complete...
                        </Alert>
                      }
                    />

                    <PlayerPreSeriesInfo
                      className={styles.viewerSection}
                      teams={renderModel.activeNeatQueueSeries.teams}
                      playersAssociationData={renderModel.activeNeatQueueSeries.playersAssociationData}
                      teamColors={renderModel.teamColors}
                    />

                    {renderModel.activeNeatQueueSeries.substitutions.length > 0 ? (
                      <div className={styles.seriesMatches}>
                        {renderModel.activeNeatQueueSeries.substitutions.map((substitution) => (
                          <Alert key={substitution.id} variant="info" icon="↔️">
                            <strong>{substitution.playerInDisplayName}</strong> subbed in for{" "}
                            <strong>{substitution.playerOutDisplayName}</strong> ({substitution.teamName})
                          </Alert>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </section>
              )}

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
