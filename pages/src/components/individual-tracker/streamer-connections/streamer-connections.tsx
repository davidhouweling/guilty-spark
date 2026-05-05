import React, { useMemo, useState } from "react";
import { Alert } from "../../alert/alert";
import { Button } from "../../button/button";
import { Input } from "../../input/input";
import styles from "./streamer-connections.module.css";

interface StreamerConnectionsSectionViewProps {
  readonly xboxXuid: string | null;
  readonly activeTrackerId: string | null;
  readonly activeTrackerGamertag: string | null;
  readonly defaultColorMode: "player" | "observer";
  readonly showTabs: boolean;
  readonly showTicker: boolean;
  readonly showTeamDetails: boolean;
  readonly observerOverrideTeamColor: string | null;
  readonly observerOverrideEnemyColor: string | null;
  readonly saving: boolean;
  readonly errorMessage: string | null;
  readonly onPresentationSettingsChange: (settings: {
    defaultColorMode: "player" | "observer";
    showTabs: boolean;
    showTicker: boolean;
    showTeamDetails: boolean;
  }) => void;
  readonly onObserverOverrideChange: (settings: {
    teamColor: string;
    enemyColor: string;
  }) => void;
  readonly onOpenView?: (xuid: string) => void;
  readonly onOpenOverlay?: (xuid: string) => void;
}

interface StreamerUrls {
  readonly viewUrl: string;
  readonly overlayUrl: string;
}

function buildStreamerUrls(xboxXuid: string): StreamerUrls {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return {
    viewUrl: `${origin}/individual-tracker/${encodeURIComponent(xboxXuid)}/view`,
    overlayUrl: `${origin}/individual-tracker/${encodeURIComponent(xboxXuid)}/overlay`,
  };
}

export function StreamerConnectionsSectionView({
  xboxXuid,
  activeTrackerId,
  activeTrackerGamertag,
  defaultColorMode,
  showTabs,
  showTicker,
  showTeamDetails,
  observerOverrideTeamColor,
  observerOverrideEnemyColor,
  saving,
  errorMessage,
  onPresentationSettingsChange,
  onObserverOverrideChange,
  onOpenView,
  onOpenOverlay,
}: StreamerConnectionsSectionViewProps): React.ReactElement {
  const [copyState, setCopyState] = useState<"idle" | "view" | "overlay">("idle");
  const urls = useMemo(() => (xboxXuid == null ? null : buildStreamerUrls(xboxXuid)), [xboxXuid]);

  const copyToClipboard = async (kind: "view" | "overlay", value: string): Promise<void> => {
    if (typeof navigator === "undefined" || navigator.clipboard == null) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopyState(kind);
      setTimeout(() => {
        setCopyState("idle");
      }, 1500);
    } catch {
      setCopyState("idle");
    }
  };

  return (
    <div className={styles.panel}>
      <h2 className={styles.sectionTitle}>Streamer Settings</h2>
      <p className={styles.sectionDescription}>
        Configure the stable public URLs for your active tracker viewer and OBS overlay. These routes follow whichever
        tracker is currently marked live.
      </p>

      {urls == null ? (
        <Alert variant="warning">No active Xbox identity is linked. Link an Xbox account to generate shareable URLs.</Alert>
      ) : (
        <div className={styles.urlList}>
          <div className={styles.urlCard}>
            <h3 className={styles.cardTitle}>Viewer URL</h3>
            <p className={styles.cardDescription}>Share this with viewers to follow the active tracker.</p>
            <div className={styles.urlRow}>
              <Input label="Viewer URL" value={urls.viewUrl} onChange={(): void => {}} disabled={true} />
              <Button
                onClick={(): void => {
                  if (xboxXuid != null) {
                    onOpenView?.(xboxXuid);
                  }
                }}
              >
                Open viewer
              </Button>
              <Button
                onClick={(): void => {
                  void copyToClipboard("view", urls.viewUrl);
                }}
              >
                {copyState === "view" ? "Copied!" : "Copy"}
              </Button>
            </div>
          </div>

          <div className={styles.urlCard}>
            <h3 className={styles.cardTitle}>Overlay URL</h3>
            <p className={styles.cardDescription}>Use this in OBS as a Browser Source.</p>
            <div className={styles.urlRow}>
              <Input label="Overlay URL" value={urls.overlayUrl} onChange={(): void => {}} disabled={true} />
              <Button
                onClick={(): void => {
                  if (xboxXuid != null) {
                    onOpenOverlay?.(xboxXuid);
                  }
                }}
              >
                Open overlay
              </Button>
              <Button
                onClick={(): void => {
                  void copyToClipboard("overlay", urls.overlayUrl);
                }}
              >
                {copyState === "overlay" ? "Copied!" : "Copy"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.preferencesCard}>
        <h3 className={styles.cardTitle}>Presentation defaults</h3>
        <p className={styles.cardDescription}>Choose how the public view and overlay should render by default.</p>

        <label className={styles.preferenceLabel} htmlFor="default-color-mode-select">
          Default color mode
        </label>
        <select
          id="default-color-mode-select"
          className={styles.selectInput}
          value={defaultColorMode}
          disabled={saving}
          onChange={(event): void => {
            onPresentationSettingsChange({
              defaultColorMode: event.currentTarget.value === "player" ? "player" : "observer",
              showTabs,
              showTicker,
              showTeamDetails,
            });
          }}
        >
          <option value="observer">Observer</option>
          <option value="player">Player</option>
        </select>

        <label className={styles.toggleRow}>
          <input
            type="checkbox"
            checked={showTabs}
            disabled={saving}
            onChange={(event): void => {
              onPresentationSettingsChange({
                defaultColorMode,
                showTabs: event.currentTarget.checked,
                showTicker,
                showTeamDetails,
              });
            }}
          />
          <span>Show overlay tabs</span>
        </label>

        <label className={styles.toggleRow}>
          <input
            type="checkbox"
            checked={showTicker}
            disabled={saving}
            onChange={(event): void => {
              onPresentationSettingsChange({
                defaultColorMode,
                showTabs,
                showTicker: event.currentTarget.checked,
                showTeamDetails,
              });
            }}
          />
          <span>Show overlay ticker</span>
        </label>

        <label className={styles.toggleRow}>
          <input
            type="checkbox"
            checked={showTeamDetails}
            disabled={saving}
            onChange={(event): void => {
              onPresentationSettingsChange({
                defaultColorMode,
                showTabs,
                showTicker,
                showTeamDetails: event.currentTarget.checked,
              });
            }}
          />
          <span>Show team details</span>
        </label>

        {saving ? <Alert variant="info">Saving streamer settings...</Alert> : null}
        {errorMessage != null ? <Alert variant="error">{errorMessage}</Alert> : null}
      </div>

      <div className={styles.preferencesCard}>
        <h3 className={styles.cardTitle}>Observer overrides</h3>
        {activeTrackerId == null ? (
          <p className={styles.cardDescription}>Start or set a live tracker to configure per-tracker observer colors.</p>
        ) : (
          <>
            <p className={styles.cardDescription}>
              Override observer colors for {activeTrackerGamertag ?? "active tracker"}.
            </p>
            <Input
              label="Observer team color"
              value={observerOverrideTeamColor ?? ""}
              disabled={saving}
              onChange={(event): void => {
                onObserverOverrideChange({
                  teamColor: event.currentTarget.value,
                  enemyColor: observerOverrideEnemyColor ?? "",
                });
              }}
            />
            <Input
              label="Observer enemy color"
              value={observerOverrideEnemyColor ?? ""}
              disabled={saving}
              onChange={(event): void => {
                onObserverOverrideChange({
                  teamColor: observerOverrideTeamColor ?? "",
                  enemyColor: event.currentTarget.value,
                });
              }}
            />
          </>
        )}
      </div>

      <Alert variant="info">Twitch automation and advanced overlay presets remain in the next Phase 4 slice.</Alert>
    </div>
  );
}
