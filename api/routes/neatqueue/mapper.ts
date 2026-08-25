import type { ActiveSeriesSummary, ActiveSeriesTeam } from "@guilty-spark/shared/contracts/neatqueue/active-series";
import type { SeriesTeam } from "@guilty-spark/shared/contracts/durable-objects/individual-tracker/nudge";
import type { ActiveSeriesForPlayer } from "../../services/neatqueue/types";

function toActiveSeriesTeam(team: SeriesTeam): ActiveSeriesTeam {
  return {
    id: team.id,
    name: team.name,
    players: team.players.map((player) => ({ gamertag: player.gamertag, xboxId: player.xboxId })),
  };
}

export function toActiveSeriesSummary(entry: ActiveSeriesForPlayer): ActiveSeriesSummary {
  return {
    guildId: entry.guildId,
    queueNumber: entry.queueNumber,
    title: entry.seriesContext.title,
    subtitle: entry.seriesContext.subtitle,
    guildIconUrl: entry.seriesContext.guildIconUrl,
    ...(entry.seriesContext.startedAt !== undefined ? { startedAt: entry.seriesContext.startedAt } : {}),
    teams: entry.seriesContext.teams.map(toActiveSeriesTeam),
  };
}
