import React from "react";
import styles from "./tracker-initiation.module.css";

interface TrackerSearchFormProps {
  readonly gamertag: string;
  readonly isSearching: boolean;
  readonly onGamertagChange: (gamertag: string) => void;
  readonly onSearch: () => void;
}

export function TrackerSearchForm({
  gamertag,
  isSearching,
  onGamertagChange,
  onSearch,
}: TrackerSearchFormProps): React.ReactElement {
  return (
    <div className={styles.searchForm}>
      <input
        type="text"
        className={styles.input}
        placeholder="Enter Gamertag"
        value={gamertag}
        onChange={(e): void => {
          onGamertagChange(e.target.value);
        }}
        onKeyDown={(e): void => {
          if (e.key === "Enter") {
            onSearch();
          }
        }}
        disabled={isSearching}
      />
      <button
        type="button"
        className={styles.searchButton}
        onClick={(): void => {
          onSearch();
        }}
        disabled={isSearching}
      >
        {isSearching ? "Searching..." : "Search"}
      </button>
    </div>
  );
}
