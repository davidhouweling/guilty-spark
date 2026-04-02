import React from "react";
import { Input } from "../../input/input";
import type { SeriesStreamerSettings } from "./types";
import styles from "./series-title-section.module.css";

interface SeriesTitleSectionProps {
  readonly settings: SeriesStreamerSettings;
  readonly onChange: (updates: Partial<SeriesStreamerSettings>) => void;
  readonly defaultTitle: string | null;
  readonly defaultSubtitle: string | null;
}

export function SeriesTitleSection({
  settings,
  onChange,
  defaultTitle,
  defaultSubtitle,
}: SeriesTitleSectionProps): React.ReactElement {
  const handleFirstLineChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const { value } = e.target;
    onChange({ titleOverride: value === "" ? null : value });
  };

  const handleSecondLineChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const { value } = e.target;
    onChange({ subTitleOverride: value === "" ? null : value });
  };

  return (
    <div className={styles.container}>
      <p className={styles.description}>
        Override the queue labels for this specific series. Leave empty to use defaults.
      </p>

      <div className={styles.columns}>
        <Input
          containerClassName={styles.section}
          label="Title"
          value={settings.titleOverride ?? ""}
          type="text"
          onChange={handleFirstLineChange}
          placeholder={defaultTitle ?? "e.g. Discord Server"}
          hint={defaultTitle !== null && defaultTitle !== "" ? `Default: ${defaultTitle}` : undefined}
        />

        <Input
          containerClassName={styles.section}
          label="Subtitle"
          value={settings.subTitleOverride ?? ""}
          type="text"
          onChange={handleSecondLineChange}
          placeholder={defaultSubtitle ?? "e.g. Queue #42"}
          hint={defaultSubtitle !== null && defaultSubtitle !== "" ? `Default: ${defaultSubtitle}` : undefined}
        />
      </div>
    </div>
  );
}
