import React from "react";
import classNames from "classnames";
import guiltySpark from "../../../assets/guilty-spark-icon.png";
import { Button } from "../../button/button";
import styles from "./settings-trigger.module.css";

interface SettingsTriggerProps {
  readonly compact: boolean;
  readonly onClick: () => void;
}

export function SettingsTrigger({ compact, onClick }: SettingsTriggerProps): React.ReactElement {
  if (!compact) {
    return (
      <Button variant="secondary" size="small" ariaLabel="Open overlay settings" onClick={onClick}>
        Settings
      </Button>
    );
  }

  return (
    <button
      type="button"
      className={classNames(styles.trigger, styles.compact)}
      onClick={onClick}
      aria-label="Open overlay settings"
    >
      <img src={guiltySpark.src} alt="" className={styles.triggerIcon} />
    </button>
  );
}
