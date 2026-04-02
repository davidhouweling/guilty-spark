import { Checkbox } from "../../checkbox/checkbox";
import { Input } from "../../input/input";
import type { SeriesStreamerSettings } from "./types";
import styles from "./series-team-section.module.css";

interface SeriesTeamSectionProps {
  readonly settings: SeriesStreamerSettings;
  readonly onChange: (updates: Partial<SeriesStreamerSettings>) => void;
}

export function SeriesTeamSection({ settings, onChange }: SeriesTeamSectionProps): React.ReactElement {
  return (
    <div className={styles.container}>
      <p className={styles.description}>
        Override the team labels for this specific series. Leave empty to use defaults (Discord / Xbox).
      </p>

      <div className={styles.columns}>
        <Input
          containerClassName={styles.section}
          label="Team 1 Name"
          value={settings.eagleTeamNameOverride ?? ""}
          type="text"
          onChange={(e) => {
            const { value } = e.target;
            onChange({ eagleTeamNameOverride: value === "" ? null : value });
          }}
          placeholder="e.g. Team Eagle"
        />
        <Input
          containerClassName={styles.section}
          label="Team 2 Name"
          value={settings.cobraTeamNameOverride ?? ""}
          type="text"
          onChange={(e) => {
            const { value } = e.target;
            onChange({ cobraTeamNameOverride: value === "" ? null : value });
          }}
          placeholder="e.g. Team Cobra"
        />
      </div>

      <Checkbox
        checked={settings.disableTeamPlayerNames ?? false}
        label="Disable toggling to player names (show only team names)"
        onChange={(checked): void => {
          onChange({ disableTeamPlayerNames: checked });
        }}
      />
    </div>
  );
}
