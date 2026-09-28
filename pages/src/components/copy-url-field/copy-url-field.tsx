import type { ReactElement } from "react";
import styles from "./copy-url-field.module.css";

export interface CopyUrlFieldProps {
  readonly displayText: string;
  readonly copyLabel: string;
  readonly copied: boolean;
  readonly disabled: boolean;
  readonly onCopy: () => void;
}

function CopyIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        d="M5 12.5l4.5 4.5L19 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CopyUrlField({ displayText, copyLabel, copied, disabled, onCopy }: CopyUrlFieldProps): ReactElement {
  return (
    <div className={styles.field}>
      <span className={styles.url} title={displayText}>
        {displayText}
      </span>
      <button
        type="button"
        className={styles.copyButton}
        aria-label={copyLabel}
        title={copyLabel}
        disabled={disabled}
        onClick={onCopy}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
    </div>
  );
}
