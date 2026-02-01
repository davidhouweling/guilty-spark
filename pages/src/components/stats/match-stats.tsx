import type { MatchStats } from "halo-infinite-api";
import React from "react";
import type { MatchStatsData } from "./types";
import styles from "./match-stats.module.css";

interface MatchStatsProps {
  readonly data: MatchStatsData[];
  readonly backgroundImageUrl: string;
  readonly gameModeIconUrl: string;
  readonly gameModeAlt: string;
  readonly matchNumber: number;
  readonly gameTypeAndMap: string;
  readonly duration: string;
  readonly score: string;
  readonly endTime: string;
}

export function MatchStats({
  data,
  backgroundImageUrl,
  gameModeIconUrl,
  gameModeAlt,
  matchNumber,
  gameTypeAndMap,
  duration,
  score,
  endTime,
}: MatchStatsProps): React.ReactElement {
  const hasTeamStats = data.length > 0 && data[0].teamStats.length > 0;
  const statColumns = data[0]?.players[0]?.values ?? [];

  return (
    <div
      className={styles.matchStatsContainer}
      style={{ "--match-bg": `url(${backgroundImageUrl})` } as React.CSSProperties}
    >
      <img src={gameModeIconUrl} alt={gameModeAlt} className={styles.gameModeIcon} />
      <h3 className={styles.matchTitle}>
        Match {matchNumber}: {gameTypeAndMap}
      </h3>
      <p className={styles.matchMetadata}>
        <span className={styles.matchMetaLabel}>Score:</span> <span className={styles.matchMetaValue}>{score}</span>
        <span className={styles.matchMetaSeparator}>•</span>
        <span className={styles.matchMetaLabel}>Duration:</span>{" "}
        <span className={styles.matchMetaValue}>{duration}</span>
        <span className={styles.matchMetaSeparator}>•</span>
        <span className={styles.matchMetaLabel}>End time:</span>{" "}
        <span className={styles.matchMetaValue}>{endTime}</span>
      </p>
      {hasTeamStats && (
        <div className={styles.teamTotals}>
          <h3 className={styles.subsectionHeader}>Team Totals</h3>
          <div className={styles.tableWrapper}>
            <table className={styles.statsTable}>
              <thead>
                <tr>
                  <th>Team</th>
                  {data[0].teamStats.map((stat) => (
                    <th key={stat.name}>{stat.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((teamData) => (
                  <tr key={teamData.teamId}>
                    <td className={styles.labelCell}>Team {teamData.teamId + 1}</td>
                    {teamData.teamStats.map((stat) => (
                      <td
                        key={stat.name}
                        className={`${styles.statCell} ${stat.bestInMatch ? styles.bestInMatch : ""}`}
                      >
                        {stat.display}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className={styles.playerStats}>
        <h3 className={styles.subsectionHeader}>Players</h3>
        <div className={styles.tableWrapper}>
          <table className={styles.statsTable}>
            <thead>
              <tr>
                <th>Team</th>
                <th>Gamertag</th>
                <th>Rank</th>
                <th>Score</th>
                {statColumns.map((stat) => (
                  <th key={stat.name}>{stat.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((teamData) =>
                teamData.players.map((player) => (
                  <tr key={`${teamData.teamId.toString()}-${player.name}`}>
                    <td className={styles.labelCell}>Team {teamData.teamId + 1}</td>
                    <td className={styles.labelCell}>{player.name}</td>
                    <td className={styles.labelCell}>{player.rank}</td>
                    <td className={styles.labelCell}>{player.personalScore}</td>
                    {player.values.map((stat) => (
                      <td
                        key={stat.name}
                        className={`${styles.statCell} ${
                          stat.bestInTeam ? styles.bestInTeam : ""
                        } ${stat.bestInMatch ? styles.bestInMatch : ""}`}
                      >
                        {stat.display}
                      </td>
                    ))}
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
