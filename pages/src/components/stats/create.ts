import { GameVariantCategory } from "halo-infinite-api";
import { AttritionMatchStatsPresenter } from "./attrition-match-stats-presenter";
import type { BaseMatchStatsPresenter } from "./base-match-stats-presenter";
import { CtfMatchStatsPresenter } from "./ctf-match-stats-presenter";
import { EliminationMatchStatsPresenter } from "./elimination-match-stats-presenter";
import { EscalationMatchStatsPresenter } from "./escalation-match-stats-presenter";
import { ExtractionMatchStatsPresenter } from "./extraction-match-stats-presenter";
import { FiestaMatchStatsPresenter } from "./fiesta-match-stats-presenter";
import { FirefightMatchStatsPresenter } from "./firefight-match-stats-presenter";
import { GrifballMatchStatsPresenter } from "./grifball-match-stats-presenter";
import { InfectionMatchStatsPresenter } from "./infection-match-stats-presenter";
import { KOTHMatchStatsPresenter } from "./koth-match-stats-presenter";
import { LandGrabMatchStatsPresenter } from "./land-grab-match-stats-presenter";
import { MinigameMatchStatsPresenter } from "./minigame-match-stats-presenter";
import { OddballMatchStatsPresenter } from "./oddball-match-stats-presenter";
import { SlayerMatchStatsPresenter } from "./slayer-match-stats-presenter";
import { StockpileMatchStatsPresenter } from "./stockpile-match-stats-presenter";
import { StrongholdsMatchStatsPresenter } from "./strongholds-match-stats-presenter";
import { TotalControlMatchStatsPresenter } from "./total-control-match-stats-presenter";
import { UnknownMatchStatsPresenter } from "./unknown-match-stats-presenter";
import { VIPMatchStatsPresenter } from "./vip-match-stats-presenter";

const presenters = new Map<GameVariantCategory, BaseMatchStatsPresenter>([
  [GameVariantCategory.MultiplayerSlayer, new SlayerMatchStatsPresenter()],
  [GameVariantCategory.MultiplayerAttrition, new AttritionMatchStatsPresenter()],
  [GameVariantCategory.MultiplayerElimination, new EliminationMatchStatsPresenter()],
  [GameVariantCategory.MultiplayerOddball, new OddballMatchStatsPresenter()],
  [GameVariantCategory.MultiplayerStrongholds, new StrongholdsMatchStatsPresenter()],
  [GameVariantCategory.MultiplayerTotalControl, new TotalControlMatchStatsPresenter()],
  [GameVariantCategory.MultiplayerFiesta, new FiestaMatchStatsPresenter()],
  [GameVariantCategory.MultiplayerStrongholds, new StrongholdsMatchStatsPresenter()],
  [GameVariantCategory.MultiplayerKingOfTheHill, new KOTHMatchStatsPresenter()],
  [GameVariantCategory.MultiplayerTotalControl, new TotalControlMatchStatsPresenter()],
  [GameVariantCategory.MultiplayerCtf, new CtfMatchStatsPresenter()],
  [GameVariantCategory.MultiplayerExtraction, new ExtractionMatchStatsPresenter()],
  [GameVariantCategory.MultiplayerOddball, new OddballMatchStatsPresenter()],
  [GameVariantCategory.MultiplayerStockpile, new StockpileMatchStatsPresenter()],
  [GameVariantCategory.MultiplayerInfection, new InfectionMatchStatsPresenter()],
  [GameVariantCategory.MultiplayerVIP, new VIPMatchStatsPresenter()],
  [GameVariantCategory.MultiplayerEscalation, new EscalationMatchStatsPresenter()],
  [GameVariantCategory.MultiplayerGrifball, new GrifballMatchStatsPresenter()],
  [GameVariantCategory.MultiplayerLandGrab, new LandGrabMatchStatsPresenter()],
  [GameVariantCategory.MultiplayerMinigame, new MinigameMatchStatsPresenter()],
  [GameVariantCategory.MultiplayerFirefight, new FirefightMatchStatsPresenter()],
]);

export function createMatchStatsPresenter(category: GameVariantCategory): BaseMatchStatsPresenter {
  return presenters.get(category) ?? new UnknownMatchStatsPresenter();
}
