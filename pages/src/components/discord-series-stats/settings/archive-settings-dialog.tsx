import type { ReactElement } from "react";
import { Heading } from "../../heading/heading";
import { SettingsDialogFrame } from "../../live-tracker/settings/settings-dialog-frame";
import { SettingsDialogHeader } from "../../live-tracker/settings/settings-dialog-header";
import { SeriesTitleSection } from "../../live-tracker/settings/series-title-section";
import { ViewModeButton } from "../../live-tracker/settings/view-mode-button";
import type { SeriesStreamerSettings } from "../../live-tracker/settings/types";
import type { ViewMode } from "../../view-mode/view-mode-selector";
import styles from "../../live-tracker/settings/settings-dialog.module.css";

interface ArchiveSettingsDialogProps {
  readonly viewMode: ViewMode;
  readonly seriesSettings: SeriesStreamerSettings;
  readonly defaultTitle: string | null;
  readonly defaultSubtitle: string | null;
  readonly onClose: () => void;
  readonly onSeriesSettingsChange: (updates: Partial<SeriesStreamerSettings>) => void;
  readonly onViewModeSelect: (mode: ViewMode) => void;
}

export function ArchiveSettingsDialog({
  viewMode,
  seriesSettings,
  defaultTitle,
  defaultSubtitle,
  onClose,
  onSeriesSettingsChange,
  onViewModeSelect,
}: ArchiveSettingsDialogProps): ReactElement {
  return (
    <SettingsDialogFrame title="Series Settings" onClose={onClose}>
      <div className={styles.dialog}>
        <SettingsDialogHeader title="Series Settings" onClose={onClose} />
        <div className={styles.content}>
          <div className={styles.twoColumn}>
            <section className={styles.section}>
              <Heading tagName="h3" styleAs="h6" spacing={3}>
                Series title
              </Heading>
              <SeriesTitleSection
                settings={seriesSettings}
                defaultTitle={defaultTitle}
                defaultSubtitle={defaultSubtitle}
                onChange={onSeriesSettingsChange}
              />
            </section>
            <section className={styles.section}>
              <Heading tagName="h3" styleAs="h6" spacing={3}>
                View Mode
              </Heading>
              <div className={styles.viewModeButtonsContainer}>
                <ViewModeButton
                  label="Narrow View"
                  description="Narrower container width"
                  isSelected={viewMode === "standard"}
                  onClick={(): void => {
                    onViewModeSelect("standard");
                  }}
                />
                <ViewModeButton
                  label="Wide View"
                  description="Full width container (default)"
                  isSelected={viewMode === "wide"}
                  onClick={(): void => {
                    onViewModeSelect("wide");
                  }}
                />
              </div>
            </section>
          </div>
        </div>
      </div>
    </SettingsDialogFrame>
  );
}
