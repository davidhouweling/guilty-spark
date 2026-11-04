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
  private readonly writeClipboard: (code: string) => Promise<void>;

  public constructor(
    store: MapCodeBuilderStore,
    random: () => number = Math.random,
    writeClipboard: (code: string) => Promise<void> = async (code) => navigator.clipboard.writeText(code),
  ) {
    this.store = store;
    this.random = random;
    this.writeClipboard = writeClipboard;
    this.store.update({ matches: decodeMapCode(SAMPLE_CODE) });
  }

  public present(snapshot: MapCodeBuilderSnapshot): MapCodeBuilderViewModel {
    const code = encodeMapCode(snapshot.matches);
    return {
      ...snapshot,
      matches: snapshot.matches.map((match, index) => ({
        ...match,
        code: encodeMapCode([match]),
        matchLabel: `MATCH ${(index + 1).toString().padStart(2, "0")}`,
        modeAndMapLabel: `${match.mode}: ${match.map}`,
        modeIconUrl: gameModeIconSrcForModeName(match.mode) ?? "",
        thumbnailUrl: getMapPreviewUrl(match.map),
      })),
      code,
      discordCommand: `/maps code:${code}`,
      matchCountLabel: `${snapshot.matches.length.toString().padStart(2, "0")} / ${snapshot.count.toString().padStart(2, "0")}`,
    };
  }

  public async copyCodeAsync(): Promise<void> {
    const code = this.getCurrentCode();
    let notice = "Map code copied.";
    try {
      await this.writeClipboard(code);
    } catch {
      notice = "Clipboard access is unavailable in this browser.";
    }
    if (this.getCurrentCode() === code) {
      this.store.update({ notice });
    }
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

  private getCurrentCode(): string {
    return encodeMapCode(this.store.getSnapshot().matches);
  }
}
