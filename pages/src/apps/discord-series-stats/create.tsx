import React from "react";
import type { ReactElement } from "react";
import type { DiscordSeriesStatsResolved } from "@guilty-spark/shared/contracts/stats/discord-series";
import { SortableTable, type SortableTableColumn } from "../../components/table/sortable-table";

interface DiscordSeriesStatsAppProps {
  readonly data: DiscordSeriesStatsResolved;
}

interface MatchIdRow {
  matchId: string;
}

export function DiscordSeriesStatsApp({ data }: DiscordSeriesStatsAppProps): ReactElement {
  const rows = React.useMemo<MatchIdRow[]>(() => data.matchIds.map((matchId) => ({ matchId })), [data.matchIds]);

  const columns = React.useMemo<SortableTableColumn<MatchIdRow>[]>(
    () => [
      {
        id: "matchId",
        header: "Match ID",
        accessorFn: (row): string => row.matchId,
        sortingFn: "alphanumeric",
      },
    ],
    [],
  );

  // Stage A placeholder: this match-id-only view will be replaced in Stage B with the gamertag-first stats UI.
  return (
    <section>
      <h2>Queue #{data.queueNumber.toString()} Series Stats</h2>
      <SortableTable
        data={rows}
        columns={columns}
        getRowKey={(row): string => row.matchId}
        ariaLabel="Series match ids"
        initialSort={{ columnId: "matchId", desc: false }}
      />
    </section>
  );
}
