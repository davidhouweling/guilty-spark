import { useEffect, useRef } from "react";
import type { ReactElement, ReactNode, KeyboardEvent } from "react";
import styles from "./settings-dialog.module.css";

interface SettingsDialogFrameProps {
  readonly title: string;
  readonly children: ReactNode;
  readonly onClose: () => void;
}

export function SettingsDialogFrame({ title, children, onClose }: SettingsDialogFrameProps): ReactElement {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trigger = document.activeElement;
    dialogRef.current?.focus();
    return (): void => {
      if (trigger instanceof HTMLElement) {
        trigger.focus();
      }
    };
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      onClose();
    }
    if (event.key === "Tab") {
      const controls = Array.from(
        event.currentTarget.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]",
        ),
      );
      const first = controls.at(0);
      const last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  }

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className={styles.overlay}
      onClick={(event): void => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {children}
    </div>
  );
}
