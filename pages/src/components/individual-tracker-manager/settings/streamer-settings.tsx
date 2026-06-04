import React, { useCallback, useState } from "react";
import type {
  StreamerViewColorMode,
  StreamerViewSettings,
} from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import { Button } from "../../button/button";
import { Checkbox } from "../../checkbox/checkbox";
import { getTeamColorOrDefault } from "../../team-colors/team-colors";
import { TeamColorPicker } from "../../team-colors/team-color-picker";
import styles from "./streamer-settings.module.css";

interface StreamerSettingsProps {
  readonly settings: StreamerViewSettings;
  readonly saving: boolean;
  readonly errorMessage: string | null;
  readonly onSave: (settings: StreamerViewSettings) => void;
}

interface FormState {
  readonly colorMode: StreamerViewColorMode;
  readonly playerTeamColor: string;
  readonly playerEnemyColor: string;
  readonly observerTeamColor: string;
  readonly observerEnemyColor: string;
  readonly showTabs: boolean;
  readonly showTicker: boolean;
  readonly showTeamDetails: boolean;
  readonly showTitle: boolean;
  readonly showSubtitle: boolean;
  readonly showScore: boolean;
}

function initialFormState(settings: StreamerViewSettings): FormState {
  const styleFlags = settings.styleFlags ?? {};
  const visibleSections = settings.visibleSections ?? {};
  return {
    colorMode: styleFlags.colorMode ?? "player",
    playerTeamColor: styleFlags.playerTeamColor ?? styleFlags.teamColor ?? getTeamColorOrDefault(undefined, 0).id,
    playerEnemyColor: styleFlags.playerEnemyColor ?? styleFlags.enemyColor ?? getTeamColorOrDefault(undefined, 1).id,
    observerTeamColor: styleFlags.observerTeamColor ?? styleFlags.teamColor ?? getTeamColorOrDefault(undefined, 0).id,
    observerEnemyColor:
      styleFlags.observerEnemyColor ?? styleFlags.enemyColor ?? getTeamColorOrDefault(undefined, 1).id,
    showTabs: visibleSections.showTabs ?? true,
    showTicker: visibleSections.showTicker ?? true,
    showTeamDetails: visibleSections.showTeamDetails ?? false,
    showTitle: visibleSections.showTitle ?? true,
    showSubtitle: visibleSections.showSubtitle ?? true,
    showScore: visibleSections.showScore ?? true,
  };
}

export function StreamerSettings({
  settings,
  saving,
  errorMessage,
  onSave,
}: StreamerSettingsProps): React.ReactElement {
  const [form, setForm] = useState<FormState>(() => initialFormState(settings));

  const handleColorModeChange = useCallback((mode: StreamerViewColorMode) => {
    setForm((prev) => ({ ...prev, colorMode: mode }));
  }, []);

  const handlePlayerTeamColorChange = useCallback((colorId: string) => {
    setForm((prev) => ({ ...prev, playerTeamColor: colorId }));
  }, []);

  const handlePlayerEnemyColorChange = useCallback((colorId: string) => {
    setForm((prev) => ({ ...prev, playerEnemyColor: colorId }));
  }, []);

  const handleObserverTeamColorChange = useCallback((colorId: string) => {
    setForm((prev) => ({ ...prev, observerTeamColor: colorId }));
  }, []);

  const handleObserverEnemyColorChange = useCallback((colorId: string) => {
    setForm((prev) => ({ ...prev, observerEnemyColor: colorId }));
  }, []);

  const handleShowTabsChange = useCallback((checked: boolean) => {
    setForm((prev) => ({ ...prev, showTabs: checked }));
  }, []);

  const handleShowTickerChange = useCallback((checked: boolean) => {
    setForm((prev) => ({ ...prev, showTicker: checked }));
  }, []);

  const handleShowTeamDetailsChange = useCallback((checked: boolean) => {
    setForm((prev) => ({ ...prev, showTeamDetails: checked }));
  }, []);

  const handleShowTitleChange = useCallback((checked: boolean) => {
    setForm((prev) => ({ ...prev, showTitle: checked }));
  }, []);

  const handleShowSubtitleChange = useCallback((checked: boolean) => {
    setForm((prev) => ({ ...prev, showSubtitle: checked }));
  }, []);

  const handleShowScoreChange = useCallback((checked: boolean) => {
    setForm((prev) => ({ ...prev, showScore: checked }));
  }, []);

  const handleSubmit = useCallback(
    (event: React.SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();
      const newSettings: StreamerViewSettings = {
        ...settings,
        styleFlags: {
          ...settings.styleFlags,
          colorMode: form.colorMode,
          playerTeamColor: form.playerTeamColor,
          playerEnemyColor: form.playerEnemyColor,
          observerTeamColor: form.observerTeamColor,
          observerEnemyColor: form.observerEnemyColor,
        },
        visibleSections: {
          ...settings.visibleSections,
          showTabs: form.showTabs,
          showTicker: form.showTicker,
          showTeamDetails: form.showTeamDetails,
          showTitle: form.showTitle,
          showSubtitle: form.showSubtitle,
          showScore: form.showScore,
        },
      };
      onSave(newSettings);
    },
    [settings, form, onSave],
  );

  const playerTeamColor = getTeamColorOrDefault(form.playerTeamColor, 0);
  const playerEnemyColor = getTeamColorOrDefault(form.playerEnemyColor, 1);
  const observerTeamColor = getTeamColorOrDefault(form.observerTeamColor, 0);
  const observerEnemyColor = getTeamColorOrDefault(form.observerEnemyColor, 1);

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Colour Mode</h3>
        <div className={styles.radioGroup} role="radiogroup" aria-label="Colour mode">
          <label className={styles.radioOption}>
            <input
              type="radio"
              className={styles.radioInput}
              name="colorMode"
              value="player"
              checked={form.colorMode === "player"}
              onChange={() => {
                handleColorModeChange("player");
              }}
            />
            <span className={styles.radioLabel}>Player — overlay reflects the tracked player&apos;s team</span>
          </label>
          <label className={styles.radioOption}>
            <input
              type="radio"
              className={styles.radioInput}
              name="colorMode"
              value="observer"
              checked={form.colorMode === "observer"}
              onChange={() => {
                handleColorModeChange("observer");
              }}
            />
            <span className={styles.radioLabel}>
              Observer — overlay uses fixed team colours regardless of who is tracked
            </span>
          </label>
        </div>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Player Colours</h3>
        <div className={styles.colorPickerRow}>
          <span className={styles.colorPickerLabel}>Your team colour</span>
          <TeamColorPicker
            label="Your team colour"
            selectedColor={playerTeamColor}
            onColorSelect={handlePlayerTeamColorChange}
          />
        </div>
        <div className={styles.colorPickerRow}>
          <span className={styles.colorPickerLabel}>Enemy colour</span>
          <TeamColorPicker
            label="Enemy colour"
            selectedColor={playerEnemyColor}
            onColorSelect={handlePlayerEnemyColorChange}
          />
        </div>
      </div>

      {form.colorMode === "observer" && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Observer Colours</h3>
          <div className={styles.colorPickerRow}>
            <span className={styles.colorPickerLabel}>Observer team colour</span>
            <TeamColorPicker
              label="Observer team colour"
              selectedColor={observerTeamColor}
              onColorSelect={handleObserverTeamColorChange}
            />
          </div>
          <div className={styles.colorPickerRow}>
            <span className={styles.colorPickerLabel}>Observer enemy colour</span>
            <TeamColorPicker
              label="Observer enemy colour"
              selectedColor={observerEnemyColor}
              onColorSelect={handleObserverEnemyColorChange}
            />
          </div>
        </div>
      )}

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Visible Sections</h3>
        <div className={styles.checkboxList}>
          <Checkbox label="Show tabs" checked={form.showTabs} onChange={handleShowTabsChange} />
          <Checkbox label="Show ticker" checked={form.showTicker} onChange={handleShowTickerChange} />
          <Checkbox label="Show team details" checked={form.showTeamDetails} onChange={handleShowTeamDetailsChange} />
          <Checkbox label="Show title" checked={form.showTitle} onChange={handleShowTitleChange} />
          <Checkbox label="Show subtitle" checked={form.showSubtitle} onChange={handleShowSubtitleChange} />
          <Checkbox label="Show score" checked={form.showScore} onChange={handleShowScoreChange} />
        </div>
      </div>

      <div className={styles.actions}>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        {errorMessage !== null && <p className={styles.errorMessage}>{errorMessage}</p>}
      </div>
    </form>
  );
}
