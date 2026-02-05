import React from "react";
import classNames from "classnames";
import { SortableTable, type SortableTableColumn } from "../table/sortable-table";
import tableStyles from "../table/table.module.css";
import { TeamIcon } from "../icons/team-icon";
import { MedalIcon } from "../icons/medal-icon";
import type { MatchStatsData, MatchStatsPlayerData } from "./types";
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

  // Define team stats columns
  const teamColumns = React.useMemo<SortableTableColumn<MatchStatsData>[]>(() => {
    if (!hasTeamStats) {
      return [];
    }

    const statColumns = teamData[0].teamStats;
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
    ];
  }, [teamData, hasTeamStats]);

  // Define player stats columns
  const playerColumns = React.useMemo<SortableTableColumn<MatchStatsData & { player: MatchStatsPlayerData }>[]>(() => {
    if (!hasPlayerStats) {
      return [];
    }

    const statColumns = playerData[0].players[0].values;
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
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
            {row.player.medals.slice(0, 10).map((medal, idx) => (
              <span key={idx} style={{ display: "flex", alignItems: "center", gap: "2px" }}>
                {medal.count > 1 ? <span style={{ fontSize: "0.85em" }}>{medal.count}×</span> : null}
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
  }, [playerData, hasPlayerStats]);

  // Flatten player data for table
  const flattenedPlayerData = React.useMemo(
    () =>
      playerData.flatMap((team) =>
        team.players.map((player) => ({
          ...team,
          player,
        })),
      ),
    [playerData],
  );

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
          <SortableTable
            data={teamData}
            columns={teamColumns}
            getRowKey={(row) => row.teamId.toString()}
            ariaLabel="Accumulated team statistics"
          />
        </div>
      )}

      {hasPlayerStats && (
        <div className={styles.playerStats}>
          <h3 className={styles.subsectionHeader}>Accumulated Player Stats</h3>
          <SortableTable
            data={flattenedPlayerData}
            columns={playerColumns}
            getRowKey={(row) => `${row.teamId.toString()}-${row.player.name}`}
            ariaLabel="Accumulated player statistics"
          />
        </div>
      )}
    </div>
  );
}
