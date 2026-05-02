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
import { Container } from "../../container/container";
import { MatchStats as MatchStatsView } from "../../stats/match-stats";
import { SeriesStats } from "../../stats/series-stats";
import { SeriesOverview } from "../../stats/series-overview/series-overview";
import liveStyles from "../../live-tracker/live-tracker.module.css";
import { LoadingState } from "../../loading-state/loading-state";
import type { IndividualTrackerViewerRenderModel } from "../types";
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
        className={classNames(liveStyles.dataContainer, liveStyles.contentContainer, styles.viewerDataContainer)}
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
            <Container className={classNames(liveStyles.contentContainer, styles.viewerSection)}>
              <h2 className={styles.sectionTitle}>Accumulated Stats</h2>
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
            </Container>

            {renderModel.trackedPlayerTotals != null && (
              <Container className={classNames(liveStyles.contentContainer, styles.viewerSection)}>
                <h2 className={styles.sectionTitle}>Tracked Player Totals</h2>
                <div className={styles.matchStatsCard}>
                  <SeriesStats
                    teamData={renderModel.trackedPlayerTotals.teamData}
                    playerData={renderModel.trackedPlayerTotals.playerData}
                    title={renderModel.trackedPlayerTotals.title}
                    metadata={renderModel.trackedPlayerTotals.metadata}
                    teamColors={renderModel.teamColors}
                    omitStatKeys={["team", "gamertag"]}
                  />
                </div>
              </Container>
            )}

            <Container className={classNames(liveStyles.contentContainer, styles.viewerSection)}>
              <h2 className={styles.matchesTitle}>Tracked Gameplay</h2>

              {matchHistoryLoading && <LoadingState text="Loading enriched match history..." />}

              {renderModel.gameplayTimeline.map((item, timelineIndex) => {
                if (item.type === "group") {
                  return (
                    <section className={styles.seriesSection} key={item.id}>
                      <details className={styles.seriesGroup} open={timelineIndex === 0}>
                        <summary className={styles.seriesSummary}>
                          <div className={styles.seriesHeading}>
                            <span className={styles.seriesTitle}>{item.title}</span>
                            <span className={styles.seriesSubtitle}>{item.subtitle}</span>
                          </div>
                          <span className={styles.seriesScore}>{item.seriesScore}</span>
                        </summary>

                        <SeriesOverview
                          className={styles.groupSeriesOverview}
                          hidePartBorders={true}
                          seriesScore={item.seriesScore}
                          matches={item.overviewMatches}
                          teams={item.teams}
                          gameModeIconSrc={gameModeIconSrc}
                        />

                        <div className={styles.seriesMatches}>
                          {item.seriesTotals != null && (
                            <div className={styles.matchStatsCard}>
                              <SeriesStats
                                teamData={item.seriesTotals.teamData}
                                playerData={item.seriesTotals.playerData}
                                title="Series Totals"
                                metadata={item.seriesTotals.metadata}
                                teamColors={renderModel.teamColors}
                              />
                            </div>
                          )}

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
                      </details>
                    </section>
                  );
                }

                return (
                  <section className={styles.standaloneSection} key={item.id}>
                    <div className={styles.standaloneMatch}>
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
                        />
                      )}
                    </div>
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
