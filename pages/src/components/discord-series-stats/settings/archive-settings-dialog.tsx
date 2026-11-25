import type { ReactElement } from "react";
import { Dialog } from "../../dialog/dialog";
import { Heading } from "../../heading/heading";
import { Checkbox } from "../../checkbox/checkbox";
import { SeriesTitleSection } from "../../live-tracker/settings/series-title-section";
import { SeriesTeamNameInputs } from "../../live-tracker/settings/series-team-name-inputs";
import { ObserverColorSettings } from "../../live-tracker/settings/observer-color-settings";
import { ViewModeButton } from "../../live-tracker/settings/view-mode-button";
import type {
  AllStreamerSettings,
  ObserverViewColorSettings,
  SeriesStreamerSettings,
} from "../../live-tracker/settings/types";
import type { ViewMode } from "../../view-mode/view-mode-selector";
import { ArchiveOverlayUrlButton } from "../archive-overlay-url-button";
import styles from "../../live-tracker/settings/settings-dialog.module.css";
import teamStyles from "../../live-tracker/settings/series-team-section.module.css";

interface ArchiveSettingsDialogProps {
  readonly viewMode: ViewMode;
  readonly streamerSettings: AllStreamerSettings;
  readonly seriesSettings: SeriesStreamerSettings;
  readonly observerColors: ObserverViewColorSettings;
  readonly colorLabels: { readonly first: string; readonly second: string } | null;
  readonly defaultTitle: string | null;
  readonly defaultSubtitle: string | null;
  readonly onClose: () => void;
  readonly onSeriesSettingsChange: (updates: Partial<SeriesStreamerSettings>) => void;
  readonly onObserverColorsChange: (updates: Partial<ObserverViewColorSettings>) => void;
  readonly onViewPreviewChange: (enabled: boolean) => void;
  readonly onViewModeSelect: (mode: ViewMode) => void;
}

export function ArchiveSettingsDialog({
  viewMode,
  streamerSettings,
  seriesSettings,
  observerColors,
  colorLabels,
  defaultTitle,
  defaultSubtitle,
  onClose,
  onSeriesSettingsChange,
  onObserverColorsChange,
  onViewPreviewChange,
  onViewModeSelect,
}: ArchiveSettingsDialogProps): ReactElement {
  return (
    <Dialog open title="Series Settings" onClose={onClose}>
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
          <section className={styles.section}>
            <Heading tagName="h3" styleAs="h6" spacing={3}>
              Team Names
            </Heading>
            {colorLabels != null ? (
              <div className={teamStyles.container}>
                <SeriesTeamNameInputs
                  settings={seriesSettings}
                  onChange={onSeriesSettingsChange}
                  description="These names apply to overview cards and match Timeline labels."
                />
              </div>
            ) : (
              <p>Team names cannot be customized because stable series teams are unavailable.</p>
            )}
          </section>
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
            <ViewModeButton
              label="Streamer Overlay"
              description="OBS transparent mode"
              isSelected={viewMode === "streamer"}
              onClick={(): void => {
                onViewModeSelect("streamer");
              }}
            />
            <Checkbox
              label="Preview overlay background"
              description="Show an in-game observer background in streamer view."
              checked={streamerSettings.global.viewPreview}
              onChange={onViewPreviewChange}
            />
          </div>
          <section className={styles.section}>
            <Heading tagName="h3" styleAs="h6" spacing={3}>
              Share Settings
            </Heading>
            <p>Copy URL with all current settings for OBS Browser Source</p>
            <ArchiveOverlayUrlButton settings={streamerSettings} stableTeamSlotsAvailable={colorLabels != null} />
          </section>
          <section className={styles.section}>
            <Heading tagName="h3" styleAs="h6" spacing={3}>
              Team Colors
            </Heading>
            {colorLabels != null ? (
              <>
                <p>Archived series use observer colors in stable series-team order.</p>
                <ObserverColorSettings
                  settings={observerColors}
                  firstLabel={colorLabels.first}
                  secondLabel={colorLabels.second}
                  onChange={onObserverColorsChange}
                />
              </>
            ) : (
              <p>Team colors cannot be customized because stable series teams are unavailable.</p>
            )}
          </section>
        </section>
      </div>
    </Dialog>
  );
}
