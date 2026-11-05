import classNames from "classnames";
import { useRef, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { Button } from "../../button/button";
import { PencilIcon } from "../../icons/pencil-icon";
import { DragGripIcon } from "../../icons/drag-grip-icon";
import { ArrowIcon } from "../../icons/arrow-icon";
import { ImagePicker } from "../image-picker/image-picker";
import type { MapCodeBuilderSlotModel } from "../types";
import styles from "./slot.module.css";

interface SlotProps extends MapCodeBuilderSlotModel {
  readonly onEdit: () => void;
  readonly onMode: (mode: string) => void;
  readonly onMap: (map: string) => void;
  readonly onSave: () => void;
  readonly onMove: (direction: "up" | "down") => void;
  readonly onDrop: (id: number) => void;
  readonly onMoveTo: (id: number) => void;
}
type SlotStyle = CSSProperties & { readonly "--map-bg": string };
export function Slot({
  id,
  editing,
  matchLabel,
  code,
  label,
  background,
  modeIcon,
  draftMode,
  draftMap,
  modes,
  maps,
  canSave,
  canMoveUp,
  canMoveDown,
  onEdit,
  onMode,
  onMap,
  onSave,
  onMove,
  onDrop,
  onMoveTo,
}: SlotProps): ReactElement {
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const style: SlotStyle = { "--map-bg": background ? `url(${background})` : "none" };
  return (
    <li
      className={classNames(styles.tile, editing && styles.editing, isDragging && styles.dragging)}
      data-map-slot={id}
      style={style}
      draggable={!editing}
      onDragStart={(event): void => {
        event.dataTransfer.setData("application/x-map-slot", id.toString());
        event.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(event): void => {
        if (event.dataTransfer.types.includes("application/x-map-slot")) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }
      }}
      onDrop={(event): void => {
        event.preventDefault();
        const source = event.dataTransfer.getData("application/x-map-slot");
        if (/^\d+$/.test(source)) {
          onDrop(Number(source));
        }
      }}
    >
      <header className={styles.header}>
        <span>{matchLabel}</span>
        {!editing && (
          <button
            className={styles.icon}
            type="button"
            aria-label={`Edit ${matchLabel}`}
            title={`Edit ${matchLabel}`}
            onClick={onEdit}
          >
            <PencilIcon />
          </button>
        )}
      </header>
      {editing ? (
        <div className={styles.editor}>
          <ImagePicker label={`${matchLabel} game type`} value={draftMode} options={modes} onSelect={onMode} />
          <ImagePicker label={`${matchLabel} map`} value={draftMap} options={maps} onSelect={onMap} />
          <Button size="small" disabled={!canSave} onClick={onSave}>
            Save
          </Button>
        </div>
      ) : (
        <div className={styles.summary}>
          <img src={modeIcon} alt="" draggable={false} />
          <strong>{code}</strong>
          <span>{label}</span>
        </div>
      )}
      <footer className={styles.actions}>
        <button
          type="button"
          title="Drag to reorder"
          aria-label={`Drag ${matchLabel} to reorder`}
          className={styles.grip}
          onPointerDown={(event): void => {
            if (event.button !== 0) {
              return;
            }
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            dragStart.current = { x: event.clientX, y: event.clientY };
          }}
          onPointerMove={(event): void => {
            const start = dragStart.current;
            if (start != null && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) {
              setIsDragging(true);
            }
          }}
          onPointerUp={(event): void => {
            if (isDragging) {
              const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-map-slot]");
              const targetId = target?.getAttribute("data-map-slot");
              if (targetId != null && /^\d+$/.test(targetId)) {
                onMoveTo(Number(targetId));
              }
            }
            dragStart.current = null;
            setIsDragging(false);
          }}
          onPointerCancel={(): void => {
            dragStart.current = null;
            setIsDragging(false);
          }}
        >
          <DragGripIcon />
        </button>
        <button
          className={styles.icon}
          type="button"
          disabled={!canMoveUp}
          aria-label={`Move ${matchLabel} up`}
          title="Move up"
          onClick={(): void => {
            onMove("up");
          }}
        >
          <ArrowIcon direction="up" />
        </button>
        <button
          className={styles.icon}
          type="button"
          disabled={!canMoveDown}
          aria-label={`Move ${matchLabel} down`}
          title="Move down"
          onClick={(): void => {
            onMove("down");
          }}
        >
          <ArrowIcon direction="down" />
        </button>
      </footer>
    </li>
  );
}
