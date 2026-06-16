import { GameVariantCategory } from "halo-infinite-api";
import { AttritionMatchStatsFormatter } from "./attrition-match-stats-presenter";
import type { BaseMatchStatsFormatter } from "./base-match-stats-presenter";
import { CtfMatchStatsFormatter } from "./ctf-match-stats-presenter";
import { EliminationMatchStatsFormatter } from "./elimination-match-stats-presenter";
import { EscalationMatchStatsFormatter } from "./escalation-match-stats-presenter";
import { ExtractionMatchStatsFormatter } from "./extraction-match-stats-presenter";
import { FiestaMatchStatsFormatter } from "./fiesta-match-stats-presenter";
import { FirefightMatchStatsFormatter } from "./firefight-match-stats-presenter";
import { GrifballMatchStatsFormatter } from "./grifball-match-stats-presenter";
import { InfectionMatchStatsFormatter } from "./infection-match-stats-presenter";
import { KOTHMatchStatsFormatter } from "./koth-match-stats-presenter";
import { LandGrabMatchStatsFormatter } from "./land-grab-match-stats-presenter";
import { MinigameMatchStatsFormatter } from "./minigame-match-stats-presenter";
import { OddballMatchStatsFormatter } from "./oddball-match-stats-presenter";
import { SlayerMatchStatsFormatter } from "./slayer-match-stats-presenter";
import { StockpileMatchStatsFormatter } from "./stockpile-match-stats-presenter";
import { StrongholdsMatchStatsFormatter } from "./strongholds-match-stats-presenter";
import { TotalControlMatchStatsFormatter } from "./total-control-match-stats-presenter";
import { UnknownMatchStatsFormatter } from "./unknown-match-stats-presenter";
import { VIPMatchStatsFormatter } from "./vip-match-stats-presenter";

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
