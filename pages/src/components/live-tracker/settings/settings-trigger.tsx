import React from "react";
import classNames from "classnames";
import guiltySpark from "../../../assets/guilty-spark-icon.png";
import styles from "./settings-trigger.module.css";

interface SettingsTriggerProps {
  compact: boolean;
  readonly onClick: () => void;
}

export function SettingsTrigger({ compact, onClick }: SettingsTriggerProps): React.ReactElement {
  return (
    <button
      type="button"
      className={classNames(styles.trigger, { [styles.compact]: compact })}
      onClick={onClick}
      aria-label="Open overlay settings"
    >
      <img src={guiltySpark.src} alt="" className={styles.triggerIcon} />
      {!compact && <span className={styles.triggerLabel}>Settings</span>}
    </button>
  );
}
