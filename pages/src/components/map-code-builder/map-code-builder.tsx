import type { ReactElement } from "react";
import { MAP_GENERATOR_COUNTS } from "@guilty-spark/shared/contracts/individual-tracker/map-generation";
import { Button } from "../button/button";
import { Select } from "../select/select";
import { Slot } from "./slot/slot";
import type { MapCodeBuilderFormat, MapCodeBuilderPlaylist, MapCodeBuilderViewModel } from "./types";
import styles from "./map-code-builder.module.css";
interface MapCodeBuilderProps extends MapCodeBuilderViewModel {
  readonly onCopy: () => void;
  readonly onCount: (count: number) => void;
  readonly onFormat: (format: MapCodeBuilderFormat) => void;
  readonly onPlaylist: (playlist: MapCodeBuilderPlaylist) => void;
  readonly onGenerate: () => void;
  readonly onEditAll: () => void;
  readonly onEdit: (id: number) => void;
  readonly onMode: (id: number, mode: string) => void;
  readonly onMap: (id: number, map: string) => void;
  readonly onSave: (id: number) => void;
  readonly onMove: (id: number, target: number) => void;
}
export function MapCodeBuilder({
  count,
  format,
  playlist,
  slots,
  code,
  discordCommand,
  matchCountLabel,
  notice,
  onCopy,
  onCount,
  onFormat,
  onPlaylist,
  onGenerate,
  onEditAll,
  onEdit,
  onMode,
  onMap,
  onSave,
  onMove,
}: MapCodeBuilderProps): ReactElement {
  return (
    <div className={styles.page}>
      <h1>Map Code Builder</h1>
      <section className={styles.controls} aria-label="Map plan settings">
        <label>
          Number of maps
          <Select
            aria-label="Select number of maps"
            value={count.toString()}
            onChange={(event): void => {
              onCount(Number(event.currentTarget.value));
            }}
          >
            {MAP_GENERATOR_COUNTS.map((option) => (
              <option key={option} value={option.toString()}>
                {option}
              </option>
            ))}
          </Select>
        </label>
        <label>
          Playlist
          <Select
            aria-label="Select a playlist"
            value={playlist}
            onChange={(event): void => {
              onPlaylist(event.currentTarget.value === "historical" ? "historical" : "current");
            }}
          >
            <option value="current">LVT Pro League - Current</option>
            <option value="historical">HCS + LVT Pro League - Historical</option>
          </Select>
        </label>
        <label>
          Format
          <Select
            aria-label="Select a map format"
            value={format}
            onChange={(event): void => {
              const { value } = event.currentTarget;
              if (value === "HCS" || value === "R" || value === "O" || value === "S") {
                onFormat(value);
              }
            }}
          >
            <option value="HCS">HCS</option>
            <option value="R">Random</option>
            <option value="O">Objective only</option>
            <option value="S">Slayer only</option>
          </Select>
        </label>
        <Button variant="secondary" onClick={onGenerate}>
          Generate
        </Button>
        <Button variant="secondary" onClick={onEditAll}>
          Edit all
        </Button>
      </section>
      <div className={styles.workspace}>
        <section aria-labelledby="sequence-heading">
          <h2 id="sequence-heading">Match sequence</h2>
          <span>{matchCountLabel}</span>
          <ol className={styles.matchGrid} aria-label="Map sequence">
            {slots.map((slot, index) => (
              <Slot
                {...slot}
                key={slot.id}
                onEdit={(): void => {
                  onEdit(slot.id);
                }}
                onMode={(mode): void => {
                  onMode(slot.id, mode);
                }}
                onMap={(map): void => {
                  onMap(slot.id, map);
                }}
                onSave={(): void => {
                  onSave(slot.id);
                }}
                onMove={(direction): void => {
                  const target = slots.at(index + (direction === "up" ? -1 : 1));
                  if (target != null) {
                    onMove(slot.id, target.id);
                  }
                }}
                onDrop={(source): void => {
                  onMove(source, slot.id);
                }}
                onMoveTo={(target): void => {
                  onMove(slot.id, target);
                }}
              />
            ))}
          </ol>
        </section>
        <aside aria-labelledby="code-heading">
          <h2 id="code-heading">Share code</h2>
          <output className={styles.code} aria-label="Generated map code">
            {code || "Complete all matches to create a share code."}
          </output>
          <Button variant="secondary" disabled={!code} onClick={onCopy}>
            Copy code
          </Button>
          {notice != null && <p role="status">{notice}</p>}
          {code && (
            <section aria-label="Discord map code instructions">
              <h3>Use in Discord</h3>
              <p>
                Run <code className={styles.discordCommand}>{discordCommand}</code> for a draft, or choose{" "}
                <strong>Use code</strong> on a Maps embed, paste the code, and select <strong>Confirm maps</strong>.
              </p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
