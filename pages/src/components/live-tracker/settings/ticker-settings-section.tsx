import React from "react";
import { Button } from "../../button/button";
import { Checkbox } from "../../checkbox/checkbox";
import type { TickerSettings } from "./types";
import { ALL_SLAYER_STATS, MEDAL_RARITY_LEVELS } from "./types";
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
  readonly onChange: (updates: Partial<TickerSettings>) => void;
}

export function TickerSettingsSection({ settings, onChange }: TickerSettingsSectionProps): React.ReactElement {
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
      <Checkbox
        checked={settings.showTicker}
        onChange={(checked): void => {
          onChange({ showTicker: checked });
        }}
        label="Show Information Ticker"
      />

      {/* Stats Selection */}
      <div className={styles.section}>
        <div className={styles.sectionTitleRow}>
          <h4 className={styles.subsectionHeader}>Slayer Statistics</h4>
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
        <h4 className={styles.subsectionHeader}>Medal Rarity Filter</h4>
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

      {/* Pre-Series Info Toggle - Placeholder for Phase 6 */}
      <div className={styles.section}>
        <Checkbox
          checked
          onChange={(): void => {
            // Intentionally empty - this is disabled for Phase 6
          }}
          label="Display Pre-Series Player Info"
          description="Show individual player info before the first match (Phase 6)"
          disabled
        />
      </div>
    </div>
  );
}
