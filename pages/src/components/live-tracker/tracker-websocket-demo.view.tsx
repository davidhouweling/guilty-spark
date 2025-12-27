import React from "react";
import styles from "./tracker-websocket-demo.module.css";
import type { TrackerWebSocketDemoViewModel } from "./types";

interface TrackerWebsocketDemoProps {
  readonly model: TrackerWebSocketDemoViewModel;
}

export function TrackerWebSocketDemoView({ model }: TrackerWebsocketDemoProps): React.ReactElement {
  return (
    <>
      <div className={styles.headerBar}>
        <div className={styles.headerLeft}>
          <h1 className={styles.headerTitle}>Guild {model.guildIdText}</h1>
          <div className={styles.headerSubtitle}>
            Queue #{model.state ? model.state.queueNumber.toString() : model.queueNumberText}
          </div>
        </div>

        <div className={styles.headerRight}>
          <div className={styles.headerMetaRow}>
            <span className={styles.headerMetaLabel}>Last updated</span>
            <span className={styles.headerMetaValue}>{model.state ? model.state.lastUpdateTime : "-"}</span>
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
            <h2 className={styles.sectionTitle}>Teams</h2>
            <div className={styles.teams}>
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

            <h2 className={styles.sectionTitle}>Matches</h2>
            {model.state.matches.length > 0 ? (
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
            ) : (
              <div className={styles.notice}>⏳ Waiting for first match to complete...</div>
            )}
          </>
        ) : (
          <div className={styles.notice}>{model.rawMessageText}</div>
        )}
      </div>
    </>
  );
}
