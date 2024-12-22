import type { GameVariantCategory } from "halo-infinite-api";
import type { EmbedPlayerStats, PlayerStats } from "./base-match-embed.mjs";
import { BaseMatchEmbed, StatsValueSortBy } from "./base-match-embed.mjs";

export class InfectionMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerInfection> {
  override getPlayerObjectiveStats(stats: PlayerStats<GameVariantCategory.MultiplayerInfection>): EmbedPlayerStats {
    return new Map([
      ["Alphas killed", { value: stats.InfectionSTats.AlphasKilled, sortBy: StatsValueSortBy.DESC }],
      ["Infected killed", { value: stats.InfectionSTats.InfectedKilled, sortBy: StatsValueSortBy.DESC }],
      [
        "Kills as last spartan standing",
        { value: stats.InfectionSTats.KillsAsLastSpartanStanding, sortBy: StatsValueSortBy.DESC },
      ],
      [
        "Rounds survived as spartan",
        { value: stats.InfectionSTats.RoundsSurvivedAsSpartan, sortBy: StatsValueSortBy.DESC },
      ],
      [
        "Time as last spartan standing",
        {
          value: this.haloService.getDurationInSeconds(stats.InfectionSTats.TimeAsLastSpartanStanding),
          sortBy: StatsValueSortBy.DESC,
          display: this.haloService.getReadableDuration(stats.InfectionSTats.TimeAsLastSpartanStanding),
        },
      ],
      ["Spartans infected", { value: stats.InfectionSTats.SpartansInfected, sortBy: StatsValueSortBy.DESC }],
      [
        "Spartans infected as alpha",
        { value: stats.InfectionSTats.SpartansInfectedAsAlpha, sortBy: StatsValueSortBy.DESC },
      ],
    ]);
  }
}
