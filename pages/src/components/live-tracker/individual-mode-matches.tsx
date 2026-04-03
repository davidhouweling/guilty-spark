import React, { useMemo } from "react";
import classNames from "classnames";
import { format, parseISO } from "date-fns";
import type { LiveTrackerStatus } from "@guilty-spark/contracts/live-tracker/types";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import { Container } from "../container/container";
import { Alert } from "../alert/alert";
import { Collapsible } from "../collapsible/collapsible";
import { MatchStats as MatchStatsView } from "../stats/match-stats";
import { SeriesStats } from "../stats/series-stats";
import { createMatchStatsPresenter } from "../stats/create";
import type { SeriesMetadata } from "../stats/series-metadata";
import type { TeamColor } from "../team-colors/team-colors";
import type { MatchStatsData } from "../stats/types";
import type { LiveTrackerGroupRenderModel, LiveTrackerMatchRenderModel } from "./types";
import styles from "./live-tracker.module.css";

interface IndividualModeMatchesProps {
  readonly groups: readonly LiveTrackerGroupRenderModel[];
  readonly groupStats: Map<
    string,
    { teamData: MatchStatsData[]; playerData: MatchStatsData[]; metadata: SeriesMetadata | null }
  >;
  readonly gameModeIconUrl: (gameMode: string) => string;
  readonly teamColors: readonly TeamColor[];
  readonly viewMode: string;
  readonly guildName: string;
  readonly status: LiveTrackerStatus;
}

export function IndividualModeMatches({
  groups,
  groupStats,
  gameModeIconUrl,
  teamColors,
  viewMode,
  guildName,
  status,
}: IndividualModeMatchesProps): React.ReactElement {
  // Compute match stats for all matches across all groups
  const allMatchStats = useMemo(() => {
    const statsMap = new Map<string, MatchStatsData[] | null>();

    for (const group of groups) {
      // Handle discriminated union: get matches array based on group type
      const matchesInGroup: readonly LiveTrackerMatchRenderModel[] =
        group.type === "single-match" ? [group.match] : group.matches;

      for (const match of matchesInGroup) {
        if (match.rawMatchStats == null) {
          statsMap.set(match.matchId, null);
          continue;
        }

        try {
          const matchStats = match.rawMatchStats;
          const matchStatsPresenter = createMatchStatsPresenter(matchStats.MatchInfo.GameVariantCategory);
          const playerMap = new Map<string, string>(Object.entries(match.playerXuidToGametag));
          statsMap.set(match.matchId, matchStatsPresenter.getData(matchStats, playerMap, {}));
        } catch (error) {
          console.error("Error processing match stats:", error);
          statsMap.set(match.matchId, null);
        }
      }
    }

    return statsMap;
  }, [groups]);

  const elements: React.ReactElement[] = [];

  for (const group of groups) {
    switch (group.type) {
      case "neatqueue-series": {
        const stats = groupStats.get(group.groupId);
        const isCompletedSeries = status !== "active";

        const badgeText = isCompletedSeries ? "Completed Series" : "Active Series";
        const badgeClass = isCompletedSeries ? styles.seriesBadgeCompleted : styles.seriesBadgeActive;
        const seriesBadge = <span className={badgeClass}>{badgeText}</span>;

        const groupLabel = `${guildName} - Queue #${String(group.seriesId.queueNumber)}`;

        elements.push(
          <Container key={group.groupId} className={classNames(styles.contentContainer, styles[viewMode])}>
            <Collapsible
              title={
                <h3 className={styles.sectionTitle}>
                  {seriesBadge} {groupLabel}
                </h3>
              }
              defaultExpanded={true}
            >
              {/* Display NeatQueue series info */}
              {group.seriesData && (
                <div className={styles.seriesInfo}>
                  <div className={styles.seriesScore}>{group.seriesData.seriesScore}</div>
                  <div className={styles.seriesTeams}>
                    {group.seriesData.teams.map((team, teamIdx) => (
                      <div key={teamIdx} className={styles.seriesTeam}>
                        <strong>{team.name}:</strong> {team.playerIds.length} players
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Match scores overview */}
              <div className={styles.seriesScoresCompact}>
                {group.matches.map((gMatch, idx) => (
                  <a key={gMatch.matchId} href={`#${gMatch.matchId}`} className={styles.seriesScoreCompactItem}>
                    Game {String(idx + 1)}: {gMatch.gameScore}
                  </a>
                ))}
              </div>

              {/* Group series stats */}
              {stats && (
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
              {group.matches.map((gMatch, idx) => {
                const matchStatsData = allMatchStats.get(gMatch.matchId);
                return matchStatsData ? (
                  <Container
                    key={gMatch.matchId}
                    mobileDown="0"
                    className={classNames(styles.contentContainer, styles[viewMode])}
                  >
                    <Collapsible title={`Match ${String(idx + 1)}: ${gMatch.gameTypeAndMap}`} defaultExpanded={false}>
                      <MatchStatsView
                        data={matchStatsData}
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
        break;
      }
      case "grouped-matches": {
        const stats = groupStats.get(group.groupId);
        const startDate = parseISO(group.matches[0].startTime);
        const endDate = parseISO(group.matches[group.matches.length - 1].endTime);
        const groupLabel = `${group.label} • ${format(startDate, "MMM d, h:mm a")} to ${format(endDate, "MMM d, h:mm a")}`;

        elements.push(
          <Container key={group.groupId} className={classNames(styles.contentContainer, styles[viewMode])}>
            <Collapsible title={<h3 className={styles.sectionTitle}>{groupLabel}</h3>} defaultExpanded={true}>
              {/* Match scores overview */}
              <div className={styles.seriesScoresCompact}>
                {group.matches.map((gMatch, idx) => (
                  <a key={gMatch.matchId} href={`#${gMatch.matchId}`} className={styles.seriesScoreCompactItem}>
                    Game {String(idx + 1)}: {gMatch.gameScore}
                  </a>
                ))}
              </div>

              {/* Group series stats */}
              {stats && (
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
              {group.matches.map((gMatch, idx) => {
                const matchStatsData = allMatchStats.get(gMatch.matchId);
                return matchStatsData ? (
                  <Container
                    key={gMatch.matchId}
                    mobileDown="0"
                    className={classNames(styles.contentContainer, styles[viewMode])}
                  >
                    <Collapsible title={`Match ${String(idx + 1)}: ${gMatch.gameTypeAndMap}`} defaultExpanded={false}>
                      <MatchStatsView
                        data={matchStatsData}
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
        break;
      }
      case "single-match": {
        const { match } = group;
        const matchStatsData = allMatchStats.get(match.matchId);

        elements.push(
          matchStatsData ? (
            <Container
              key={group.groupId}
              mobileDown="0"
              className={classNames(styles.contentContainer, styles[viewMode])}
            >
              <Collapsible title={`Match: ${match.gameTypeAndMap}`} defaultExpanded={true}>
                <MatchStatsView
                  data={matchStatsData}
                  id={match.matchId}
                  backgroundImageUrl={match.gameMapThumbnailUrl}
                  gameModeIconUrl={gameModeIconUrl(match.gameType)}
                  gameModeAlt={match.gameType}
                  matchNumber={1}
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
            <Container key={group.groupId} className={classNames(styles.contentContainer, styles[viewMode])}>
              <Alert variant="warning">Match stats unavailable</Alert>
            </Container>
          ),
        );
        break;
      }
      default:
        throw new UnreachableError(group);
    }
  }

  return <>{elements}</>;
}
