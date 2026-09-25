import type { ReactElement } from "react";
import { Alert } from "../alert/alert";
import { Button } from "../button/button";
import { Checkbox } from "../checkbox/checkbox";
import { Heading } from "../heading/heading";
import type { OverlayUrlsSectionProps, OverlayUrlsViewModel } from "./types";
import styles from "./overlay-urls.module.css";

export interface OverlayUrlsViewProps
  extends Omit<OverlayUrlsSectionProps, "previewColorMode">, OverlayUrlsViewModel {
  readonly onCopy: (target: "view" | "overlay", url: string) => void;
  readonly onOpen: (url: string) => void;
}

export function OverlayUrlsSection({
  gamertag,
  autoStart,
  disabled = false,
  settingsDisabled = false,
  errorMessage = null,
  loading = false,
  onAutoStartChange,
  viewUrl,
  overlayUrl,
  previewOverlayUrl,
  copyOverlayLabel,
  copyViewerLabel,
  copyTarget,
  onCopy,
  onOpen,
}: OverlayUrlsViewProps): ReactElement {
  return (
    <div className={styles.panel}>
      {loading ? (
        <Alert variant="info">Checking your session…</Alert>
      ) : errorMessage !== null ? (
        <Alert variant="error">{errorMessage}</Alert>
      ) : gamertag === null ? (
        <Alert variant="warning">
          No active Xbox identity is linked. Link an Xbox account to generate shareable URLs.
        </Alert>
      ) : (
        <div className={styles.urlList}>
          <div className={styles.card}>
            <Heading tagName="h3">Overlay URL</Heading>
            <p className={styles.cardDescription}>
              In your overlay software, such as OBS, add a Browser Source and use the URL below.
            </p>
            <p className={styles.urlText}>{overlayUrl}</p>
            <div className={styles.buttonRow}>
              <Button
                variant="secondary"
                size="small"
                ariaLabel={copyOverlayLabel}
                disabled={disabled}
                onClick={(): void => {
                  onCopy("overlay", overlayUrl);
                }}
              >
                {copyTarget === "overlay" ? "Copied!" : "Copy"}
              </Button>
              <Button
                variant="secondary"
                size="small"
                disabled={disabled}
                onClick={(): void => {
                  onOpen(overlayUrl);
                }}
              >
                Open overlay
              </Button>
              <Button
                variant="secondary"
                size="small"
                disabled={disabled || settingsDisabled}
                onClick={(): void => {
                  onOpen(previewOverlayUrl);
                }}
              >
                Open overlay with preview
              </Button>
            </div>

            <hr className={styles.sectionDivider} />

            <Heading tagName="h3">Viewer URL</Heading>
            <p className={styles.cardDescription}>
              Share this with viewers to follow the active tracker showing stats of games and series you play.
            </p>
            <p className={styles.urlText}>{viewUrl}</p>
            <div className={styles.buttonRow}>
              <Button
                variant="secondary"
                size="small"
                ariaLabel={copyViewerLabel}
                disabled={disabled}
                onClick={(): void => {
                  onCopy("view", viewUrl);
                }}
              >
                {copyTarget === "view" ? "Copied!" : "Copy"}
              </Button>
              <Button
                variant="secondary"
                size="small"
                disabled={disabled}
                onClick={(): void => {
                  onOpen(viewUrl);
                }}
              >
                Open viewer
              </Button>
            </div>

            <hr className={styles.sectionDivider} />

            <Checkbox
              checked={autoStart}
              disabled={disabled || settingsDisabled}
              onChange={(checked): void => {
                onAutoStartChange(checked);
              }}
              label="Automatically start tracking when the overlay is used"
              description="When this option is enabled, your individual tracker will start automatically whenever the overlay is used. Otherwise, you can start it manually via the Individual Tracker page from the Profile icon."
            />
          </div>
        </div>
      )}
    </div>
  );
}
