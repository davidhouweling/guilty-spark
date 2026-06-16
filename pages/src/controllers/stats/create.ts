import { GameVariantCategory } from "halo-infinite-api";
import { AttritionMatchStatsFormatter } from "./attrition-match-stats-formatter";
import type { BaseMatchStatsFormatter } from "./base-match-stats-formatter";
import { CtfMatchStatsFormatter } from "./ctf-match-stats-formatter";
import { EliminationMatchStatsFormatter } from "./elimination-match-stats-formatter";
import { EscalationMatchStatsFormatter } from "./escalation-match-stats-formatter";
import { ExtractionMatchStatsFormatter } from "./extraction-match-stats-formatter";
import { FiestaMatchStatsFormatter } from "./fiesta-match-stats-formatter";
import { FirefightMatchStatsFormatter } from "./firefight-match-stats-formatter";
import { GrifballMatchStatsFormatter } from "./grifball-match-stats-formatter";
import { InfectionMatchStatsFormatter } from "./infection-match-stats-formatter";
import { KOTHMatchStatsFormatter } from "./koth-match-stats-formatter";
import { LandGrabMatchStatsFormatter } from "./land-grab-match-stats-formatter";
import { MinigameMatchStatsFormatter } from "./minigame-match-stats-formatter";
import { OddballMatchStatsFormatter } from "./oddball-match-stats-formatter";
import { SlayerMatchStatsFormatter } from "./slayer-match-stats-formatter";
import { StockpileMatchStatsFormatter } from "./stockpile-match-stats-formatter";
import { StrongholdsMatchStatsFormatter } from "./strongholds-match-stats-formatter";
import { TotalControlMatchStatsFormatter } from "./total-control-match-stats-formatter";
import { UnknownMatchStatsFormatter } from "./unknown-match-stats-formatter";
import { VIPMatchStatsFormatter } from "./vip-match-stats-formatter";

const formatters = new Map<GameVariantCategory, BaseMatchStatsFormatter>([
  [GameVariantCategory.MultiplayerSlayer, new SlayerMatchStatsFormatter()],
  [GameVariantCategory.MultiplayerAttrition, new AttritionMatchStatsFormatter()],
  [GameVariantCategory.MultiplayerElimination, new EliminationMatchStatsFormatter()],
  [GameVariantCategory.MultiplayerOddball, new OddballMatchStatsFormatter()],
  [GameVariantCategory.MultiplayerStrongholds, new StrongholdsMatchStatsFormatter()],
  [GameVariantCategory.MultiplayerTotalControl, new TotalControlMatchStatsFormatter()],
  [GameVariantCategory.MultiplayerFiesta, new FiestaMatchStatsFormatter()],
  [GameVariantCategory.MultiplayerKingOfTheHill, new KOTHMatchStatsFormatter()],
  [GameVariantCategory.MultiplayerCtf, new CtfMatchStatsFormatter()],
  [GameVariantCategory.MultiplayerExtraction, new ExtractionMatchStatsFormatter()],
  [GameVariantCategory.MultiplayerStockpile, new StockpileMatchStatsFormatter()],
  [GameVariantCategory.MultiplayerInfection, new InfectionMatchStatsFormatter()],
  [GameVariantCategory.MultiplayerVIP, new VIPMatchStatsFormatter()],
  [GameVariantCategory.MultiplayerEscalation, new EscalationMatchStatsFormatter()],
  [GameVariantCategory.MultiplayerGrifball, new GrifballMatchStatsFormatter()],
  [GameVariantCategory.MultiplayerLandGrab, new LandGrabMatchStatsFormatter()],
  [GameVariantCategory.MultiplayerMinigame, new MinigameMatchStatsFormatter()],
  [GameVariantCategory.MultiplayerFirefight, new FirefightMatchStatsFormatter()],
]);

export function createMatchStatsFormatter(category: GameVariantCategory): BaseMatchStatsFormatter {
  return formatters.get(category) ?? new UnknownMatchStatsFormatter();
}
