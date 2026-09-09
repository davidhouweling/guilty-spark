import React from "react";
import classNames from "classnames";
import styles from "./close-button.module.css";

interface CloseButtonProps {
  readonly ariaLabel: string;
  readonly onClick: React.MouseEventHandler<HTMLButtonElement>;
  readonly className?: string;
}

export function CloseButton({ ariaLabel, onClick, className }: CloseButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      className={classNames(styles.closeButton, className)}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      <svg className={styles.closeIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
        <path d="M18 6L6 18M6 6l12 12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
