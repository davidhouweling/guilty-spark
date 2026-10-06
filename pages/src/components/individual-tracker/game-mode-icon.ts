import { GameVariantCategory } from "halo-infinite-api";
import attritionPng from "../../assets/game-modes/attrition.png";
import assaultPng from "../../assets/game-modes/assault.png";
import captureTheFlagPng from "../../assets/game-modes/capture-the-flag.png";
import eliminationPng from "../../assets/game-modes/elimination.png";
import extractionPng from "../../assets/game-modes/extraction.png";
import firefightPng from "../../assets/game-modes/firefight.png";
import infectionPng from "../../assets/game-modes/infection.png";
import kingOfTheHillPng from "../../assets/game-modes/king-of-the-hill.png";
import landGrabPng from "../../assets/game-modes/land-grab.png";
import oddballPng from "../../assets/game-modes/oddball.png";
import slayerPng from "../../assets/game-modes/slayer.png";
import stockpilePng from "../../assets/game-modes/stockpile.png";
import strongholdsPng from "../../assets/game-modes/strongholds.png";
import totalControlPng from "../../assets/game-modes/total-control.png";
import vipPng from "../../assets/game-modes/vip.png";

const ICON_BY_CATEGORY: Record<number, string> = {
  [GameVariantCategory.MultiplayerAttrition]: attritionPng.src,
  [GameVariantCategory.MultiplayerElimination]: eliminationPng.src,
  [GameVariantCategory.MultiplayerStrongholds]: strongholdsPng.src,
  [GameVariantCategory.MultiplayerKingOfTheHill]: kingOfTheHillPng.src,
  [GameVariantCategory.MultiplayerTotalControl]: totalControlPng.src,
  [GameVariantCategory.MultiplayerCtf]: captureTheFlagPng.src,
  [GameVariantCategory.MultiplayerExtraction]: extractionPng.src,
  [GameVariantCategory.MultiplayerOddball]: oddballPng.src,
  [GameVariantCategory.MultiplayerStockpile]: stockpilePng.src,
  [GameVariantCategory.MultiplayerInfection]: infectionPng.src,
  [GameVariantCategory.MultiplayerVIP]: vipPng.src,
  [GameVariantCategory.MultiplayerLandGrab]: landGrabPng.src,
  [GameVariantCategory.MultiplayerFirefight]: firefightPng.src,
};

const ICON_BY_MODE_NAME: Record<string, string> = {
  Attrition: attritionPng.src,
  Elimination: eliminationPng.src,
  Strongholds: strongholdsPng.src,
  "King of the Hill": kingOfTheHillPng.src,
  "Total Control": totalControlPng.src,
  "Capture the Flag": captureTheFlagPng.src,
  Extraction: extractionPng.src,
  Oddball: oddballPng.src,
  Stockpile: stockpilePng.src,
  Infection: infectionPng.src,
  VIP: vipPng.src,
  "Land Grab": landGrabPng.src,
  Firefight: firefightPng.src,
  Slayer: slayerPng.src,
  "Neutral Bomb": assaultPng.src,
};

export function gameModeIconSrc(gameVariantCategory: number): string {
  return ICON_BY_CATEGORY[gameVariantCategory] ?? slayerPng.src;
}

export function gameModeIconSrcForModeName(gameMode: string): string | null {
  const normalizedMode = gameMode.replace(/^FFA /, "");
  if (!Object.prototype.hasOwnProperty.call(ICON_BY_MODE_NAME, normalizedMode)) {
    return null;
  }

  return ICON_BY_MODE_NAME[normalizedMode] ?? "data:,";
}
