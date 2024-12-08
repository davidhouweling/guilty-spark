import type { GameVariantCategory } from "halo-infinite-api";
import type { PlayerStats } from "./base-match-embed.mjs";
import { BaseMatchEmbed } from "./base-match-embed.mjs";

export class InfectionMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerInfection> {
  override getPlayerObjectiveStats(stats: PlayerStats<GameVariantCategory.MultiplayerInfection>): Map<string, string> {
    return new Map([
      ["Alphas killed", stats.InfectionSTats.AlphasKilled.toString()],
      ["Infected killed", stats.InfectionSTats.InfectedKilled.toString()],
      ["Kills as last spartan standing", stats.InfectionSTats.KillsAsLastSpartanStanding.toString()],
      ["Rounds survived as spartan", stats.InfectionSTats.RoundsSurvivedAsSpartan.toString()],
      [
        "Time as last spartan standing",
        this.haloService.getReadableDuration(stats.InfectionSTats.TimeAsLastSpartanStanding),
      ],
      ["Spartans infected", stats.InfectionSTats.SpartansInfected.toString()],
      ["Spartans infected as alpha", stats.InfectionSTats.SpartansInfectedAsAlpha.toString()],
    ]);
  }
}
