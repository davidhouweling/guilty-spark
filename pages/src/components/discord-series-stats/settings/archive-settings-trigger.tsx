import type { ReactElement } from "react";
import styles from "../../close-button/close-button.module.css";

interface ArchiveSettingsTriggerProps {
  readonly onClick: () => void;
}

export function ArchiveSettingsTrigger({ onClick }: ArchiveSettingsTriggerProps): ReactElement {
  return (
    <button
      type="button"
      className={styles.closeButton}
      onClick={onClick}
      aria-label="Open series settings"
      aria-haspopup="dialog"
    >
      <svg className={styles.closeIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
        <path
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M10 2h4l1 3 2 1 3-1 2 3-2 3v2l2 3-2 3-3-1-2 1-1 3h-4l-1-3-2-1-3 1-2-3 2-3v-2L2 8l2-3 3 1 2-1Z"
        />
        <circle cx="12" cy="12" r="3" strokeWidth="2" />
      </svg>
    </button>
  );
}
