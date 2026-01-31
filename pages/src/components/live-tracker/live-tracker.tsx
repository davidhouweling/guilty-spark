import React from "react";
import ReactTimeAgo from "react-time-ago";
import assaultPng from "../../assets/game-modes/assault.png";
import captureTheFlagPng from "../../assets/game-modes/capture-the-flag.png";
import strongholdsPng from "../../assets/game-modes/strongholds.png";
import oddballPng from "../../assets/game-modes/oddball.png";
import slayerPng from "../../assets/game-modes/slayer.png";
import kingOfTheHillPng from "../../assets/game-modes/king-of-the-hill.png";
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

  return (
    <>
      <title>
        {`${model.guildNameText} ${
          model.state ? `#${model.state.queueNumber.toString()}` : model.queueNumberText
        } : Live Tracker - Guilty Spark`}
      </title>
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
            <span id="status-text" className={`${styles.headerMetaValue} ${model.statusClassName}`}>
              {model.state ? model.state.status : model.statusText}
            </span>
          </div>
        </div>
      </div>

      <div id="data-container" className={styles.dataContainer}>
        {model.isStopped ? (
          <div className={styles.notice}>
            {model.rawMessageText.length > 0 ? model.rawMessageText : "🛑 Tracker stopped."}
          </div>
        ) : null}

        {model.state ? (
          <>
            <h2 className={styles.sectionTitle}>Series overview</h2>
            <div className={styles.seriesOverview}>
              <section className={styles.seriesScores}>
                {hasMatches ? (
                  <>
                    <h3 className={styles.teamName}>Series scores</h3>
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
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <div className={styles.notice}>⏳ Waiting for first match to complete...</div>
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

            {hasMatches && (
              <>
                <h2 className={styles.sectionTitle}>Matches</h2>
                <div className={styles.tableWrap}>
                  <table className={styles.matchesTable}>
                    <thead>
                      <tr>
                        <th>Game</th>
                        <th>Duration</th>
                        <th>Score</th>
                        <th>End time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {model.state.matches.map((match) => {
                        return (
                          <tr key={match.matchId}>
                            <td>{match.gameTypeAndMap}</td>
                            <td>{match.duration}</td>
                            <td>{match.gameScore}</td>
                            <td>{match.endTime}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        ) : (
          <div className={styles.notice}>{model.rawMessageText}</div>
        )}
      </div>
    </>
  );
}
