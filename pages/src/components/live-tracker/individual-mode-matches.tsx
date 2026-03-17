import React from "react";
import classNames from "classnames";
import { format, parseISO } from "date-fns";
import type { LiveTrackerStatus } from "@guilty-spark/contracts/live-tracker/types";
import { Container } from "../container/container";
import { Alert } from "../alert/alert";
import { Collapsible } from "../collapsible/collapsible";
import { MatchStats as MatchStatsView } from "../stats/match-stats";
import { SeriesStats } from "../stats/series-stats";
import type { SeriesMetadata } from "../stats/series-metadata";
import type { TeamColor } from "../team-colors/team-colors";
import type { MatchStatsData } from "../stats/types";
import type { LiveTrackerMatchRenderModel, LiveTrackerMatchGrouping, LiveTrackerSeriesDataRenderModel } from "./types";
import styles from "./live-tracker.module.css";

interface IndividualModeMatchesProps {
  readonly matches: readonly LiveTrackerMatchRenderModel[];
  readonly matchGroupings: Record<string, LiveTrackerMatchGrouping>;
  readonly allMatchStats: readonly { matchId: string; data: MatchStatsData[] | null }[];
  readonly groupingStats: Map<
    string,
    { teamData: MatchStatsData[]; playerData: MatchStatsData[]; metadata: SeriesMetadata | null }
  >;
  readonly gameModeIconUrl: (gameMode: string) => string;
  readonly teamColors: readonly TeamColor[];
  readonly viewMode: string;
  readonly guildName: string;
  readonly seriesData?: LiveTrackerSeriesDataRenderModel;
  readonly status: LiveTrackerStatus;
}

export function IndividualModeMatches({
  matches,
  matchGroupings,
  allMatchStats,
  groupingStats,
  gameModeIconUrl,
  teamColors,
  viewMode,
  guildName,
  seriesData,
  status,
}: IndividualModeMatchesProps): React.ReactElement {
  const renderedGroups = new Set<string>();
  const elements: React.ReactElement[] = [];

  // Build match-to-group map
  const matchToGroup = new Map<string, string>();
  for (const [groupId, grouping] of Object.entries(matchGroupings)) {
    for (const matchId of grouping.matchIds) {
      matchToGroup.set(matchId, groupId);
    }
  }

  for (const [matchIndex, match] of matches.entries()) {
    const groupId = matchToGroup.get(match.matchId);

    // If match belongs to a group and we haven't rendered it yet
    if (groupId !== undefined && !renderedGroups.has(groupId)) {
      renderedGroups.add(groupId);
      const grouping = matchGroupings[groupId];
      const groupMatches = matches.filter((m) => grouping.matchIds.includes(m.matchId));
      const stats = groupingStats.get(groupId);

      // Determine if this is the active NeatQueue series
      const isNeatQueueSeries =
        seriesData != null &&
        seriesData.seriesId.guildId === grouping.seriesId?.guildId &&
        seriesData.seriesId.queueNumber === grouping.seriesId.queueNumber;

      // Determine if series is completed (status is not "active")
      const isCompletedSeries = isNeatQueueSeries && status !== "active";

      // Determine label
      let groupLabel: string;
      let seriesBadge: React.ReactElement | null = null;

      if (grouping.seriesId !== undefined) {
        // Only show badge if this is the active NeatQueue series
        if (isNeatQueueSeries) {
          const badgeText = isCompletedSeries ? "Completed Series" : "Active Series";
          const badgeClass = isCompletedSeries ? styles.seriesBadgeCompleted : styles.seriesBadgeActive;
          seriesBadge = <span className={badgeClass}>{badgeText}</span>;
        }
        groupLabel = `${guildName} - Queue #${String(grouping.seriesId.queueNumber)}`;
      } else {
        // Use date range
        const startDate = parseISO(groupMatches[0].startTime);
        const endDate = parseISO(groupMatches[groupMatches.length - 1].endTime);
        groupLabel = `Series Matches ${format(startDate, "MMM d, h:mm a")} to ${format(endDate, "MMM d, h:mm a")}`;
      }

      elements.push(
        <Container key={`group-${groupId}`} className={classNames(styles.contentContainer, styles[viewMode])}>
          <Collapsible
            title={
              <h3 className={styles.sectionTitle}>
                {seriesBadge && <>{seriesBadge} </>}
                {groupLabel}
              </h3>
            }
            defaultExpanded={true}
          >
            {/* Display NeatQueue series info if available */}
            {isNeatQueueSeries && (
              <div className={styles.seriesInfo}>
                <div className={styles.seriesScore}>{seriesData.seriesScore}</div>
                <div className={styles.seriesTeams}>
                  {seriesData.teams.map((team, teamIdx) => (
                    <div key={teamIdx} className={styles.seriesTeam}>
                      <strong>{team.name}:</strong> {team.playerIds.length} players
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Match scores overview */}
            <div className={styles.seriesScoresCompact}>
              {groupMatches.map((gMatch, idx) => (
                <a key={gMatch.matchId} href={`#${gMatch.matchId}`} className={styles.seriesScoreCompactItem}>
                  Game {String(idx + 1)}: {gMatch.gameScore}
                </a>
              ))}
            </div>

            {/* Group series stats */}
            {stats !== undefined && (
              <Container mobileDown="0" className={classNames(styles.contentContainer, styles[viewMode])}>
                <SeriesStats
                  teamData={stats.teamData}
                  playerData={stats.playerData}
                  title="Series Totals"
                  metadata={stats.metadata}
                  teamColors={teamColors}
                />
              </Container>
            )}

            {/* Individual matches in the group */}
            {groupMatches.map((gMatch, idx) => {
              const matchStats = allMatchStats.find((s) => s.matchId === gMatch.matchId);
              return matchStats?.data ? (
                <Container
                  key={gMatch.matchId}
                  mobileDown="0"
                  className={classNames(styles.contentContainer, styles[viewMode])}
                >
                  <Collapsible title={`Match ${String(idx + 1)}: ${gMatch.gameTypeAndMap}`} defaultExpanded={false}>
                    <MatchStatsView
                      data={matchStats.data}
                      id={gMatch.matchId}
                      backgroundImageUrl={gMatch.gameMapThumbnailUrl}
                      gameModeIconUrl={gameModeIconUrl(gMatch.gameType)}
                      gameModeAlt={gMatch.gameType}
                      matchNumber={idx + 1}
                      gameTypeAndMap={gMatch.gameTypeAndMap}
                      duration={gMatch.duration}
                      score={gMatch.gameScore}
                      startTime={gMatch.startTime}
                      endTime={gMatch.endTime}
                      teamColors={teamColors}
                    />
                  </Collapsible>
                </Container>
              ) : (
                <Container key={gMatch.matchId} className={classNames(styles.contentContainer, styles[viewMode])}>
                  <Alert variant="warning">Match stats unavailable</Alert>
                </Container>
              );
            })}
          </Collapsible>
        </Container>,
      );
    } else if (groupId === undefined) {
      // Ungrouped standalone match
      const matchStats = allMatchStats.find((stats) => stats.matchId === match.matchId);

      elements.push(
        matchStats?.data ? (
          <Container
            key={match.matchId}
            mobileDown="0"
            className={classNames(styles.contentContainer, styles[viewMode])}
          >
            <Collapsible title={`Match ${String(matchIndex + 1)}: ${match.gameTypeAndMap}`} defaultExpanded={true}>
              <MatchStatsView
                data={matchStats.data}
                id={match.matchId}
                backgroundImageUrl={match.gameMapThumbnailUrl}
                gameModeIconUrl={gameModeIconUrl(match.gameType)}
                gameModeAlt={match.gameType}
                matchNumber={matchIndex + 1}
                gameTypeAndMap={match.gameTypeAndMap}
                duration={match.duration}
                score={match.gameScore}
                startTime={match.startTime}
                endTime={match.endTime}
                teamColors={teamColors}
              />
            </Collapsible>
          </Container>
        ) : (
          <Container key={match.matchId} className={classNames(styles.contentContainer, styles[viewMode])}>
            <Alert variant="warning">Match stats unavailable</Alert>
          </Container>
        ),
      );
    }
  }

  return <>{elements}</>;
}
