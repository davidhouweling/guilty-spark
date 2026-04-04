import React from "react";
import ReactTimeAgo from "react-time-ago";
import type { PlayerAssociationData } from "@guilty-spark/shared/live-tracker/types";
import { getRankTierFromCsr } from "@guilty-spark/shared/halo/rank";
import { RankIcon } from "../icons/rank-icon";
import { SortableTable, type SortableTableColumn } from "../table/sortable-table";
import tableStyles from "../table/table.module.css";
import { TeamIcon } from "../icons/team-icon";
import type { TeamColor } from "../team-colors/team-colors";
import { Container } from "../container/container";
import styles from "./player-pre-series-info.module.css";

interface PlayerPreSeriesInfoProps {
  readonly className?: string;
  readonly playersAssociationData: Record<string, PlayerAssociationData>;
  readonly teams: readonly { name: string; players: readonly { id: string; displayName: string }[] }[];
  readonly teamColors: readonly TeamColor[];
}

interface PlayerRow {
  readonly teamId: number;
  readonly teamName: string;
  readonly playerId: string;
  readonly discordName: string;
  readonly gamertag: string | null;
  readonly currentRank: number | null;
  readonly currentRankTier: string | null;
  readonly currentRankSubTier: number | null;
  readonly currentRankMeasurementMatchesRemaining: number | null;
  readonly currentRankInitialMeasurementMatches: number | null;
  readonly allTimePeakRank: number | null;
  readonly esra: number | null;
  readonly lastRankedGamePlayed: string | null;
}

function RankDisplay({
  rank,
  tier,
  subTier,
  measurementMatchesRemaining,
  initialMeasurementMatches,
}: {
  rank: number | null;
  tier: string | null;
  subTier: number | null;
  measurementMatchesRemaining: number | null;
  initialMeasurementMatches: number | null;
}): React.ReactElement {
  const hasRank = rank !== null && rank >= 0;
  const rankValue = hasRank ? rank.toLocaleString() : "-";

  return (
    <>
      <RankIcon
        rankTier={tier}
        subTier={subTier}
        measurementMatchesRemaining={measurementMatchesRemaining}
        initialMeasurementMatches={initialMeasurementMatches}
        size="small"
      />{" "}
      <span className={styles.rankValue}>{rankValue}</span>
    </>
  );
}

export function PlayerPreSeriesInfo({
  className,
  playersAssociationData,
  teams,
  teamColors,
}: PlayerPreSeriesInfoProps): React.ReactElement {
  // Flatten player data with team information
  const playerRows = React.useMemo<PlayerRow[]>(() => {
    const rows: PlayerRow[] = [];
    teams.forEach((team, teamIndex) => {
      team.players.forEach((player) => {
        if (!(player.id in playersAssociationData)) {
          return;
        }
        const playerData = playersAssociationData[player.id];
        rows.push({
          teamId: teamIndex,
          teamName: team.name,
          playerId: player.id,
          discordName: playerData.discordName,
          gamertag: playerData.gamertag,
          currentRank: playerData.currentRank,
          currentRankTier: playerData.currentRankTier,
          currentRankSubTier: playerData.currentRankSubTier,
          currentRankMeasurementMatchesRemaining: playerData.currentRankMeasurementMatchesRemaining,
          currentRankInitialMeasurementMatches: playerData.currentRankInitialMeasurementMatches,
          allTimePeakRank: playerData.allTimePeakRank,
          esra: playerData.esra,
          lastRankedGamePlayed: playerData.lastRankedGamePlayed,
        });
      });
    });
    return rows;
  }, [teams, playersAssociationData]);

  // Define columns
  const columns = React.useMemo<SortableTableColumn<PlayerRow>[]>(
    () => [
      {
        id: "team",
        header: "Team",
        accessorFn: (row: PlayerRow): number => row.teamId,
        cell: (value: unknown): React.ReactNode => <TeamIcon teamId={value as number} size="small" />,
        headerClassName: undefined,
        cellClassName: tableStyles.labelCell,
        sortingFn: "basic",
      },
      {
        id: "discordName",
        header: "Discord Name",
        accessorFn: (row: PlayerRow): string => row.discordName,
        headerClassName: undefined,
        cellClassName: tableStyles.labelCell,
        sortingFn: "alphanumeric",
      },
      {
        id: "gamertag",
        header: "Gamertag",
        accessorFn: (row: PlayerRow): string => row.gamertag ?? "",
        cell: (value: unknown): React.ReactNode => {
          const gamertag = value as string;
          return gamertag !== "" ? gamertag : <span className={styles.noData}>Not connected</span>;
        },
        headerClassName: undefined,
        cellClassName: tableStyles.labelCell,
        sortingFn: "alphanumeric",
      },
      {
        id: "currentRank",
        header: "Current Rank",
        accessorFn: (row: PlayerRow): number => row.currentRank ?? -1,
        cell: (_value: unknown, row: PlayerRow): React.ReactNode => (
          <RankDisplay
            rank={row.currentRank}
            tier={row.currentRankTier}
            subTier={row.currentRankSubTier}
            measurementMatchesRemaining={row.currentRankMeasurementMatchesRemaining}
            initialMeasurementMatches={row.currentRankInitialMeasurementMatches}
          />
        ),
        headerClassName: undefined,
        cellClassName: tableStyles.statCell,
        sortingFn: "basic",
      },
      {
        id: "peakRank",
        header: "Peak Rank",
        accessorFn: (row: PlayerRow): number => row.allTimePeakRank ?? -1,
        cell: (_value: unknown, row: PlayerRow): React.ReactNode => {
          if (row.allTimePeakRank === null || row.allTimePeakRank <= 0) {
            return "-";
          }
          const { rankTier, subTier } = getRankTierFromCsr(row.allTimePeakRank);
          return (
            <RankDisplay
              rank={row.allTimePeakRank}
              tier={rankTier}
              subTier={subTier}
              measurementMatchesRemaining={null}
              initialMeasurementMatches={null}
            />
          );
        },
        headerClassName: undefined,
        cellClassName: tableStyles.statCell,
        sortingFn: "basic",
      },
      {
        id: "esra",
        header: "ESRA",
        accessorFn: (row: PlayerRow): number => row.esra ?? -1,
        cell: (_value: unknown, row: PlayerRow): React.ReactNode => {
          if (row.esra === null || row.esra <= 0) {
            return "-";
          }
          const roundedEsra = Math.round(row.esra);
          const { rankTier, subTier } = getRankTierFromCsr(roundedEsra);
          return (
            <RankDisplay
              rank={roundedEsra}
              tier={rankTier}
              subTier={subTier}
              measurementMatchesRemaining={null}
              initialMeasurementMatches={null}
            />
          );
        },
        headerClassName: undefined,
        cellClassName: tableStyles.statCell,
        sortingFn: "basic",
      },
      {
        id: "lastRankedGamePlayed",
        header: "Last ranked match played",
        accessorFn: (row: PlayerRow): number => {
          // Use timestamp for sorting (0 for null means it sorts to the top)
          return row.lastRankedGamePlayed !== null ? new Date(row.lastRankedGamePlayed).getTime() : 0;
        },
        cell: (_value: unknown, row: PlayerRow): React.ReactNode => {
          if (row.lastRankedGamePlayed === null) {
            return <span className={styles.noData}>-</span>;
          }
          return <ReactTimeAgo date={new Date(row.lastRankedGamePlayed)} locale="en" />;
        },
        headerClassName: undefined,
        cellClassName: tableStyles.statCell,
        sortingFn: "basic",
      },
    ],
    [],
  );

  return (
    <Container className={className}>
      <div className={styles.container}>
        <h2 className={styles.title}>Player Info</h2>
        <SortableTable
          data={playerRows}
          columns={columns}
          getRowKey={(row) => row.playerId}
          ariaLabel="Player information"
          initialSort={{ columnId: "team", desc: false }}
          getRowStyle={(row): React.CSSProperties =>
            ({
              "--row-color": teamColors[row.teamId]?.hex ?? "transparent",
            }) as React.CSSProperties
          }
        />
      </div>
    </Container>
  );
}
