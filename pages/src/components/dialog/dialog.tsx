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
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const panel = panelRef.current;
      if (panel === null) {
        return;
      }

      const focusableElements = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      const first = focusableElements.at(0);
      const last = focusableElements.at(-1);
      const { activeElement } = document;

      if (first === undefined || last === undefined) {
        event.preventDefault();
        panel.focus();
      } else if (!panel.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && (activeElement === first || activeElement === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return (): void => {
      document.removeEventListener("keydown", handleKeyDown);
      const currentTrigger = document.querySelector<HTMLElement>('button[aria-haspopup="dialog"]');
      if (currentTrigger !== null) {
        currentTrigger.focus();
      } else if (previouslyFocused.current?.isConnected === true) {
        previouslyFocused.current.focus();
      }
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
