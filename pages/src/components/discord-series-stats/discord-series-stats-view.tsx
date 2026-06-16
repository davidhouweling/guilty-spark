import { useCallback, useMemo, useState, type CSSProperties, type ReactElement } from "react";
import classNames from "classnames";
import type { DiscordSeriesStatsResolved } from "@guilty-spark/shared/contracts/stats/discord-series";
import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { gameModeIconSrc } from "../individual-tracker/game-mode-icon";
import { MatchStats as MatchStatsView } from "../stats/match-stats";
import { SeriesStats } from "../stats/series-stats";
import { KillMatrixFormatter } from "../../controllers/stats/kill-matrix/kill-matrix-formatter";
import type { KillMatrixViewRow } from "../../controllers/stats/kill-matrix/types";
import type { StatsController } from "../../controllers/stats/stats-controller";
import { Container } from "../container/container";
import { Alert } from "../alert/alert";
import { getTeamColorOrDefault } from "../team-colors/team-colors";
import styles from "../live-tracker/live-tracker.module.css";
import { Button } from "../button/button";
import localStyles from "./discord-series-stats.module.css";
import { DiscordSeriesStatsPresenter } from "./discord-series-stats-presenter";
import type { DiscordSeriesStatsViewModel } from "./discord-series-stats-presenter";

export type DiscordSeriesViewMode = "standard" | "wide";

interface DiscordSeriesStatsViewProps {
  readonly renderData: DiscordSeriesStatsResolved["renderData"];
  readonly model: DiscordSeriesStatsViewModel;
  readonly analyticsByMatchId: ReadonlyMap<string, MatchAnalytics>;
  readonly controller: StatsController;
}

export function DiscordSeriesStatsView({
  renderData,
  model,
  analyticsByMatchId,
  controller,
}: DiscordSeriesStatsViewProps): ReactElement {
  const [viewMode, setViewMode] = useState<DiscordSeriesViewMode>("standard");
  const contentWidthClass = viewMode === "wide" ? styles.wide : undefined;
  const handleToggleViewMode = useCallback((): void => {
    setViewMode((current) => (current === "standard" ? "wide" : "standard"));
  }, []);
  const killMatrixPresenter = useMemo(() => new KillMatrixFormatter(), []);

  const playersByXuid = useMemo((): ReadonlyMap<string, { gamertag: string; teamId: number | null }> => {
    try {
      return new Map(controller.getPlayers().map((p) => [p.xuid, { gamertag: p.gamertag, teamId: p.teamId }]));
    } catch {
      return new Map(
        renderData.matches.flatMap((match) =>
          Object.entries(match.playerXuidToGametag).map(([xuid, gamertag]) => [
            xuid,
            { gamertag, teamId: null as number | null },
          ]),
        ),
      );
    }
  }, [controller, renderData.matches]);

  const allMatchKillMatrixRows = useMemo<ReadonlyMap<string, KillMatrixViewRow[]>>(
    () =>
      new Map(
        renderData.matches.flatMap((match) => {
          const analytics = analyticsByMatchId.get(match.matchId);
          if (analytics == null) {
            return [];
          }
          return [[match.matchId, killMatrixPresenter.present({ analytics, playersByXuid })]];
        }),
      ),
    [analyticsByMatchId, killMatrixPresenter, playersByXuid, renderData.matches],
  );

  const seriesKillMatrixRows = useMemo<KillMatrixViewRow[]>(
    () => KillMatrixFormatter.aggregate([...allMatchKillMatrixRows.values()].flat()),
    [allMatchKillMatrixRows],
  );

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
              className={localStyles.switchView}
              aria-pressed={viewMode === "wide"}
              onClick={handleToggleViewMode}
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
                    const teamColor = DiscordSeriesStatsPresenter.getWinningTeamColor(match.rawMatch, model.teamColors);

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
                const teamColor =
                  teamIndex < 2 && model.teamColors.length > teamIndex
                    ? (model.teamColors[teamIndex] ?? getTeamColorOrDefault(undefined, teamIndex))
                    : getTeamColorOrDefault(undefined, teamIndex);

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
        {model.seriesStats != null && (
          <Container mobileDown="0" className={classNames(styles.contentContainer, contentWidthClass)}>
            <SeriesStats
              teamData={model.seriesStats.teamData}
              playerData={model.seriesStats.playerData}
              title="Series Totals"
              metadata={model.seriesStats.metadata}
              teamColors={model.teamColors}
              killMatrixRows={seriesKillMatrixRows}
            />
          </Container>
        )}

        <Container className={classNames(styles.contentContainer, contentWidthClass)}>
          <h2 className={styles.sectionTitle}>Matches</h2>
        </Container>

        {renderData.matches.map((match, index) => {
          const matchStats = model.allMatchStats[index];

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
                  teamColors={model.teamColors}
                  killMatrixRows={allMatchKillMatrixRows.get(match.matchId)}
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
