import React from "react";
import { Container } from "../container/container";
import styles from "./match-stats.module.css";

export interface StatsHeaderItem {
  readonly label: string;
  readonly value: string;
}

interface StatsHeaderProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly metadata: readonly StatsHeaderItem[];
  readonly backgroundStyle: React.CSSProperties;
  readonly gameModeIconUrl?: string;
  readonly gameModeAlt?: string;
  readonly rightContent?: React.ReactNode;
}

export function StatsHeader({
  title,
  subtitle,
  metadata,
  backgroundStyle,
  gameModeIconUrl,
  gameModeAlt,
  rightContent,
}: StatsHeaderProps): React.ReactElement {
  return (
    <Container className={styles.matchHeader} style={backgroundStyle}>
      <div className={styles.matchHeaderContent}>
        <h3 className={styles.matchTitle}>{title}</h3>
        {subtitle != null && subtitle !== "" ? <p className={styles.matchSubtitle}>{subtitle}</p> : null}
        <ul className={styles.matchMetadata}>
          {metadata.map((item) => (
            <li key={`${item.label}-${item.value}`}>
              <span className={styles.matchMetaLabel}>{item.label}:</span>{" "}
              <span className={styles.matchMetaValue}>{item.value}</span>
            </li>
          ))}
        </ul>
      </div>
      {rightContent ??
        (gameModeIconUrl != null ? (
          <img src={gameModeIconUrl} alt={gameModeAlt ?? ""} className={styles.gameModeIcon} />
        ) : null)}
    </Container>
  );
}
