import React, { useMemo } from "react";
import classNames from "classnames";
import type { ImageMetadata } from "astro";
import type { IndividualTrackerState } from "@guilty-spark/shared/individual-tracker/types";
import type { TrackerMatchHistoryEntry, TrackerMatchHistoryResponse } from "../../../services/individual-tracker/types";
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
import { createMatchStatsPresenter } from "../../stats/create";
import type { MatchStatsData } from "../../stats/types";
import { SeriesTeamStatsPresenter } from "../../stats/series-team-stats-presenter";
import { SeriesPlayerStatsPresenter } from "../../stats/series-player-stats-presenter";
import type { SeriesMetadata } from "../../stats/series-metadata";
import { getTeamColorOrDefault } from "../../team-colors/team-colors";
import liveStyles from "../../live-tracker/live-tracker.module.css";
import { LoadingState } from "../../loading-state/loading-state";
import styles from "./individual-tracker-viewer.module.css";

interface IndividualTrackerViewerProps {
  readonly trackerId: string | null;
  readonly viewSource: "tracker" | "active" | null;
  readonly connectionStatus: "idle" | "connecting" | "connected" | "stopped" | "error" | "disconnected" | "not_found";
  readonly errorMessage: string | null;
  readonly state: IndividualTrackerState | null;
  readonly matchHistory: TrackerMatchHistoryResponse | null;
  readonly matchHistoryLoading: boolean;
  readonly defaultTeamColor: string;
  readonly defaultEnemyColor: string;
  readonly onBackToManage: () => void;
}

interface SeriesGroupViewModel {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly seriesScore: string;
  readonly entries: readonly TrackerMatchHistoryEntry[];
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

function toCompactSeriesResult(resultString: string): string {
  return resultString.replace(/^(Win|Loss|Tie|DNF|Unknown)\s*-\s*/i, "").trim();
}

function buildEntryByIdMap(entries: readonly TrackerMatchHistoryEntry[]): Map<string, TrackerMatchHistoryEntry> {
  const map = new Map<string, TrackerMatchHistoryEntry>();
  for (const entry of entries) {
    map.set(entry.matchId, entry);
  }
  return map;
}

function computeSeriesScore(entries: readonly TrackerMatchHistoryEntry[]): string {
  let wins = 0;
  let losses = 0;

  for (const entry of entries) {
    if (entry.outcome === "Win") {
      wins += 1;
    }

    if (entry.outcome === "Loss") {
      losses += 1;
    }
  }

  return `${wins.toString()}:${losses.toString()}`;
}

function getSeriesSubtitle(entries: readonly TrackerMatchHistoryEntry[]): string {
  if (entries.length === 0) {
    return "No matches";
  }

  const [first] = entries;
  return `${entries.length.toString()} games • ${first.modeName} on ${first.mapName}`;
}

function buildSeriesGroups(
  trackedMatchIds: readonly string[],
  matchHistory: TrackerMatchHistoryResponse | null,
): { groups: readonly SeriesGroupViewModel[]; groupedMatchIds: Set<string> } {
  if (matchHistory == null) {
    return { groups: [], groupedMatchIds: new Set<string>() };
  }

  const trackedIdSet = new Set(trackedMatchIds);
  const groupedMatchIds = new Set<string>();
  const entryById = buildEntryByIdMap(matchHistory.matches);
  const groups: SeriesGroupViewModel[] = [];

  for (const suggestedGroup of matchHistory.suggestedGroupings) {
    const filteredIds = suggestedGroup.filter((matchId) => trackedIdSet.has(matchId));
    if (filteredIds.length < 2) {
      continue;
    }

    const entries = trackedMatchIds
      .filter((matchId) => filteredIds.includes(matchId))
      .map((matchId) => entryById.get(matchId))
      .filter((entry): entry is TrackerMatchHistoryEntry => entry != null);

    if (entries.length < 2) {
      continue;
    }

    for (const matchId of filteredIds) {
      groupedMatchIds.add(matchId);
    }

    const groupNumber = groups.length + 1;
    groups.push({
      id: `series-${groupNumber.toString()}`,
      title: `Series ${groupNumber.toString()}`,
      subtitle: getSeriesSubtitle(entries),
      seriesScore: computeSeriesScore(entries),
      entries,
    });
  }

  return { groups, groupedMatchIds };
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleString();
}

function computeSeriesMetadata(
  entries: readonly TrackerMatchHistoryEntry[],
  seriesScore: string,
): SeriesMetadata | null {
  if (entries.length === 0) {
    return null;
  }

  const [first] = entries;
  const last = entries[entries.length - 1];
  const firstTime = first.startTimeIso ?? first.startTime;
  const lastTime = last.endTimeIso ?? last.endTime;
  const startMs = new Date(firstTime).getTime();
  const endMs = new Date(lastTime).getTime();

  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) {
    return null;
  }

  const totalMs = endMs - startMs;
  const totalMinutes = Math.floor(totalMs / 60000);
  const totalSeconds = Math.floor((totalMs % 60000) / 1000);

  return {
    score: seriesScore,
    duration: `${totalMinutes.toLocaleString()}m ${totalSeconds.toLocaleString()}s`,
    startTime: firstTime,
    endTime: lastTime,
  };
}

export function IndividualTrackerViewer({
  trackerId,
  viewSource,
  connectionStatus,
  errorMessage,
  state,
  matchHistory,
  matchHistoryLoading,
  defaultTeamColor,
  defaultEnemyColor,
  onBackToManage,
}: IndividualTrackerViewerProps): React.ReactElement {
  const entryById = useMemo(() => buildEntryByIdMap(matchHistory?.matches ?? []), [matchHistory]);

  const trackedEntries = useMemo(() => {
    if (state == null) {
      return [];
    }

    return state.matchIds
      .map((matchId) => entryById.get(matchId))
      .filter((entry): entry is TrackerMatchHistoryEntry => entry != null);
  }, [entryById, state]);

  const { groups: seriesGroups, groupedMatchIds } = useMemo(
    () => buildSeriesGroups(state?.matchIds ?? [], matchHistory),
    [matchHistory, state?.matchIds],
  );

  const allMatchStats = useMemo(() => {
    const statsByMatchId = new Map<string, MatchStatsData[] | null>();

    for (const entry of trackedEntries) {
      if (entry.rawMatchStats == null) {
        statsByMatchId.set(entry.matchId, null);
        continue;
      }

      try {
        const matchStatsPresenter = createMatchStatsPresenter(entry.rawMatchStats.MatchInfo.GameVariantCategory);
        const playerMap = new Map(Object.entries(entry.playerXuidToGametag ?? {}));
        statsByMatchId.set(entry.matchId, matchStatsPresenter.getData(entry.rawMatchStats, playerMap, {}));
      } catch {
        statsByMatchId.set(entry.matchId, null);
      }
    }

    return statsByMatchId;
  }, [trackedEntries]);

  const seriesStatsByGroup = useMemo(() => {
    const groupStats = new Map<
      string,
      { teamData: MatchStatsData[]; playerData: MatchStatsData[]; metadata: SeriesMetadata | null }
    >();

    const teamPresenter = new SeriesTeamStatsPresenter();
    const playerPresenter = new SeriesPlayerStatsPresenter();

    for (const group of seriesGroups) {
      const rawMatchStats = group.entries
        .map((entry) => entry.rawMatchStats)
        .filter((matchStats): matchStats is NonNullable<typeof matchStats> => matchStats != null);

      if (rawMatchStats.length === 0) {
        continue;
      }

      const allPlayerXuidToGametag = new Map<string, string>();
      for (const entry of group.entries) {
        for (const [xuid, gamertag] of Object.entries(entry.playerXuidToGametag ?? {})) {
          allPlayerXuidToGametag.set(xuid, gamertag);
        }
      }

      groupStats.set(group.id, {
        teamData: teamPresenter.getSeriesData(rawMatchStats, allPlayerXuidToGametag, {}),
        playerData: playerPresenter.getSeriesData(rawMatchStats, allPlayerXuidToGametag, {}),
        metadata: computeSeriesMetadata(group.entries, group.seriesScore),
      });
    }

    return groupStats;
  }, [seriesGroups]);

  const standaloneMatches = useMemo(
    () => trackedEntries.filter((entry) => !groupedMatchIds.has(entry.matchId)),
    [groupedMatchIds, trackedEntries],
  );

  const accumulatedStats = useMemo(() => {
    const totals = {
      total: trackedEntries.length,
      wins: 0,
      losses: 0,
      ties: 0,
      customOrLocal: 0,
      matchmaking: 0,
      groupedSeries: seriesGroups.length,
      standalone: standaloneMatches.length,
    };

    for (const entry of trackedEntries) {
      if (entry.outcome === "Win") {
        totals.wins += 1;
      }
      if (entry.outcome === "Loss") {
        totals.losses += 1;
      }
      if (entry.outcome === "Tie") {
        totals.ties += 1;
      }

      if (entry.isMatchmaking) {
        totals.matchmaking += 1;
      } else {
        totals.customOrLocal += 1;
      }
    }

    return totals;
  }, [seriesGroups.length, standaloneMatches.length, trackedEntries]);

  const overallScore = `${accumulatedStats.wins.toString()}:${accumulatedStats.losses.toString()}`;
  const teamColorsArray = [
    getTeamColorOrDefault(state?.teamColor ?? defaultTeamColor, 0),
    getTeamColorOrDefault(state?.enemyColor ?? defaultEnemyColor, 1),
  ] as const;

  const trackedPlayerTotals = useMemo(() => {
    if (state == null) {
      return null;
    }

    const rawMatchStats = trackedEntries
      .map((entry) => entry.rawMatchStats)
      .filter((matchStats): matchStats is NonNullable<typeof matchStats> => matchStats != null);

    if (rawMatchStats.length === 0) {
      return null;
    }

    const allPlayerXuidToGametag = new Map<string, string>();
    for (const entry of trackedEntries) {
      for (const [xuid, gamertag] of Object.entries(entry.playerXuidToGametag ?? {})) {
        allPlayerXuidToGametag.set(xuid, gamertag);
      }
    }

    const playerPresenter = new SeriesPlayerStatsPresenter();
    const allPlayerData = playerPresenter.getSeriesData(rawMatchStats, allPlayerXuidToGametag, {});
    const trackedGamertag = state.gamertag.trim().toLowerCase();

    const filteredPlayerData = allPlayerData
      .map((team) => ({
        ...team,
        players: team.players.filter((player) => {
          const rawName = player.name.split(" (")[0] ?? player.name;
          return rawName.trim().toLowerCase() === trackedGamertag;
        }),
      }))
      .filter((team) => team.players.length > 0);

    if (filteredPlayerData.length === 0) {
      return null;
    }

    return {
      teamData: [] as MatchStatsData[],
      playerData: filteredPlayerData,
      metadata: computeSeriesMetadata(trackedEntries, overallScore),
      title: `${state.gamertag} Totals`,
    };
  }, [overallScore, state, trackedEntries]);

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
                {state != null ? formatDateTime(state.lastUpdateTime) : "-"}
              </span>
            </div>
            <div className={liveStyles.headerMetaRow}>
              <span className={liveStyles.headerMetaLabel}>Status</span>
              <span
                className={classNames(liveStyles.headerMetaValue, {
                  [styles.statusActiveText]: state?.status === "active",
                  [styles.statusPausedText]: state?.status === "paused",
                  [styles.statusStoppedText]: state?.status === "stopped",
                })}
              >
                {state?.status ?? connectionStatus}
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

        {state == null ? (
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
                  <span className={styles.statValue}>{accumulatedStats.total.toString()}</span>
                </li>
                <li className={styles.statCard}>
                  <span className={styles.statLabel}>Record</span>
                  <span className={styles.statValue}>
                    {accumulatedStats.wins.toString()}W {accumulatedStats.losses.toString()}L{" "}
                    {accumulatedStats.ties.toString()}T
                  </span>
                </li>
                <li className={styles.statCard}>
                  <span className={styles.statLabel}>Series Groups</span>
                  <span className={styles.statValue}>{accumulatedStats.groupedSeries.toString()}</span>
                </li>
                <li className={styles.statCard}>
                  <span className={styles.statLabel}>Standalone Matches</span>
                  <span className={styles.statValue}>{accumulatedStats.standalone.toString()}</span>
                </li>
                <li className={styles.statCard}>
                  <span className={styles.statLabel}>Matchmaking</span>
                  <span className={styles.statValue}>{accumulatedStats.matchmaking.toString()}</span>
                </li>
                <li className={styles.statCard}>
                  <span className={styles.statLabel}>Custom / Local</span>
                  <span className={styles.statValue}>{accumulatedStats.customOrLocal.toString()}</span>
                </li>
              </ul>
            </Container>

            {trackedPlayerTotals != null && (
              <Container className={classNames(liveStyles.contentContainer, styles.viewerSection)}>
                <h2 className={styles.sectionTitle}>Tracked Player Totals</h2>
                <div className={styles.matchStatsCard}>
                  <SeriesStats
                    teamData={trackedPlayerTotals.teamData}
                    playerData={trackedPlayerTotals.playerData}
                    title={trackedPlayerTotals.title}
                    metadata={trackedPlayerTotals.metadata}
                    teamColors={teamColorsArray}
                    omitStatKeys={["team", "gamertag"]}
                  />
                </div>
              </Container>
            )}

            <Container className={classNames(liveStyles.contentContainer, styles.viewerSection)}>
              <h2 className={styles.matchesTitle}>Tracked Gameplay</h2>

              {matchHistoryLoading && <LoadingState text="Loading enriched match history..." />}

              {seriesGroups.length > 0 && (
                <section className={styles.seriesSection}>
                  <h3 className={styles.sectionTitle}>Series</h3>
                  {seriesGroups.map((group, index) => {
                    const [firstMatch] = group.entries;

                    return (
                      <details className={styles.seriesGroup} key={group.id} open={index === 0}>
                        <summary className={styles.seriesSummary}>
                          <div className={styles.seriesHeading}>
                            <span className={styles.seriesTitle}>{group.title}</span>
                            <span className={styles.seriesSubtitle}>{group.subtitle}</span>
                          </div>
                          <span className={styles.seriesScore}>{group.seriesScore}</span>
                        </summary>

                        <SeriesOverview
                          className={styles.groupSeriesOverview}
                          hidePartBorders={true}
                          seriesScore={group.seriesScore}
                          matches={group.entries.map((entry) => ({
                            id: entry.matchId,
                            gameMode: entry.modeName,
                            score: toCompactSeriesResult(entry.resultString),
                            mapName: entry.mapName,
                            mapThumbnailUrl: entry.mapThumbnailUrl,
                          }))}
                          teams={firstMatch.teams.slice(0, 2).map((team, teamIndex) => ({
                            id: `${group.id}-team-${teamIndex.toString()}`,
                            name: `Team ${(teamIndex + 1).toLocaleString()}`,
                            colorHex: teamColorsArray[teamIndex]?.hex,
                            players: team.map((player) => ({
                              id: `${group.id}-team-${teamIndex.toString()}-${player}`,
                              content: player,
                            })),
                          }))}
                          gameModeIconSrc={gameModeIconSrc}
                        />

                        {((): React.ReactElement => {
                          const groupStats = seriesStatsByGroup.get(group.id);

                          return (
                            <div className={styles.seriesMatches}>
                              {groupStats != null && (
                                <div className={styles.matchStatsCard}>
                                  <SeriesStats
                                    teamData={groupStats.teamData}
                                    playerData={groupStats.playerData}
                                    title="Series Totals"
                                    metadata={groupStats.metadata}
                                    teamColors={teamColorsArray}
                                  />
                                </div>
                              )}

                              {group.entries.map((entry, entryIndex) => {
                                const matchStats = allMatchStats.get(entry.matchId) ?? null;

                                if (matchStats == null) {
                                  return (
                                    <Alert key={entry.matchId} variant="warning">
                                      Match stats unavailable for {entry.matchId}
                                    </Alert>
                                  );
                                }

                                return (
                                  <div className={styles.matchStatsCard} key={entry.matchId}>
                                    <MatchStatsView
                                      data={matchStats}
                                      id={entry.matchId}
                                      backgroundImageUrl={entry.mapThumbnailUrl}
                                      gameModeIconUrl={gameModeIconSrc(entry.modeName)}
                                      gameModeAlt={entry.modeName}
                                      matchNumber={entryIndex + 1}
                                      gameTypeAndMap={entry.gameTypeAndMap ?? `${entry.modeName}: ${entry.mapName}`}
                                      duration={entry.duration}
                                      score={entry.resultString}
                                      startTime={entry.startTimeIso ?? entry.startTime}
                                      endTime={entry.endTimeIso ?? entry.endTime}
                                      teamColors={teamColorsArray}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </details>
                    );
                  })}
                </section>
              )}

              {standaloneMatches.length > 0 && (
                <section className={styles.standaloneSection}>
                  <h3 className={styles.sectionTitle}>Standalone Matches</h3>
                  {standaloneMatches.map((entry, entryIndex) => {
                    const matchStats = allMatchStats.get(entry.matchId) ?? null;

                    return (
                      <div className={styles.standaloneMatch} key={entry.matchId}>
                        {matchStats == null ? (
                          <Alert variant="warning">Match stats unavailable for {entry.matchId}</Alert>
                        ) : (
                          <MatchStatsView
                            data={matchStats}
                            id={entry.matchId}
                            backgroundImageUrl={entry.mapThumbnailUrl}
                            gameModeIconUrl={gameModeIconSrc(entry.modeName)}
                            gameModeAlt={entry.modeName}
                            matchNumber={entryIndex + 1}
                            gameTypeAndMap={entry.gameTypeAndMap ?? `${entry.modeName}: ${entry.mapName}`}
                            duration={entry.duration}
                            score={entry.resultString}
                            startTime={entry.startTimeIso ?? entry.startTime}
                            endTime={entry.endTimeIso ?? entry.endTime}
                            teamColors={teamColorsArray}
                          />
                        )}
                      </div>
                    );
                  })}
                </section>
              )}

              {!matchHistoryLoading && trackedEntries.length === 0 ? (
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
