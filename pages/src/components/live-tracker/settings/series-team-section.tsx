import { Checkbox } from "../../checkbox/checkbox";
import { SeriesTeamNameInputs } from "./series-team-name-inputs";
import type { SeriesStreamerSettings } from "./types";
import styles from "./series-team-section.module.css";

interface SeriesTeamSectionProps {
  readonly settings: SeriesStreamerSettings;
  readonly onChange: (updates: Partial<SeriesStreamerSettings>) => void;
}

export function SeriesTeamSection({ settings, onChange }: SeriesTeamSectionProps): React.ReactElement {
  return (
    <div className={styles.container}>
      <SeriesTeamNameInputs settings={settings} onChange={onChange} />
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
