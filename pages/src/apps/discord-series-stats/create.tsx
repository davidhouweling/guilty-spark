import React from "react";
import type { CSSProperties, ReactElement } from "react";
import type { MatchStats } from "halo-infinite-api";
import classNames from "classnames";
import type { DiscordSeriesStatsResolved } from "@guilty-spark/shared/contracts/stats/discord-series";
import { gameModeIconSrc } from "../../components/individual-tracker/game-mode-icon";
import { createMatchStatsPresenter } from "../../components/stats/create";
import { SeriesTeamStatsPresenter } from "../../components/stats/series-team-stats-presenter";
import { SeriesPlayerStatsPresenter } from "../../components/stats/series-player-stats-presenter";
import { MatchStats as MatchStatsView } from "../../components/stats/match-stats";
import { SeriesStats } from "../../components/stats/series-stats";
import type { MatchStatsData } from "../../components/stats/types";
import { Container } from "../../components/container/container";
import { Alert } from "../../components/alert/alert";
import { DEFAULT_TEAM_COLORS, getTeamColorOrDefault, type TeamColor } from "../../components/team-colors/team-colors";
import styles from "../../components/live-tracker/live-tracker.module.css";
import { Button } from "../../components/button/button";
import localStyles from "./create.module.css";

interface DiscordSeriesStatsAppProps {
  readonly data: DiscordSeriesStatsResolved;
}

type DiscordSeriesViewMode = "standard" | "wide";
const WIN_OUTCOME = 2;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null;
}

function isMatchStats(value: unknown): value is MatchStats {
  if (!isRecord(value)) {
    return false;
  }

  const matchInfo = value.MatchInfo;
  if (!isRecord(matchInfo)) {
    return false;
  }

  return (
    typeof value.MatchId === "string" &&
    Array.isArray(value.Teams) &&
    Array.isArray(value.Players) &&
    typeof matchInfo.StartTime === "string" &&
    typeof matchInfo.EndTime === "string"
  );
}

function calculateSeriesMetadata(
  matches: readonly { startTime: string; endTime: string }[],
  seriesScore: string,
): { score: string; duration: string; startTime: string; endTime: string } | null {
  if (matches.length === 0) {
    return null;
  }

  const [firstMatch] = matches;
  const lastMatch = matches[matches.length - 1];

  const startMs = new Date(firstMatch.startTime).getTime();
  const endMs = new Date(lastMatch.endTime).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return null;
  }

  const totalMs = endMs - startMs;
  const totalMinutes = Math.floor(totalMs / 60000);
  const totalSeconds = Math.floor((totalMs % 60000) / 1000);

  return {
    score: seriesScore,
    duration: `${totalMinutes.toLocaleString()}m ${totalSeconds.toLocaleString()}s`,
    startTime: firstMatch.startTime,
    endTime: lastMatch.endTime,
  };
}

function getWinningTeamColor(rawMatch: unknown, teamColors: TeamColor[]): TeamColor | null {
  if (!isMatchStats(rawMatch)) {
    return null;
  }

  const winningTeamIndex = rawMatch.Teams.findIndex((team) => team.Outcome === WIN_OUTCOME);
  if (winningTeamIndex < 0) {
    return null;
  }

  return getTeamColorOrDefault(teamColors[winningTeamIndex]?.id, winningTeamIndex);
}

export function DiscordSeriesStatsApp({ data }: DiscordSeriesStatsAppProps): ReactElement {
  const { renderData } = data;
  const [viewMode, setViewMode] = React.useState<DiscordSeriesViewMode>("standard");
  const teamColors = [
    getTeamColorOrDefault(DEFAULT_TEAM_COLORS[0], 0),
    getTeamColorOrDefault(DEFAULT_TEAM_COLORS[1], 1),
  ];
  const contentWidthClass = viewMode === "wide" ? styles.wide : undefined;

  const allMatchStats = React.useMemo((): { matchId: string; data: MatchStatsData[] | null }[] => {
    return renderData.matches.map((match) => {
      if (!isMatchStats(match.rawMatch)) {
        return { matchId: match.matchId, data: null };
      }

      try {
        const presenter = createMatchStatsPresenter(match.rawMatch.MatchInfo.GameVariantCategory);
        const playerMap = new Map<string, string>(Object.entries(match.playerXuidToGametag));
        return { matchId: match.matchId, data: presenter.getData(match.rawMatch, playerMap) };
      } catch {
        return { matchId: match.matchId, data: null };
      }
    });
  }, [renderData.matches]);

  const seriesStats = React.useMemo(() => {
    const rawMatches = renderData.matches
      .map((match) => match.rawMatch)
      .filter((match): match is MatchStats => isMatchStats(match));
    if (rawMatches.length === 0) {
      return null;
    }

    try {
      const teamPresenter = new SeriesTeamStatsPresenter();
      const playerPresenter = new SeriesPlayerStatsPresenter();
      const playersMap = new Map<string, string>();

      for (const match of renderData.matches) {
        for (const [xuid, gamertag] of Object.entries(match.playerXuidToGametag)) {
          playersMap.set(xuid, gamertag);
        }
      }

      return {
        teamData: teamPresenter.getSeriesData(rawMatches, playersMap),
        playerData: playerPresenter.getSeriesData(rawMatches, playersMap),
        metadata: calculateSeriesMetadata(renderData.matches, renderData.seriesScore),
      };
    } catch {
      return null;
    }
  }, [renderData]);

  return (
    <>
      <Container>
        <div className={styles.headerBar}>
          <div className={styles.headerLeft}>
            <h1 className={styles.headerTitle}>{renderData.title}</h1>
            <div className={styles.headerSubtitle}>{renderData.subtitle}</div>
          </div>
          <div className={styles.headerRight}>
            <Button
              size="small"
              variant="secondary"
              aria-pressed={viewMode === "wide"}
              onClick={(): void => {
                setViewMode((current) => (current === "standard" ? "wide" : "standard"));
              }}
            >
              {viewMode === "standard" ? "Switch to wide view" : "Switch to standard view"}
            </Button>
          </div>
        </div>
      </Container>

      <Container
        mobileDown="0"
        className={classNames(styles.dataContainer, styles.contentContainer, contentWidthClass)}
      >
        <Container className={classNames(styles.contentContainer, contentWidthClass)}>
          <h2 className={styles.sectionTitle}>Series overview</h2>
          <div className={localStyles.seriesOverviewWrap}>
            <div className={styles.seriesOverview}>
              <section className={styles.seriesScores}>
                <h3 className={styles.seriesScoresHeader} aria-label="Series scores">
                  {renderData.seriesScore}
                </h3>
                <ul className={styles.seriesScoresList}>
                  {renderData.matches.map((match) => {
                    const teamColor = getWinningTeamColor(match.rawMatch, teamColors);

                    return (
                      <li
                        key={match.matchId}
                        className={styles.seriesScore}
                        style={
                          {
                            "--series-score-bg": `url(${match.gameMapThumbnailUrl})`,
                            "--team-color": teamColor?.hex ?? "transparent",
                          } as CSSProperties
                        }
                      >
                        <a
                          href={`#${match.matchId}`}
                          className={classNames(styles.seriesScoreLink, localStyles.seriesScoreLink)}
                        >
                          <img
                            src={gameModeIconSrc(match.gameVariantCategory)}
                            alt={match.gameType}
                            className={styles.gameTypeIcon}
                          />
                          {match.gameScore}
                          {match.gameSubScore != null ? (
                            <span className={styles.seriesSubScore}>({match.gameSubScore})</span>
                          ) : null}
                          <span className={styles.gameTypeAndMap}>{match.gameMap}</span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </section>

              {renderData.teams.map((team, teamIndex) => {
                const teamColor = teamIndex < 2 ? teamColors[teamIndex] : getTeamColorOrDefault(undefined, teamIndex);

                return (
                  <section
                    key={team.name}
                    className={classNames(styles.teamCard, localStyles.teamCard)}
                    style={{ "--team-color": teamColor.hex } as CSSProperties}
                  >
                    <h3 className={styles.teamName}>{team.name}</h3>
                    <ul className={classNames(styles.playerList, localStyles.playerList)}>
                      {team.players.map((player, playerIndex) => (
                        <li key={`${team.name}:${player}:${playerIndex.toString()}`}>{player}</li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          </div>
        </Container>
        {seriesStats != null && (
          <Container mobileDown="0" className={classNames(styles.contentContainer, contentWidthClass)}>
            <SeriesStats
              teamData={seriesStats.teamData}
              playerData={seriesStats.playerData}
              title="Series Totals"
              metadata={seriesStats.metadata}
              teamColors={teamColors}
            />
          </Container>
        )}

        <Container className={classNames(styles.contentContainer, contentWidthClass)}>
          <h2 className={styles.sectionTitle}>Matches</h2>
        </Container>

        {renderData.matches.map((match, index) => {
          const matchStats = allMatchStats[index];

          return (
            <Container
              key={match.matchId}
              mobileDown="0"
              className={classNames(styles.contentContainer, contentWidthClass)}
            >
              {matchStats.data != null ? (
                <MatchStatsView
                  data={matchStats.data}
                  id={match.matchId}
                  backgroundImageUrl={match.gameMapThumbnailUrl}
                  gameModeIconUrl={gameModeIconSrc(match.gameVariantCategory)}
                  gameModeAlt={match.gameType}
                  matchNumber={index + 1}
                  gameTypeAndMap={match.gameTypeAndMap}
                  duration={match.duration}
                  score={match.gameSubScore != null ? `${match.gameScore} (${match.gameSubScore})` : match.gameScore}
                  startTime={match.startTime}
                  endTime={match.endTime}
                  teamColors={teamColors}
                />
              ) : (
                <Alert variant="warning">Failed to load detailed stats for match {match.matchId}.</Alert>
              )}
            </Container>
          );
        })}
      </Container>
    </>
  );
}
