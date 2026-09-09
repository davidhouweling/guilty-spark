import React, { useEffect, useId, useRef } from "react";
import classNames from "classnames";
import { CloseButton } from "../close-button/close-button";
import { Heading } from "../heading/heading";
import styles from "./dialog.module.css";

interface DialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly onClose: () => void;
  readonly children: React.ReactNode;
  readonly footer?: React.ReactNode;
  readonly panelClassName?: string;
  readonly bodyClassName?: string;
}

export function Dialog({
  open,
  title,
  onClose,
  children,
  footer,
  panelClassName,
  bodyClassName,
}: DialogProps): React.ReactElement | null {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    previouslyFocused.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return (): void => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused.current?.focus();
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      className={styles.overlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={classNames(styles.panel, panelClassName)}
      >
        <CloseButton ariaLabel={`Close ${title}`} className={styles.closeButton} onClick={onClose} />
        <Heading tagName="h2" className={styles.title} id={titleId}>
          {title}
        </Heading>
        <div className={classNames(styles.body, bodyClassName)}>{children}</div>
        {footer != null && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  );
}
