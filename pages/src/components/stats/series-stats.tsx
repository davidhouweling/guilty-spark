import React from "react";
import classNames from "classnames";
import type { MatchStatsData } from "./types";
import styles from "./match-stats.module.css";

interface SeriesStatsProps {
  readonly teamData: MatchStatsData[];
  readonly playerData: MatchStatsData[];
  readonly title: string;
  readonly subtitle?: string;
}

export function SeriesStats({ teamData, playerData, title, subtitle }: SeriesStatsProps): React.ReactElement {
  const hasTeamStats = teamData.length > 0 && teamData[0].teamStats.length > 0;
  const hasPlayerStats = playerData.length > 0 && playerData[0].players.length > 0;

  return (
    <div className={styles.matchStatsContainer}>
      <div
        className={styles.matchHeader}
        style={{ "--match-bg": "linear-gradient(135deg, #0a0e14 0%, #1a1e24 100%)" } as React.CSSProperties}
      >
        <div className={styles.matchHeaderContent}>
          <h3 className={styles.matchTitle}>{title}</h3>
          {subtitle != null && subtitle.length > 0 ? (
            <div className={styles.matchMetadata}>
              <span className={styles.matchMetaValue}>{subtitle}</span>
            </div>
          ) : null}
        </div>
      </div>

      {hasTeamStats && (
        <div className={styles.teamTotals}>
          <h3 className={styles.subsectionHeader}>Accumulated Team Stats</h3>
          <div className={styles.tableWrapper}>
            <table className={styles.statsTable}>
              <thead>
                <tr>
                  <th>Team</th>
                  {teamData[0].teamStats.map((stat) => (
                    <th key={stat.name}>{stat.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {teamData.map((team) => (
                  <tr key={team.teamId}>
                    <td className={styles.labelCell}>Team {team.teamId + 1}</td>
                    {team.teamStats.map((stat) => (
                      <td
                        key={stat.name}
                        className={classNames(styles.statCell, { [styles.bestInMatch]: stat.bestInMatch })}
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

      {hasPlayerStats && (
        <div className={styles.playerStats}>
          <h3 className={styles.subsectionHeader}>Accumulated Player Stats</h3>
          <div className={styles.tableWrapper}>
            <table className={styles.statsTable}>
              <thead>
                <tr>
                  <th>Team</th>
                  <th>Player</th>
                  {playerData[0].players[0].values.map((stat) => (
                    <th key={stat.name}>{stat.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {playerData.map((team) =>
                  team.players.map((player) => (
                    <tr key={`${team.teamId.toString()}-${player.name}`}>
                      <td className={styles.labelCell}>Team {team.teamId + 1}</td>
                      <td className={styles.labelCell}>{player.name}</td>
                      {player.values.map((stat) => (
                        <td
                          key={stat.name}
                          className={classNames(styles.statCell, {
                            [styles.bestInTeam]: stat.bestInTeam,
                            [styles.bestInMatch]: stat.bestInMatch,
                          })}
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
      )}
    </div>
  );
}
