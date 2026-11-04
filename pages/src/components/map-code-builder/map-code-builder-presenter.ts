import { MAP_GENERATOR_COUNTS } from "@guilty-spark/shared/contracts/individual-tracker/map-generation";
import { CURRENT_HCS_MAPS, HISTORICAL_HCS_MAPS, getMapModeFormatSequence } from "@guilty-spark/shared/halo/hcs";
import { encodeMapCode, decodeMapCode } from "@guilty-spark/shared/halo/map-code/codec";
import { generateRoundRobinMaps } from "@guilty-spark/shared/halo/round-robin";
import { gameModeIconSrcForModeName } from "../individual-tracker/game-mode-icon";
import { getMapPreviewUrl } from "./map-art";
import type { MapCodeBuilderStore } from "./map-code-builder-store";
import type {
  MapCodeBuilderFormat,
  MapCodeBuilderMatch,
  MapCodeBuilderPlaylist,
  MapCodeBuilderSnapshot,
  MapCodeBuilderViewModel,
} from "./types";

const SAMPLE_CODE = "CESOKLOSSR";
const GENERATION_FORMATS = { HCS: "HCS", R: "random", O: "objective", S: "slayer" } as const;

export class MapCodeBuilderPresenter {
  private readonly store: MapCodeBuilderStore;
  private readonly random: () => number;

  public constructor(store: MapCodeBuilderStore, random: () => number = Math.random) {
    this.store = store;
    this.random = random;
    this.store.update({ matches: decodeMapCode(SAMPLE_CODE) });
  }

  public present(snapshot: MapCodeBuilderSnapshot): MapCodeBuilderViewModel {
    return {
      ...snapshot,
      matches: snapshot.matches.map((match) => ({
        ...match,
        code: encodeMapCode([match]),
        modeIconUrl: gameModeIconSrcForModeName(match.mode) ?? "",
        thumbnailUrl: getMapPreviewUrl(match.map),
      })),
      code: encodeMapCode(snapshot.matches),
    };
  }

  public setCount(count: number): void {
    if (!MAP_GENERATOR_COUNTS.includes(count)) {
      return;
    }
    const snapshot = this.store.getSnapshot();
    this.updatePlan(count, snapshot.format, snapshot.playlist);
  }

  public setFormat(format: MapCodeBuilderFormat): void {
    const snapshot = this.store.getSnapshot();
    this.updatePlan(snapshot.count, format, snapshot.playlist);
  }

  public setPlaylist(playlist: MapCodeBuilderPlaylist): void {
    const snapshot = this.store.getSnapshot();
    this.updatePlan(snapshot.count, snapshot.format, playlist);
  }

  public randomize(): void {
    const snapshot = this.store.getSnapshot();
    this.store.update({
      matches: this.generateMatches(snapshot.count, snapshot.format, snapshot.playlist),
      notice: "New sequence generated",
    });
  }

  public setNotice(notice: string): void {
    this.store.update({ notice });
  }

  private updatePlan(count: number, format: MapCodeBuilderFormat, playlist: MapCodeBuilderPlaylist): void {
    this.store.update({
      count,
      format,
      playlist,
      matches: this.generateMatches(count, format, playlist),
      notice: null,
    });
  }

  private generateMatches(
    count: number,
    format: MapCodeBuilderFormat,
    playlist: MapCodeBuilderPlaylist,
  ): MapCodeBuilderMatch[] {
    const formatSequence = getMapModeFormatSequence(GENERATION_FORMATS[format], count, this.random);
    const mapSet = playlist === "current" ? CURRENT_HCS_MAPS : HISTORICAL_HCS_MAPS;
    const pool = Object.entries(mapSet).flatMap(([mode, maps]) => maps.map((map) => ({ mode, map })));
    return generateRoundRobinMaps({ count, pool, formatSequence, random: this.random });
  }
}
