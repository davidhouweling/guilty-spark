import type { ReactElement } from "react";
import classNames from "classnames";
import styles from "./settings-dialog.module.css";

interface ViewModeButtonProps {
  readonly label: string;
  readonly description: string;
  readonly isSelected: boolean;
  readonly onClick: () => void;
}

export function ViewModeButton({ label, description, isSelected, onClick }: ViewModeButtonProps): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={isSelected}
      className={classNames(styles.viewModeButton, { [styles.viewModeButtonSelected]: isSelected })}
    >
      <span className={styles.viewModeLabel}>{label}</span>
      <span className={styles.viewModeDescription}>{description}</span>
      {isSelected && <span className={styles.viewModeCheckmark}>✓</span>}
    </button>
  );
}
