import React, { useMemo } from "react";
import ReactTimeAgo from "react-time-ago";
import classNames from "classnames";
import { compareAsc } from "date-fns";
import assaultPng from "../../assets/game-modes/assault.png";
import captureTheFlagPng from "../../assets/game-modes/capture-the-flag.png";
import strongholdsPng from "../../assets/game-modes/strongholds.png";
import oddballPng from "../../assets/game-modes/oddball.png";
import slayerPng from "../../assets/game-modes/slayer.png";
import kingOfTheHillPng from "../../assets/game-modes/king-of-the-hill.png";
import { createMatchStatsPresenter } from "../stats/create";
import type { MatchStatsData } from "../stats/types";
import { MatchStats as MatchStatsView } from "../stats/match-stats";
import { SeriesStats } from "../stats/series-stats";
import { SeriesTeamStatsPresenter } from "../stats/series-team-stats-presenter";
import { SeriesPlayerStatsPresenter } from "../stats/series-player-stats-presenter";
import { Container } from "../container/container";
import { Alert } from "../alert/alert";
import styles from "./live-tracker.module.css";
import type { LiveTrackerViewModel } from "./types";

interface LiveTrackerProps {
  readonly model: LiveTrackerViewModel;
}

function gameModeIconUrl(gameMode: string): ImageMetadata {
  // todo: resolve the rest of the game modes
  switch (gameMode) {
    case "Capture the Flag": {
      return captureTheFlagPng;
    }
    case "Strongholds": {
      return strongholdsPng;
    }
    case "Oddball": {
      return oddballPng;
    }
    case "King of the Hill": {
      return kingOfTheHillPng;
    }
    case "Neutral Bomb": {
      return assaultPng;
    }
    case "Slayer":
    default: {
      return slayerPng;
    }
  }
}

export function LiveTrackerView({ model }: LiveTrackerProps): React.ReactElement {
  const hasMatches = model.state != null && model.state.matches.length > 0;

  // Sort substitutions by timestamp for rendering between matches
  const sortedSubstitutions = useMemo(() => {
    if (!model.state) {
      return [];
    }
    return [...model.state.substitutions].sort((a, b) => compareAsc(a.timestamp, b.timestamp));
  }, [model.state]);

  const allMatchStats = useMemo((): { matchId: string; data: MatchStatsData[] | null }[] => {
    if (!model.state) {
      return [];
    }

    return model.state.matches.map((match) => {
      if (match.rawMatchStats == null) {
        return { matchId: match.matchId, data: null };
      }

      try {
        const matchStats = match.rawMatchStats;
        const presenter = createMatchStatsPresenter(matchStats.MatchInfo.GameVariantCategory);
        const playerMap = new Map<string, string>(Object.entries(match.playerXuidToGametag));
        return { matchId: match.matchId, data: presenter.getData(matchStats, playerMap, model.state?.medalMetadata) };
      } catch (error) {
        console.error("Error processing match stats:", error);
        return { matchId: match.matchId, data: null };
      }
    });
  }, [model.state]);

  const seriesStats = useMemo((): { teamData: MatchStatsData[]; playerData: MatchStatsData[] } | null => {
    if (!model.state || model.state.matches.length === 0) {
      return null;
    }

    const rawMatchStats = model.state.matches
      .map((match) => match.rawMatchStats)
      .filter((stats): stats is NonNullable<typeof stats> => stats != null);

    if (rawMatchStats.length === 0) {
      return null;
    }

    try {
      const teamPresenter = new SeriesTeamStatsPresenter();
      const playerPresenter = new SeriesPlayerStatsPresenter();

      const allPlayerXuidToGametag = new Map<string, string>();
      for (const match of model.state.matches) {
        for (const [xuid, gamertag] of Object.entries(match.playerXuidToGametag)) {
          allPlayerXuidToGametag.set(xuid, gamertag);
        }
      }

      return {
        teamData: teamPresenter.getSeriesData(rawMatchStats, allPlayerXuidToGametag, model.state.medalMetadata),
        playerData: playerPresenter.getSeriesData(rawMatchStats, allPlayerXuidToGametag, model.state.medalMetadata),
      };
    } catch (error) {
      console.error("Error processing series stats:", error);
      return null;
    }
  }, [model.state]);

  const title: string[] = [model.guildNameText];
  if (model.state) {
    title.push(`#${model.state.queueNumber.toString()}`);
    title.push(`(${model.state.seriesScore})`);
  }
  title.push("| Live Tracker - Guilty Spark");

  return (
    <>
      <title>{title.join(" ")}</title>
      <Container>
        <div className={styles.headerBar}>
          <div className={styles.headerLeft}>
            <h1 className={styles.headerTitle}>{model.guildNameText}</h1>
            <div className={styles.headerSubtitle}>
              Queue #{model.state ? model.state.queueNumber.toString() : model.queueNumberText}
            </div>
          </div>

          <div className={styles.headerRight}>
            <div className={styles.headerMetaRow}>
              <span className={styles.headerMetaLabel}>Last updated</span>
              <span className={styles.headerMetaValue}>
                {model.state ? <ReactTimeAgo date={new Date(model.state.lastUpdateTime)} locale="en" /> : "-"}
              </span>
            </div>
            <div className={styles.headerMetaRow}>
              <span className={styles.headerMetaLabel}>Status</span>
              <span id="status-text" className={classNames(styles.headerMetaValue, model.statusClassName)}>
                {model.state ? model.state.status : model.statusText}
              </span>
            </div>
          </div>
        </div>
      </Container>

      <Container mobileDown="0" className={styles.dataContainer}>
        {model.state?.status === "stopped" ? (
          <Container>
            <Alert variant="info">The series has completed. Tracker stopped.</Alert>
          </Container>
        ) : null}

        {model.state ? (
          <>
            <Container>
              <h2 className={styles.sectionTitle}>Series overview</h2>
              <div className={styles.seriesOverview}>
                <section className={styles.seriesScores}>
                  {hasMatches ? (
                    <>
                      <h3 className={styles.seriesScoresHeader} aria-label="Series scores">
                        {model.state.seriesScore.replaceAll(/(🦅|🐍)/g, "").trim()}
                      </h3>
                      <ul className={styles.seriesScoresList}>
                        {model.state.matches.map((match) => (
                          <li
                            key={match.matchId}
                            className={styles.seriesScore}
                            style={((): React.CSSProperties & { readonly "--series-score-bg": string } => {
                              return {
                                "--series-score-bg": `url(${match.gameMapThumbnailUrl})`,
                              };
                            })()}
                          >
                            <a href={`#${match.matchId}`} className={styles.seriesScoreLink}>
                              <img
                                src={gameModeIconUrl(match.gameType).src}
                                alt={match.gameType}
                                className={styles.gameTypeIcon}
                              />
                              {match.gameScore}
                              {match.gameSubScore != null ? (
                                <span className={styles.seriesSubScore}>({match.gameSubScore})</span>
                              ) : (
                                ""
                              )}
                              <span className={styles.gameTypeAndMap}>{match.gameMap}</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <div className={styles.noticeFlexFill}>
                      <Alert variant="info" icon="⏳">
                        Waiting for first match to complete...
                      </Alert>
                    </div>
                  )}
                </section>
                {model.state.teams.map((team) => {
                  return (
                    <section key={team.name} className={styles.teamCard}>
                      <h3 className={styles.teamName}>{team.name}</h3>
                      <ul className={styles.playerList}>
                        {team.players.map((player) => {
                          return <li key={player.id}>{player.displayName}</li>;
                        })}
                      </ul>
                    </section>
                  );
                })}
              </div>
            </Container>
            {seriesStats && (
              <Container mobileDown="0">
                <SeriesStats
                  teamData={seriesStats.teamData}
                  playerData={seriesStats.playerData}
                  title="Series Totals"
                  subtitle="Legend: Bold = Best in team | Underline = Best overall"
                />
              </Container>
            )}
            {hasMatches && (
              <>
                <Container>
                  <h2 className={styles.sectionTitle}>Matches</h2>
                </Container>
                {((): React.ReactElement[] => {
                  const elements: React.ReactElement[] = [];
                  let substitutionIndex = 0;

                  for (const [matchIndex, match] of model.state.matches.entries()) {
                    // Add any substitutions that occurred before this match
                    while (substitutionIndex < sortedSubstitutions.length) {
                      const substitution = sortedSubstitutions[substitutionIndex];
                      if (new Date(match.endTime) < new Date(substitution.timestamp)) {
                        break;
                      }

                      elements.push(
                        <Container key={`sub-${substitution.timestamp}`}>
                          <Alert variant="info" icon="↔️">
                            <strong>{substitution.playerInDisplayName}</strong> subbed in for{" "}
                            <strong>{substitution.playerOutDisplayName}</strong> ({substitution.teamName})
                          </Alert>
                        </Container>,
                      );
                      substitutionIndex++;
                    }

                    // Add match
                    const matchStats = allMatchStats.find((stats) => stats.matchId === match.matchId);

                    elements.push(
                      matchStats?.data ? (
                        <Container key={match.matchId} mobileDown="0">
                          <MatchStatsView
                            data={matchStats.data}
                            id={match.matchId}
                            backgroundImageUrl={match.gameMapThumbnailUrl}
                            gameModeIconUrl={gameModeIconUrl(match.gameType).src}
                            gameModeAlt={match.gameType}
                            matchNumber={matchIndex + 1}
                            gameTypeAndMap={match.gameTypeAndMap}
                            duration={match.duration}
                            score={match.gameScore}
                            startTime={match.startTime}
                            endTime={match.endTime}
                          />
                        </Container>
                      ) : (
                        <Container key={match.matchId}>
                          <Alert variant="warning">Match stats unavailable</Alert>
                        </Container>
                      ),
                    );
                  }

                  // Add any remaining substitutions that occurred after the last match
                  while (substitutionIndex < sortedSubstitutions.length) {
                    const substitution = sortedSubstitutions[substitutionIndex];
                    elements.push(
                      <Container key={`sub-${substitution.timestamp}`}>
                        <Alert variant="info" icon="↔️">
                          <strong>{substitution.playerInDisplayName}</strong> subbed in for{" "}
                          <strong>{substitution.playerOutDisplayName}</strong> ({substitution.teamName})
                        </Alert>
                      </Container>,
                    );
                    substitutionIndex++;
                  }

                  return elements;
                })()}
              </>
            )}
            {!hasMatches && sortedSubstitutions.length > 0 && (
              <Container>
                {sortedSubstitutions.map((substitution) => (
                  <Alert key={substitution.timestamp} variant="info" icon="↔️">
                    <strong>{substitution.playerInDisplayName}</strong> subbed in for{" "}
                    <strong>{substitution.playerOutDisplayName}</strong> ({substitution.teamName})
                  </Alert>
                ))}
              </Container>
            )}
          </>
        ) : (
          <Container>
            <Alert variant="info">{model.statusText}</Alert>
          </Container>
        )}
      </Container>
    </>
  );
}
