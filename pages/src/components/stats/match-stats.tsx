import type { MatchStats } from "halo-infinite-api";
import React from "react";
import classNames from "classnames";
import type { ComponentLoaderStatus } from "../component-loader/component-loader";
import { SortableTable, type SortableTableColumn } from "../table/sortable-table";
import tableStyles from "../table/table.module.css";
import { TabbedSection } from "../tabbed-section/tabbed-section";
import { TeamIcon } from "../icons/team-icon";
import { MedalIcon } from "../icons/medal-icon";
import type { TeamColor } from "../team-colors/team-colors";
import { Container } from "../container/container";
import { EMPTY_KILL_MATRIX_PIVOT_DATA, type KillMatrixPivotData } from "../../controllers/stats/kill-matrix/types";
import type { MatchStatsData, MatchStatsPlayerData } from "../../controllers/stats/types";
import { sortByMedals, getTeamMedalsMap, getPlayerMedalsMap } from "../../controllers/stats/medals-sorting";
import { KillMatrixTable } from "./kill-matrix/kill-matrix-table";
import { ScoreProgression } from "./score-progression/score-progression";
import type { ScoreProgressionViewData } from "./score-progression/types";
import { StatsHeader } from "./stats-header";
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
  readonly startTime: string;
  readonly endTime: string;
  readonly teamColors?: readonly TeamColor[];
  readonly killMatrixPivotData?: KillMatrixPivotData;
  readonly transposedKillMatrixPivotData?: KillMatrixPivotData;
  readonly killMatrixStatus?: ComponentLoaderStatus;
  readonly scoreProgressionViewData?: ScoreProgressionViewData | null;
  readonly showHeader?: boolean;
}

type MatchStatsRow = MatchStatsData & { player: MatchStatsPlayerData };

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
  startTime,
  endTime,
  teamColors,
  killMatrixPivotData,
  transposedKillMatrixPivotData,
  killMatrixStatus,
  scoreProgressionViewData,
  showHeader = true,
}: MatchStatsProps): React.ReactElement {
  const [activeTab, setActiveTab] = React.useState<"players" | "timeline" | "kill-matrix">("players");
  const safeActiveTab: "players" | "timeline" | "kill-matrix" =
    activeTab === "timeline" && scoreProgressionViewData == null ? "players" : activeTab;
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
        accessorFn: getTeamMedalsMap,
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
        sortingFn: sortByMedals,
      },
    ];
  }, [data, hasTeamStats]);

  // Define player stats columns
  const playerColumns = React.useMemo<SortableTableColumn<MatchStatsRow>[]>(() => {
    const statColumns = data[0]?.players[0]?.values ?? [];
    return [
      {
        id: "team",
        header: "Team",
        accessorFn: (row: MatchStatsRow): number => row.teamId,
        cell: (value: unknown): React.ReactNode => <TeamIcon teamId={value as number} size="small" />,
        headerClassName: undefined,
        cellClassName: tableStyles.labelCell,
        sortingFn: "basic",
      },
      {
        id: "gamertag",
        header: "Gamertag",
        accessorFn: (row: MatchStatsRow): string => row.player.name,
        headerClassName: undefined,
        cellClassName: tableStyles.labelCell,
        sortingFn: "alphanumeric",
      },
      ...statColumns.map((stat) => ({
        id: stat.name,
        header: stat.name,
        accessorFn: (row: MatchStatsRow): number => {
          const playerStat = row.player.values.find((s) => s.name === stat.name);
          return playerStat?.value ?? 0;
        },
        cell: (value: unknown, row: MatchStatsRow): React.ReactNode => {
          const playerStat = row.player.values.find((s) => s.name === stat.name);
          return playerStat?.display ?? String(value);
        },
        headerClassName: undefined,
        cellClassName: (row: MatchStatsRow): string => {
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
        accessorFn: getPlayerMedalsMap,
        cell: (_value: unknown, row: MatchStatsRow): React.ReactNode => (
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
        sortingFn: sortByMedals,
      },
    ];
  }, [data]);

  const playerHeaders = React.useMemo(
    () => data.flatMap((d) => d.players.map((p) => ({ gamertag: p.name, teamId: d.teamId }))),
    [data],
  );

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
      {showHeader && (
        <StatsHeader
          title={`Match ${String(matchNumber)}: ${gameTypeAndMap}`}
          metadata={[
            { label: "Score", value: score },
            { label: "Duration", value: duration },
            { label: "Start time", value: new Date(startTime).toLocaleString() },
            { label: "End time", value: new Date(endTime).toLocaleString() },
          ]}
          backgroundStyle={{ "--match-bg": `url(${backgroundImageUrl})` } as React.CSSProperties}
          gameModeIconUrl={gameModeIconUrl}
          gameModeAlt={gameModeAlt}
        />
      )}

      {hasTeamStats && (
        <div className={styles.teamTotals}>
          <Container>
            <h3 className={styles.subsectionHeader}>Team Totals</h3>
          </Container>
          <SortableTable
            data={data}
            columns={teamColumns}
            getRowKey={(row) => row.teamId.toString()}
            ariaLabel="Team statistics"
            getRowStyle={
              teamColors
                ? (row): React.CSSProperties =>
                    ({
                      "--row-color": teamColors[row.teamId]?.hex ?? "transparent",
                    }) as React.CSSProperties
                : undefined
            }
          />
        </div>
      )}

      <TabbedSection
        tabListAriaLabel="Match statistics view"
        selectedTabId={safeActiveTab}
        tabs={[
          {
            id: "players" as const,
            label: "Players",
            content: (
              <SortableTable
                data={playerData}
                columns={playerColumns}
                getRowKey={(row) => `${row.teamId.toString()}-${row.player.name}`}
                ariaLabel="Player statistics"
                getRowStyle={
                  teamColors
                    ? (row): React.CSSProperties =>
                        ({
                          "--row-color": teamColors[row.teamId]?.hex ?? "transparent",
                        }) as React.CSSProperties
                    : undefined
                }
              />
            ),
          },
          ...(scoreProgressionViewData != null
            ? [
                {
                  id: "timeline" as const,
                  label: "Timeline",
                  content: (
                    <ScoreProgression
                      durationMs={scoreProgressionViewData.durationMs}
                      teamLines={scoreProgressionViewData.teamLines}
                      scoreDelta={scoreProgressionViewData.scoreDelta}
                      ariaLabel="Match score progression timeline"
                    />
                  ),
                },
              ]
            : []),
          {
            id: "kill-matrix" as const,
            label: "Kill Matrix",
            content: (
              <KillMatrixTable
                pivotData={killMatrixPivotData ?? EMPTY_KILL_MATRIX_PIVOT_DATA}
                transposedPivotData={transposedKillMatrixPivotData}
                ariaLabel="Match kill matrix"
                emptyMessage="Kill matrix data is not available for this match yet."
                errorMessage="Failed to load kill matrix data for this match."
                status={killMatrixStatus}
                playerHeaders={playerHeaders}
                teamColors={teamColors}
              />
            ),
          },
        ]}
        tabsClassName={styles.tabs}
        onTabChange={setActiveTab}
      />
    </div>
  );
}
