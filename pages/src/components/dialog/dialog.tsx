import React from "react";
import styles from "./dialog.module.css";

interface DialogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly titleId?: string;
  readonly children: React.ReactNode;
  readonly footer?: React.ReactNode;
  readonly busy?: boolean;
}

export function Dialog({
  isOpen,
  onClose,
  title,
  titleId,
  children,
  footer,
  busy = false,
}: DialogProps): React.ReactElement | null {
  if (!isOpen) {
    return null;
  }

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div
        className={styles.dialog}
        onClick={(event): void => {
          event.stopPropagation();
        }}
      >
        <header className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            disabled={busy}
            aria-label={`Close ${title.toLowerCase()}`}
          >
            ×
          </button>
        </header>

        <div className={styles.content}>{children}</div>

        {footer != null && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </div>
  );
}
