import React from "react";
import { Button } from "../../button/button";
import { Checkbox } from "../../checkbox/checkbox";
import { Input } from "../../input/input";
import { Heading } from "../../heading/heading";
import type { TickerSettings } from "./types";
import { ALL_SLAYER_STATS, MAX_PREVIOUS_GAMES_TO_SHOW, MEDAL_RARITY_LEVELS, MIN_PREVIOUS_GAMES_TO_SHOW } from "./types";
import styles from "./ticker-settings-section.module.css";

function formatStatName(stat: string): string {
  // Convert camelCase to Title Case with spaces
  return stat
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

interface TickerSettingsSectionProps {
  readonly settings: TickerSettings;
  readonly showTickerVisibilityToggle?: boolean;
  readonly showPreSeriesInfoToggle?: boolean;
  readonly onChange: (updates: Partial<TickerSettings>) => void;
}

export function TickerSettingsSection({
  settings,
  showTickerVisibilityToggle = true,
  showPreSeriesInfoToggle = true,
  onChange,
}: TickerSettingsSectionProps): React.ReactElement {
  const [maxPreviousGamesToShowInputValue, setMaxPreviousGamesToShowInputValue] = React.useState<string>(
    settings.maxPreviousGamesToShow.toString(),
  );

  React.useEffect(() => {
    setMaxPreviousGamesToShowInputValue(settings.maxPreviousGamesToShow.toString());
  }, [settings.maxPreviousGamesToShow]);

  const handleMaxPreviousGamesToShowChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const nextInputValue = event.target.value;
    setMaxPreviousGamesToShowInputValue(nextInputValue);
    if (nextInputValue.length === 0) {
      return;
    }

    const value = Number.parseInt(nextInputValue, 10);
    if (Number.isNaN(value)) {
      return;
    }

    const clampedValue = Math.max(MIN_PREVIOUS_GAMES_TO_SHOW, Math.min(MAX_PREVIOUS_GAMES_TO_SHOW, value));
    onChange({ maxPreviousGamesToShow: clampedValue });
  };

  const handleStatToggle = (stat: string): void => {
    const isEnabled = settings.selectedSlayerStats.includes(stat);
    const newStats = isEnabled
      ? settings.selectedSlayerStats.filter((s) => s !== stat)
      : [...settings.selectedSlayerStats, stat];
    onChange({ selectedSlayerStats: newStats });
  };

  const handleSelectAll = (): void => {
    onChange({ selectedSlayerStats: [...ALL_SLAYER_STATS] });
  };

  const handleDeselectAll = (): void => {
    onChange({ selectedSlayerStats: [] });
  };

  const handleMedalRarityToggle = (difficultyIndex: number): void => {
    const isEnabled = settings.medalRarityFilter.includes(difficultyIndex);
    const newLevels = isEnabled
      ? settings.medalRarityFilter.filter((l) => l !== difficultyIndex)
      : [...settings.medalRarityFilter, difficultyIndex];
    onChange({ medalRarityFilter: newLevels });
  };

  return (
    <div className={styles.container}>
      <div className={styles.section}>
        <Heading tagName="h5" className={styles.subsectionHeader}>
          Tabs
        </Heading>
        <p className={styles.sectionDescription}>Configure how many recent match tabs are shown.</p>
        <Input
          label="Max number of previous games to show"
          type="number"
          min={MIN_PREVIOUS_GAMES_TO_SHOW}
          max={MAX_PREVIOUS_GAMES_TO_SHOW}
          value={maxPreviousGamesToShowInputValue}
          onChange={handleMaxPreviousGamesToShowChange}
          hint={`Minimum ${MIN_PREVIOUS_GAMES_TO_SHOW.toString()}, maximum ${MAX_PREVIOUS_GAMES_TO_SHOW.toString()}.`}
          containerClassName={styles.numberInput}
        />
      </div>

      <hr className={styles.sectionDivider} />

      <div className={styles.section}>
        <Heading tagName="h5" className={styles.subsectionHeader}>
          Information ticker
        </Heading>
        <p className={styles.sectionDescription}>
          Customize stats and medals shown in the ticker. Toggle visibility available in the Series UI / Matchmaking UI
          sections further down.
        </p>

        {showTickerVisibilityToggle ? (
          <Checkbox
            checked={settings.showTicker}
            onChange={(checked): void => {
              onChange({ showTicker: checked });
            }}
            label="Show Information Ticker"
          />
        ) : null}
      </div>

      {/* Stats Selection */}
      <div className={styles.section}>
        <div className={styles.sectionTitleRow}>
          <Heading tagName="h6" className={styles.subsectionHeader}>
            Slayer Statistics
          </Heading>
          <div className={styles.bulkActions}>
            <Button onClick={handleSelectAll} variant="secondary" size="small">
              Select All
            </Button>
            <Button onClick={handleDeselectAll} variant="secondary" size="small">
              Deselect All
            </Button>
          </div>
        </div>
        <p className={styles.sectionDescription}>Choose which slayer stats to display in the information ticker</p>

        <div className={styles.checkboxGrid}>
          {ALL_SLAYER_STATS.map((stat) => (
            <Checkbox
              key={stat}
              checked={settings.selectedSlayerStats.includes(stat)}
              onChange={(): void => {
                handleStatToggle(stat);
              }}
              label={formatStatName(stat)}
            />
          ))}
        </div>
      </div>

      {/* Objective Stats Toggle */}
      <div className={styles.section}>
        <Checkbox
          checked={settings.showObjectiveStats}
          onChange={(checked): void => {
            onChange({ showObjectiveStats: checked });
          }}
          label="Show Objective Statistics"
          description="Include objective-specific stats for non-Slayer modes"
        />
      </div>

      {/* Medal Rarity Filter */}
      <div className={styles.section}>
        <Heading tagName="h6" className={styles.subsectionHeader}>
          Medal Rarity Filter
        </Heading>
        <p className={styles.sectionDescription}>Select which medal rarities to display in the ticker</p>

        <div className={styles.checkboxGrid}>
          {MEDAL_RARITY_LEVELS.map((level) => (
            <Checkbox
              key={level.id}
              checked={settings.medalRarityFilter.includes(level.id)}
              onChange={(): void => {
                handleMedalRarityToggle(level.id);
              }}
              label={level.name}
            />
          ))}
        </div>
      </div>

      {/* Pre-Series Info Toggle */}
      {showPreSeriesInfoToggle ? (
        <div className={styles.section}>
          <Checkbox
            checked={settings.showPreSeriesInfo}
            onChange={(checked): void => {
              onChange({ showPreSeriesInfo: checked });
            }}
            label="Display Pre-Series Player Info"
            description="Show individual player info before the first match starts"
          />
        </div>
      ) : null}
    </div>
  );
}
