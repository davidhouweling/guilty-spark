import type { GameVariantCategory } from "halo-infinite-api";
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

// GameVariantCategory enum values from halo-infinite-api (type-only import to avoid runtime dependency)
const presenters = new Map<number /* GameVariantCategory */, BaseMatchStatsPresenter>([
  [6 /* MultiplayerSlayer */, new SlayerMatchStatsPresenter()],
  [7 /* MultiplayerAttrition */, new AttritionMatchStatsPresenter()],
  [8 /* MultiplayerElimination */, new EliminationMatchStatsPresenter()],
  [10 /* MultiplayerOddball */, new OddballMatchStatsPresenter()],
  [12 /* MultiplayerStrongholds */, new StrongholdsMatchStatsPresenter()],
  [13 /* MultiplayerTotalControl */, new TotalControlMatchStatsPresenter()],
  [9 /* MultiplayerFiesta */, new FiestaMatchStatsPresenter()],
  [11 /* MultiplayerStrongholds */, new StrongholdsMatchStatsPresenter()],
  [12 /* MultiplayerKingOfTheHill */, new KOTHMatchStatsPresenter()],
  [14 /* MultiplayerTotalControl */, new TotalControlMatchStatsPresenter()],
  [15 /* MultiplayerCtf */, new CtfMatchStatsPresenter()],
  [17 /* MultiplayerExtraction */, new ExtractionMatchStatsPresenter()],
  [18 /* MultiplayerOddball */, new OddballMatchStatsPresenter()],
  [19 /* MultiplayerStockpile */, new StockpileMatchStatsPresenter()],
  [22 /* MultiplayerInfection */, new InfectionMatchStatsPresenter()],
  [23 /* MultiplayerVIP */, new VIPMatchStatsPresenter()],
  [24 /* MultiplayerEscalation */, new EscalationMatchStatsPresenter()],
  [25 /* MultiplayerGrifball */, new GrifballMatchStatsPresenter()],
  [39 /* MultiplayerLandGrab */, new LandGrabMatchStatsPresenter()],
  [41 /* MultiplayerMinigame */, new MinigameMatchStatsPresenter()],
  [42 /* MultiplayerFirefight */, new FirefightMatchStatsPresenter()],
]);

export function createMatchStatsPresenter(category: GameVariantCategory): BaseMatchStatsPresenter {
  return presenters.get(category) ?? new UnknownMatchStatsPresenter();
}
