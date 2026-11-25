import type { ReactElement } from "react";
import { Heading } from "../../heading/heading";
import { CloseButton } from "../../close-button/close-button";
import styles from "./settings-dialog.module.css";

interface SettingsDialogHeaderProps {
  readonly title: string;
  readonly onClose: () => void;
}

export function SettingsDialogHeader({ title, onClose }: SettingsDialogHeaderProps): ReactElement {
  return (
    <div className={styles.header}>
      <Heading tagName="h2" className={styles.title}>
        {title}
      </Heading>
      <CloseButton ariaLabel="Close settings" onClick={onClose} />
    </div>
  );
}
