import { describe, expect, it } from "vitest";
import { GameVariantCategory } from "halo-infinite-api";
import attritionPng from "../../../assets/game-modes/attrition.png";
import captureTheFlagPng from "../../../assets/game-modes/capture-the-flag.png";
import firefightPng from "../../../assets/game-modes/firefight.png";
import oddballPng from "../../../assets/game-modes/oddball.png";
import slayerPng from "../../../assets/game-modes/slayer.png";
import strongholdsPng from "../../../assets/game-modes/strongholds.png";
import { gameModeIconSrc } from "../game-mode-icon";

describe("gameModeIconSrc", () => {
  it("maps Slayer to the slayer icon", () => {
    expect(gameModeIconSrc(GameVariantCategory.MultiplayerSlayer)).toBe(slayerPng.src);
  });

  it("maps Attrition to the attrition icon", () => {
    expect(gameModeIconSrc(GameVariantCategory.MultiplayerAttrition)).toBe(attritionPng.src);
  });

  it("maps Strongholds to the strongholds icon", () => {
    expect(gameModeIconSrc(GameVariantCategory.MultiplayerStrongholds)).toBe(strongholdsPng.src);
  });

  it("maps Capture the Flag to the capture-the-flag icon", () => {
    expect(gameModeIconSrc(GameVariantCategory.MultiplayerCtf)).toBe(captureTheFlagPng.src);
  });

  it("maps Oddball to the oddball icon", () => {
    expect(gameModeIconSrc(GameVariantCategory.MultiplayerOddball)).toBe(oddballPng.src);
  });

  it("maps Firefight to the firefight icon", () => {
    expect(gameModeIconSrc(GameVariantCategory.MultiplayerFirefight)).toBe(firefightPng.src);
  });

  it("falls back to the slayer icon for Minigame", () => {
    expect(gameModeIconSrc(GameVariantCategory.MultiplayerMinigame)).toBe(slayerPng.src);
  });

  it("falls back to the slayer icon for Fiesta", () => {
    expect(gameModeIconSrc(GameVariantCategory.MultiplayerFiesta)).toBe(slayerPng.src);
  });

  it("falls back to the slayer icon for an unknown category", () => {
    expect(gameModeIconSrc(9999)).toBe(slayerPng.src);
  });
});
