import type { CSSProperties, ReactElement } from "react";
import { MAP_GENERATOR_COUNTS } from "@guilty-spark/shared/contracts/individual-tracker/map-generation";
import { Button } from "../button/button";
import { Select } from "../select/select";
import seriesStatsStyles from "../series-stats/series-stats.module.css";
import type { MapCodeBuilderFormat, MapCodeBuilderPlaylist, MapCodeBuilderViewModel } from "./types";
import styles from "./map-code-builder.module.css";

interface MapCodeBuilderProps extends MapCodeBuilderViewModel {
  readonly onCopyCode: () => void;
  readonly onCountChange: (count: number) => void;
  readonly onFormatChange: (format: MapCodeBuilderFormat) => void;
  readonly onPlaylistChange: (playlist: MapCodeBuilderPlaylist) => void;
  readonly onRandomize: () => void;
}

const FORMAT_OPTIONS: readonly { readonly value: MapCodeBuilderFormat; readonly label: string }[] = [
  { value: "HCS", label: "HCS" },
  { value: "R", label: "Random" },
  { value: "O", label: "Objective only" },
  { value: "S", label: "Slayer only" },
];

const PLAYLIST_OPTIONS: readonly { readonly value: MapCodeBuilderPlaylist; readonly label: string }[] = [
  { value: "current", label: "LVT Pro League - Current" },
  { value: "historical", label: "HCS + LVT Pro League - Historical" },
];

export function MapCodeBuilder({
  count,
  format,
  playlist,
  matches,
  code,
  notice,
  onCopyCode,
  onCountChange,
  onFormatChange,
  onPlaylistChange,
  onRandomize,
}: MapCodeBuilderProps): ReactElement {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Map Code Builder</h1>
      </header>
      <section className={styles.controls} aria-label="Map plan settings">
        <label>
          Number of maps
          <Select
            aria-label="Select number of maps"
            value={count.toString()}
            onChange={(event): void => {
              const nextCount = Number(event.currentTarget.value);
              if (MAP_GENERATOR_COUNTS.includes(nextCount)) {
                onCountChange(nextCount);
              }
            }}
          >
            {MAP_GENERATOR_COUNTS.map((option) => (
              <option key={option} value={option.toString()}>
                {option.toString()}
              </option>
            ))}
          </Select>
        </label>
        <label>
          Playlist
          <Select
            aria-label="Select a playlist"
            value={playlist}
            onChange={(event): void => {
              const selected = PLAYLIST_OPTIONS.find((option) => option.value === event.currentTarget.value);
              if (selected != null) {
                onPlaylistChange(selected.value);
              }
            }}
          >
            {PLAYLIST_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>
        <label>
          Format
          <Select
            aria-label="Select a map format"
            value={format}
            onChange={(event): void => {
              const selected = FORMAT_OPTIONS.find((option) => option.value === event.currentTarget.value);
              if (selected != null) {
                onFormatChange(selected.value);
              }
            }}
          >
            {FORMAT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>
        <Button variant="secondary" onClick={onRandomize}>
          Randomize sequence
        </Button>
      </section>
      <div className={styles.workspace}>
        <section className={styles.sequence} aria-labelledby="sequence-heading">
          <div className={styles.sectionHeading}>
            <h2 id="sequence-heading">Match sequence</h2>
            <span>
              {matches.length.toString().padStart(2, "0")} / {count.toString().padStart(2, "0")}
            </span>
          </div>
          <ol className={styles.matchGrid} aria-label="Map sequence">
            {matches.map((match, index) => (
              <li
                className={seriesStatsStyles.seriesScore}
                key={`${index.toString()}:${match.code}`}
                style={
                  {
                    "--series-score-bg": match.thumbnailUrl == null ? "none" : `url(${match.thumbnailUrl})`,
                  } as CSSProperties
                }
              >
                <div className={seriesStatsStyles.seriesScoreLink}>
                  <img className={seriesStatsStyles.gameTypeIcon} src={match.modeIconUrl} alt={match.mode} />
                  {match.code}
                  <span className={seriesStatsStyles.seriesSubScore}>
                    MATCH {(index + 1).toString().padStart(2, "0")}
                  </span>
                  <span className={seriesStatsStyles.gameTypeAndMap}>
                    {match.mode}: {match.map}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <aside aria-labelledby="code-heading">
          <div className={styles.sectionHeading}>
            <h2 id="code-heading">Share code</h2>
          </div>
          <output className={styles.code} aria-label="Generated map code">
            {code}
          </output>
          <Button variant="secondary" onClick={onCopyCode}>
            Copy code
          </Button>
          {notice != null && <p role="status">{notice}</p>}
          <section aria-label="Discord map code instructions">
            <h3>Use in Discord</h3>
            <p>
              Run <code>{`/maps code:${code}`}</code> for a draft, or choose <strong>Use code</strong> on a Maps embed,
              paste the code, and select <strong>Confirm maps</strong>.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
