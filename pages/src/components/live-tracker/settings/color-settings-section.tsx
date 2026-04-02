import React from "react";
import { HALO_TEAM_COLORS, getTeamColor } from "../../team-colors/team-colors";
import { TeamColorPicker } from "../../team-colors/team-color-picker";
import type { ColorMode } from "./types";
import styles from "./color-settings-section.module.css";

interface ColorSettingsSectionProps {
  readonly mode: ColorMode;
  readonly playerView: {
    readonly selectedPlayerId: string | null;
    readonly teamColor: string;
    readonly enemyColor: string;
  };
  readonly observerView: {
    readonly eagleColor: string;
    readonly cobraColor: string;
  };
  readonly onModeChange: (mode: ColorMode) => void;
  readonly onPlayerViewChange: (updates: Partial<ColorSettingsSectionProps["playerView"]>) => void;
  readonly onObserverViewChange: (updates: Partial<ColorSettingsSectionProps["observerView"]>) => void;
  readonly availablePlayers?: readonly { id: string; name: string }[];
}

export function ColorSettingsSection({
  mode,
  playerView,
  observerView,
  onModeChange,
  onPlayerViewChange,
  onObserverViewChange,
  availablePlayers = [],
}: ColorSettingsSectionProps): React.ReactElement {
  const teamColorObj = getTeamColor(playerView.teamColor) ?? HALO_TEAM_COLORS[1];
  const enemyColorObj = getTeamColor(playerView.enemyColor) ?? HALO_TEAM_COLORS[0];
  const eagleColorObj = getTeamColor(observerView.eagleColor) ?? HALO_TEAM_COLORS[0];
  const cobraColorObj = getTeamColor(observerView.cobraColor) ?? HALO_TEAM_COLORS[1];

  return (
    <div className={styles.container}>
      {/* Mode Toggle */}
      <div className={styles.modeToggle}>
        <button
          type="button"
          className={`${styles.modeButton} ${mode === "player" ? styles.active : ""}`}
          onClick={(): void => {
            onModeChange("player");
          }}
        >
          Player View
        </button>
        <button
          type="button"
          className={`${styles.modeButton} ${mode === "observer" ? styles.active : ""}`}
          onClick={(): void => {
            onModeChange("observer");
          }}
        >
          Observer View
        </button>
      </div>

      {/* Player View Settings */}
      {mode === "player" && (
        <div className={styles.viewSettings}>
          <p className={styles.description}>
            Select your player to automatically match your team colors and enemy colors.
          </p>

          {/* Player Selection */}
          {availablePlayers.length > 0 && (
            <div className={styles.field}>
              <label htmlFor="player-select" className={styles.fieldLabel}>
                Select Your Player
              </label>
              <select
                id="player-select"
                className={styles.select}
                value={playerView.selectedPlayerId ?? ""}
                onChange={(e): void => {
                  onPlayerViewChange({ selectedPlayerId: e.target.value || null });
                }}
              >
                <option value="">Choose a player...</option>
                {availablePlayers.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Team Colors Grid */}
          <div className={styles.colorFieldsGrid}>
            {/* Team Color */}
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Your Team Color</label>
              <TeamColorPicker
                selectedColor={teamColorObj}
                onColorSelect={(colorId): void => {
                  onPlayerViewChange({ teamColor: colorId });
                }}
                label="Your Team Color"
              />
            </div>

            {/* Enemy Color */}
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Enemy Team Color</label>
              <TeamColorPicker
                selectedColor={enemyColorObj}
                onColorSelect={(colorId): void => {
                  onPlayerViewChange({ enemyColor: colorId });
                }}
                label="Enemy Team Color"
              />
            </div>
          </div>
        </div>
      )}

      {/* Observer View Settings */}
      {mode === "observer" && (
        <div className={styles.viewSettings}>
          {/* Team Colors Grid */}
          <div className={styles.colorFieldsGrid}>
            {/* Eagle Color */}
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Eagle Team Color</label>
              <TeamColorPicker
                selectedColor={eagleColorObj}
                onColorSelect={(colorId): void => {
                  onObserverViewChange({ eagleColor: colorId });
                }}
                label="Eagle Team Color"
              />
            </div>

            {/* Cobra Color */}
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Cobra Team Color</label>
              <TeamColorPicker
                selectedColor={cobraColorObj}
                onColorSelect={(colorId): void => {
                  onObserverViewChange({ cobraColor: colorId });
                }}
                label="Cobra Team Color"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
