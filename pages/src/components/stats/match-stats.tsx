import type { MatchStats } from "halo-infinite-api";
import React from "react";
import classNames from "classnames";
import { SortableTable, type SortableTableColumn } from "../table/sortable-table";
import tableStyles from "../table/table.module.css";
import { TeamIcon } from "../icons/team-icon";
import { MedalIcon } from "../icons/medal-icon";
import type { MatchStatsData, MatchStatsPlayerData } from "./types";
import styles from "./match-stats.module.css";

interface MatchStatsProps {
  readonly data: MatchStatsData[];
  readonly id: string;
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
  id,
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

  // Define team stats columns
  const teamColumns = React.useMemo<SortableTableColumn<MatchStatsData>[]>(() => {
    if (!hasTeamStats) {
      return [];
    }

    const statColumns = data[0].teamStats;
    return [
      {
        id: "team",
        header: "Team",
        accessorFn: (row: MatchStatsData): number => row.teamId,
        cell: (value: unknown): React.ReactNode => <TeamIcon teamId={value as number} size="small" />,
        headerClassName: undefined,
        cellClassName: tableStyles.labelCell,
        sortingFn: "basic",
      },
      ...statColumns.map((stat) => ({
        id: stat.name,
        header: stat.name,
        accessorFn: (row: MatchStatsData): number => {
          const teamStat = row.teamStats.find((s) => s.name === stat.name);
          return teamStat?.value ?? 0;
        },
        cell: (value: unknown, row: MatchStatsData): React.ReactNode => {
          const teamStat = row.teamStats.find((s) => s.name === stat.name);
          return teamStat?.display ?? String(value);
        },
        headerClassName: undefined,
        cellClassName: (row: MatchStatsData): string => {
          const teamStat = row.teamStats.find((s) => s.name === stat.name);
          return classNames(tableStyles.statCell, {
            [tableStyles.bestInMatch]: teamStat?.bestInMatch ?? false,
          });
        },
        sortingFn: "basic" as const,
      })),
      {
        id: "medals",
        header: "Medals",
        accessorFn: (row: MatchStatsData): number => {
          return row.players.reduce(
            (teamTotal, player) => teamTotal + player.medals.reduce((sum, medal) => sum + medal.count, 0),
            0,
          );
        },
        cell: (_value: unknown, row: MatchStatsData): React.ReactNode => (
          <div className={styles.medalsContainer}>
            {row.teamMedals.map((medal, idx) => (
              <span key={idx} className={styles.medalItem}>
                {medal.count > 1 ? <span className={styles.medalCount}>{medal.count}×</span> : null}
                <MedalIcon medalName={medal.name} size="small" />
              </span>
            ))}
          </div>
        ),
        headerClassName: undefined,
        cellClassName: tableStyles.statCell,
        sortingFn: "basic" as const,
      },
    ];
  }, [data, hasTeamStats]);

  // Define player stats columns
  const playerColumns = React.useMemo<SortableTableColumn<MatchStatsData & { player: MatchStatsPlayerData }>[]>(() => {
    const statColumns = data[0]?.players[0]?.values ?? [];
    return [
      {
        id: "team",
        header: "Team",
        accessorFn: (row: MatchStatsData & { player: MatchStatsPlayerData }): number => row.teamId,
        cell: (value: unknown): React.ReactNode => <TeamIcon teamId={value as number} size="small" />,
        headerClassName: undefined,
        cellClassName: tableStyles.labelCell,
        sortingFn: "basic",
      },
      {
        id: "gamertag",
        header: "Gamertag",
        accessorFn: (row: MatchStatsData & { player: MatchStatsPlayerData }): string => row.player.name,
        headerClassName: undefined,
        cellClassName: tableStyles.labelCell,
        sortingFn: "alphanumeric",
      },
      ...statColumns.map((stat) => ({
        id: stat.name,
        header: stat.name,
        accessorFn: (row: MatchStatsData & { player: MatchStatsPlayerData }): number => {
          const playerStat = row.player.values.find((s) => s.name === stat.name);
          return playerStat?.value ?? 0;
        },
        cell: (value: unknown, row: MatchStatsData & { player: MatchStatsPlayerData }): React.ReactNode => {
          const playerStat = row.player.values.find((s) => s.name === stat.name);
          return playerStat?.display ?? String(value);
        },
        headerClassName: undefined,
        cellClassName: (row: MatchStatsData & { player: MatchStatsPlayerData }): string => {
          const playerStat = row.player.values.find((s) => s.name === stat.name);
          return classNames(tableStyles.statCell, {
            [tableStyles.bestInTeam]: playerStat?.bestInTeam ?? false,
            [tableStyles.bestInMatch]: playerStat?.bestInMatch ?? false,
          });
        },
        sortingFn: "basic" as const,
      })),
      {
        id: "medals",
        header: "Medals",
        accessorFn: (row: MatchStatsData & { player: MatchStatsPlayerData }): number => {
          return row.player.medals.reduce((sum, medal) => sum + medal.count, 0);
        },
        cell: (_value: unknown, row: MatchStatsData & { player: MatchStatsPlayerData }): React.ReactNode => (
          <div className={styles.medalsContainer}>
            {row.player.medals.map((medal, idx) => (
              <span key={idx} className={styles.medalItem}>
                {medal.count > 1 ? <span className={styles.medalCount}>{medal.count}×</span> : null}
                <MedalIcon medalName={medal.name} size="small" />
              </span>
            ))}
          </div>
        ),
        headerClassName: undefined,
        cellClassName: tableStyles.statCell,
        sortingFn: "basic" as const,
      },
    ];
  }, [data]);

  // Flatten player data for table
  const playerData = React.useMemo(
    () =>
      data.flatMap((teamData) =>
        teamData.players.map((player) => ({
          ...teamData,
          player,
        })),
      ),
    [data],
  );

  return (
    <div className={styles.matchStatsContainer} id={id}>
      <div className={styles.matchHeader} style={{ "--match-bg": `url(${backgroundImageUrl})` } as React.CSSProperties}>
        <div className={styles.matchHeaderContent}>
          <h3 className={styles.matchTitle}>
            Match {matchNumber}: {gameTypeAndMap}
          </h3>
          <ul className={styles.matchMetadata}>
            <li>
              <span className={styles.matchMetaLabel}>Score:</span>{" "}
              <span className={styles.matchMetaValue}>{score}</span>
            </li>
            <li>
              <span className={styles.matchMetaLabel}>Duration:</span>{" "}
              <span className={styles.matchMetaValue}>{duration}</span>
            </li>
            <li>
              <span className={styles.matchMetaLabel}>End time:</span>{" "}
              <span className={styles.matchMetaValue}>{endTime}</span>
            </li>
          </ul>
        </div>
        <img src={gameModeIconUrl} alt={gameModeAlt} className={styles.gameModeIcon} />
      </div>
      {hasTeamStats && (
        <div className={styles.teamTotals}>
          <h3 className={styles.subsectionHeader}>Team Totals</h3>
          <SortableTable
            data={data}
            columns={teamColumns}
            getRowKey={(row) => row.teamId.toString()}
            ariaLabel="Team statistics"
          />
        </div>
      )}

      <div className={styles.playerStats}>
        <h3 className={styles.subsectionHeader}>Players</h3>
        <SortableTable
          data={playerData}
          columns={playerColumns}
          getRowKey={(row) => `${row.teamId.toString()}-${row.player.name}`}
          ariaLabel="Player statistics"
        />
      </div>
    </div>
  );
}
