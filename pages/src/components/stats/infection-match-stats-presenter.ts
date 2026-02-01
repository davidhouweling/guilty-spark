import type { GameVariantCategory, Stats } from "halo-infinite-api";
import { BaseMatchStatsPresenter } from "./base-match-stats-presenter";
import type { StatsCollection } from "./types";
import { StatsValueSortBy } from "./types";

export class InfectionMatchStatsPresenter extends BaseMatchStatsPresenter {
  protected getPlayerObjectiveStats(stats: Stats<GameVariantCategory.MultiplayerInfection>): StatsCollection {
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
          value: this.getDurationInSeconds(stats.InfectionSTats.TimeAsLastSpartanStanding),
          sortBy: StatsValueSortBy.DESC,
          display: this.getReadableDuration(stats.InfectionSTats.TimeAsLastSpartanStanding),
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
