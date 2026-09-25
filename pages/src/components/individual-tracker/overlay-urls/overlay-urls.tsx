import React, { useEffect, useRef, useState } from "react";
import { Alert } from "../../alert/alert";
import { Button } from "../../button/button";
import { Checkbox } from "../../checkbox/checkbox";
import { Heading } from "../../heading/heading";
import { buildIndividualTrackerPublicOverlayPath, buildIndividualTrackerPublicViewPath } from "../routes";
import type { OverlayUrlsSectionProps } from "./types";
import styles from "./overlay-urls.module.css";

type CopyTarget = "idle" | "view" | "overlay";

interface StreamerUrls {
  readonly viewUrl: string;
  readonly overlayUrl: string;
}

function buildStreamerUrls(gamertag: string): StreamerUrls {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return {
    viewUrl: `${origin}${buildIndividualTrackerPublicViewPath(gamertag)}`,
    overlayUrl: `${origin}${buildIndividualTrackerPublicOverlayPath(gamertag)}`,
  };
}

function buildOverlayPreviewUrl(overlayUrl: string, previewMode: OverlayUrlsSectionProps["previewColorMode"]): string {
  const url = new URL(overlayUrl, typeof window === "undefined" ? "http://localhost" : window.location.origin);
  url.searchParams.set("preview", "1");
  url.searchParams.set("previewMode", previewMode);
  return url.toString();
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function OverlayUrlsSection({
  gamertag,
  previewColorMode,
  autoStart,
  disabled = false,
  errorMessage = null,
  isDemo = false,
  onAutoStartChange,
}: OverlayUrlsSectionProps): React.ReactElement {
  const [copyTarget, setCopyTarget] = useState<CopyTarget>("idle");
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return (): void => {
      if (copyTimerRef.current !== null) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const urls = gamertag !== null ? buildStreamerUrls(gamertag) : null;
  const overlayUrl = urls === null ? null : buildOverlayPreviewUrl(urls.overlayUrl, previewColorMode);

  const handleCopy = (target: "view" | "overlay", url: string): void => {
    async function copyAndSetStatus(): Promise<void> {
      const ok = await copyToClipboard(url);
      if (!ok) {
        return;
      }
      setCopyTarget(target);
      if (copyTimerRef.current !== null) {
        clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = setTimeout(() => {
        copyTimerRef.current = null;
        setCopyTarget("idle");
      }, 1500);
    }

    void copyAndSetStatus();
  };

  const handleOpenUrl = (url: string): void => {
    if (typeof window !== "undefined") {
      window.open(url, "_blank");
    }
  };

  return (
    <div className={styles.panel}>
      {errorMessage !== null ? (
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
            <p className={styles.urlText}>{isDemo ? overlayUrl : urls?.overlayUrl}</p>
            <div className={styles.buttonRow}>
              <Button
                variant="secondary"
                size="small"
                ariaLabel={copyTarget === "overlay" ? "Copied overlay URL" : "Copy overlay URL"}
                onClick={(): void => {
                  handleCopy("overlay", isDemo ? (overlayUrl ?? "") : (urls?.overlayUrl ?? ""));
                }}
              >
                {copyTarget === "overlay" ? "Copied!" : "Copy"}
              </Button>
              <Button
                variant="secondary"
                size="small"
                onClick={(): void => {
                  handleOpenUrl(isDemo ? (overlayUrl ?? "") : (urls?.overlayUrl ?? ""));
                }}
              >
                Open overlay
              </Button>
              <Button
                variant="secondary"
                size="small"
                disabled={disabled}
                onClick={(): void => {
                  handleOpenUrl(buildOverlayPreviewUrl(urls?.overlayUrl ?? "", previewColorMode));
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
            <p className={styles.urlText}>{urls?.viewUrl}</p>
            <div className={styles.buttonRow}>
              <Button
                variant="secondary"
                size="small"
                ariaLabel={copyTarget === "view" ? "Copied viewer URL" : "Copy viewer URL"}
                onClick={(): void => {
                  handleCopy("view", urls?.viewUrl ?? "");
                }}
              >
                {copyTarget === "view" ? "Copied!" : "Copy"}
              </Button>
              <Button
                variant="secondary"
                size="small"
                onClick={(): void => {
                  handleOpenUrl(urls?.viewUrl ?? "");
                }}
              >
                Open viewer
              </Button>
            </div>

            <hr className={styles.sectionDivider} />

            <Checkbox
              checked={autoStart}
              disabled={disabled}
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
