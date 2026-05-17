import React from "react";
import styles from "./tracker-initiation.module.css";
import { TrackerSearchForm } from "./tracker-search-form";

interface TrackerInitiationProps {
  readonly gamertag: string;
  readonly isSearching: boolean;
  readonly children: React.ReactNode;
  readonly onGamertagChange: (gamertag: string) => void;
  readonly onSearch: () => void;
}

export function TrackerInitiation({
  gamertag,
  isSearching,
  children,
  onGamertagChange,
  onSearch,
}: TrackerInitiationProps): React.ReactElement {
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <h1 className={styles.title}>Individual Match Tracker</h1>
        <p className={styles.subtitle}>Search for a player and select matches to track</p>

        <TrackerSearchForm
          gamertag={gamertag}
          onGamertagChange={onGamertagChange}
          onSearch={onSearch}
          isSearching={isSearching}
        />
        {children}
      </div>
    </div>
  );
}
