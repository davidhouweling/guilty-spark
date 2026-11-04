import type { CSSProperties, ReactElement } from "react";
import { MAP_GENERATOR_COUNTS } from "@guilty-spark/shared/contracts/individual-tracker/map-generation";
import { Button } from "../button/button";
import { Select } from "../select/select";
import seriesStatsStyles from "../series-stats/series-stats.module.css";
import type { MapCodeBuilderFormat, MapCodeBuilderPlaylist, MapCodeBuilderViewModel } from "./types";
import styles from "./map-code-builder.module.css";

type MapCodeBuilderCSSProperties = CSSProperties & { readonly "--series-score-bg": string };

interface MapCodeBuilderProps extends MapCodeBuilderViewModel {
  readonly onCopyCode: () => void;
  readonly onCountChange: (count: number) => void;
  readonly onFormatChange: (format: MapCodeBuilderFormat) => void;
  readonly onPlaylistChange: (playlist: MapCodeBuilderPlaylist) => void;
  readonly onRandomize: () => void;
}

function mapBackgroundStyle(thumbnailUrl: string | null): MapCodeBuilderCSSProperties {
  return { "--series-score-bg": thumbnailUrl == null ? "none" : `url(${thumbnailUrl})` };
}

export function MapCodeBuilder({
  count,
  format,
  playlist,
  matches,
  discordCommand,
  code,
  matchCountLabel,
  notice,
  onCopyCode,
  onCountChange,
  onFormatChange,
  onPlaylistChange,
  onRandomize,
}: MapCodeBuilderProps): ReactElement {
  return (
    <div className={styles.page}>
      <h1>Map Code Builder</h1>
      <section className={styles.controls} aria-label="Map plan settings">
        <label>
          Number of maps
          <Select
            aria-label="Select number of maps"
            value={count.toString()}
            onChange={(event): void => {
              onCountChange(Number(event.currentTarget.value));
            }}
          >
            {MAP_GENERATOR_COUNTS.map((option) => (
              <option key={option} value={option.toString()}>
                {option}
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
              onPlaylistChange(event.currentTarget.value === "historical" ? "historical" : "current");
            }}
          >
            <option value="current">LVT Pro League - Current</option>
            <option value="historical">HCS + LVT Pro League - Historical</option>
          </Select>
        </label>
        <label>
          Format
          <Select
            aria-label="Select a map format"
            value={format}
            onChange={(event): void => {
              const selected = event.currentTarget.value;
              if (selected === "HCS" || selected === "R" || selected === "O" || selected === "S") {
                onFormatChange(selected);
              }
            }}
          >
            <option value="HCS">HCS</option>
            <option value="R">Random</option>
            <option value="O">Objective only</option>
            <option value="S">Slayer only</option>
          </Select>
        </label>
        <Button variant="secondary" onClick={onRandomize}>
          Randomize sequence
        </Button>
      </section>
      <div className={styles.workspace}>
        <section className={styles.sequence} aria-labelledby="sequence-heading">
          <div>
            <h2 id="sequence-heading">Match sequence</h2>
            <span>{matchCountLabel}</span>
          </div>
          <ol className={styles.matchGrid} aria-label="Map sequence">
            {matches.map((match, index) => (
              <li
                className={seriesStatsStyles.seriesScore}
                key={`${index.toString()}:${match.code}`}
                style={mapBackgroundStyle(match.thumbnailUrl)}
              >
                <div className={seriesStatsStyles.seriesScoreLink}>
                  <img className={seriesStatsStyles.gameTypeIcon} src={match.modeIconUrl} alt={match.mode} />
                  {match.code}
                  <span className={seriesStatsStyles.seriesSubScore}>{match.matchLabel}</span>
                  <span className={seriesStatsStyles.gameTypeAndMap}>{match.modeAndMapLabel}</span>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <aside aria-labelledby="code-heading">
          <div>
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
              Run <code className={styles.discordCommand}>{discordCommand}</code> for a draft, or choose{" "}
              <strong>Use code</strong> on a Maps embed, paste the code, and select <strong>Confirm maps</strong>.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
