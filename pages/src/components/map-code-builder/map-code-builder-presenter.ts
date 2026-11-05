import { MAP_GENERATOR_COUNTS } from "@guilty-spark/shared/contracts/individual-tracker/map-generation";
import {
  ALL_MODES,
  CURRENT_HCS_MAPS,
  HISTORICAL_HCS_MAPS,
  getMapModeFormatSequence,
} from "@guilty-spark/shared/halo/hcs";
import { encodeMapCode } from "@guilty-spark/shared/halo/map-code/codec";
import { generateRoundRobinMaps } from "@guilty-spark/shared/halo/round-robin";
import { gameModeIconSrcForModeName } from "../individual-tracker/game-mode-icon";
import { getMapPreviewUrl } from "./map-art";
import type { MapCodeBuilderStore } from "./map-code-builder-store";
import type {
  MapCodeBuilderFormat,
  MapCodeBuilderMatch,
  MapCodeBuilderPlaylist,
  MapCodeBuilderSlot,
  MapCodeBuilderSnapshot,
  MapCodeBuilderViewModel,
} from "./types";

const FORMATS = { HCS: "HCS", R: "random", O: "objective", S: "slayer" } as const;
export class MapCodeBuilderPresenter {
  private nextId = 0;
  public constructor(
    private readonly store: MapCodeBuilderStore,
    private readonly random: () => number = Math.random,
    private readonly writeClipboard: (code: string) => Promise<void> = async (code) =>
      navigator.clipboard.writeText(code),
  ) {
    this.generate();
  }

  public present(snapshot: MapCodeBuilderSnapshot): MapCodeBuilderViewModel {
    const pool = this.getPool(snapshot.playlist);
    const matches = snapshot.slots.flatMap((slot) => (slot.match == null || slot.editing ? [] : [slot.match]));
    const code = matches.length === snapshot.count ? encodeMapCode(matches) : "";
    return {
      count: snapshot.count,
      format: snapshot.format,
      playlist: snapshot.playlist,
      notice: snapshot.notice,
      code,
      discordCommand: code ? `/maps code:${code}` : "",
      matchCountLabel: `${matches.length.toString()} / ${snapshot.count.toString()}`,
      slots: snapshot.slots.map((slot, index) => ({
        id: slot.id,
        editing: slot.editing,
        matchLabel: `Match ${(index + 1).toString()}`,
        code: slot.match == null ? "" : encodeMapCode([slot.match]),
        label: slot.match == null ? "" : `${slot.match.mode}: ${slot.match.map}`,
        background: slot.match == null ? "" : (getMapPreviewUrl(slot.match.map) ?? ""),
        modeIcon: gameModeIconSrcForModeName(slot.match?.mode ?? slot.draft.mode) ?? "",
        draftMode: slot.draft.mode,
        draftMap: slot.draft.map,
        modes: ALL_MODES.filter((mode) => pool.some((pair) => pair.mode === mode))
          .sort((left, right) => left.localeCompare(right))
          .map((mode) => ({
            label: mode,
            image: gameModeIconSrcForModeName(mode) ?? null,
          })),
        maps: pool
          .filter((pair) => pair.mode === slot.draft.mode)
          .map((pair) => ({ label: pair.map, image: getMapPreviewUrl(pair.map) }))
          .sort((left, right) => left.label.localeCompare(right.label)),
        canSave: this.isValid(slot.draft, snapshot.playlist),
        canMoveUp: index > 0,
        canMoveDown: index < snapshot.count - 1,
      })),
    };
  }
  public setCount(count: number): void {
    if (!MAP_GENERATOR_COUNTS.includes(count)) {
      return;
    }
    const snapshot = this.store.getSnapshot();
    const slots = Array.from(
      { length: count },
      (_, index) => snapshot.slots.at(index) ?? this.newSlot(snapshot.playlist),
    );
    this.store.update({ count, slots, notice: null });
  }
  public setFormat(format: MapCodeBuilderFormat): void {
    this.store.update({ format, notice: null });
  }
  public setPlaylist(playlist: MapCodeBuilderPlaylist): void {
    const slots = this.store.getSnapshot().slots.map((slot) => ({
      ...slot,
      match: slot.match != null && this.isValid(slot.match, playlist) ? slot.match : null,
      draft: this.isValid(slot.draft, playlist) ? slot.draft : this.defaultPair(playlist),
      editing: slot.editing || slot.match == null || !this.isValid(slot.match, playlist),
    }));
    this.store.update({ playlist, slots, notice: null });
  }
  public generate(): void {
    const snapshot = this.store.getSnapshot();
    const matches = generateRoundRobinMaps({
      count: snapshot.count,
      pool: this.getPool(snapshot.playlist),
      formatSequence: getMapModeFormatSequence(FORMATS[snapshot.format], snapshot.count, this.random),
      random: this.random,
    });
    this.store.update({
      slots: matches.map((match, index) => ({
        id: snapshot.slots.at(index)?.id ?? this.nextId++,
        match,
        draft: match,
        editing: false,
      })),
      notice: null,
    });
  }
  public edit(id: number): void {
    this.updateSlot(id, (slot) => ({ ...slot, editing: true, draft: slot.match ?? slot.draft }));
  }
  public editAll(): void {
    this.store.update({
      slots: this.store
        .getSnapshot()
        .slots.map((slot) => (slot.editing ? slot : { ...slot, editing: true, draft: slot.match ?? slot.draft })),
      notice: null,
    });
  }
  public setMode(id: number, mode: string): void {
    const { playlist } = this.store.getSnapshot();
    const pair = this.getPool(playlist).find((candidate) => candidate.mode === mode);
    if (pair != null) {
      this.updateSlot(id, (slot) => ({
        ...slot,
        draft: this.isValid({ mode, map: slot.draft.map }, playlist) ? { mode, map: slot.draft.map } : pair,
      }));
    }
  }
  public setMap(id: number, map: string): void {
    const { playlist } = this.store.getSnapshot();
    this.updateSlot(id, (slot) =>
      this.isValid({ mode: slot.draft.mode, map }, playlist)
        ? { ...slot, draft: { mode: slot.draft.mode, map } }
        : slot,
    );
  }
  public save(id: number): void {
    const { playlist } = this.store.getSnapshot();
    this.updateSlot(id, (slot) =>
      this.isValid(slot.draft, playlist) ? { ...slot, match: slot.draft, editing: false } : slot,
    );
  }
  public move(id: number, targetId: number): void {
    const slots = [...this.store.getSnapshot().slots];
    const from = slots.findIndex((slot) => slot.id === id);
    const to = slots.findIndex((slot) => slot.id === targetId);
    if (from < 0 || to < 0 || from === to) {
      return;
    }
    const slot = slots.at(from);
    if (slot == null) {
      return;
    }
    slots.splice(from, 1);
    slots.splice(to, 0, slot);
    this.store.update({ slots, notice: null });
  }
  public async copyCodeAsync(): Promise<void> {
    const { code } = this.present(this.store.getSnapshot());
    if (!code) {
      return;
    }
    let notice = "Map code copied.";
    try {
      await this.writeClipboard(code);
    } catch {
      notice = "Clipboard access is unavailable in this browser.";
    }
    if (this.present(this.store.getSnapshot()).code === code) {
      this.store.update({ notice });
    }
  }
  private updateSlot(id: number, update: (slot: MapCodeBuilderSlot) => MapCodeBuilderSlot): void {
    this.store.update({
      slots: this.store.getSnapshot().slots.map((slot) => (slot.id === id ? update(slot) : slot)),
      notice: null,
    });
  }
  private newSlot(playlist: MapCodeBuilderPlaylist): MapCodeBuilderSlot {
    return { id: this.nextId++, match: null, draft: this.defaultPair(playlist), editing: true };
  }
  private defaultPair(playlist: MapCodeBuilderPlaylist): MapCodeBuilderMatch {
    return this.getPool(playlist).at(0) ?? { mode: "Slayer", map: "Live Fire" };
  }
  private isValid(pair: MapCodeBuilderMatch, playlist: MapCodeBuilderPlaylist): boolean {
    return this.getPool(playlist).some((candidate) => candidate.mode === pair.mode && candidate.map === pair.map);
  }
  private getPool(playlist: MapCodeBuilderPlaylist): MapCodeBuilderMatch[] {
    const maps = playlist === "current" ? CURRENT_HCS_MAPS : HISTORICAL_HCS_MAPS;
    return ALL_MODES.flatMap((mode) => maps[mode].map((map) => ({ mode, map })));
  }
}
