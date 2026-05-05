import React, { useMemo, useState } from "react";
import { Alert } from "../../alert/alert";
import { Button } from "../../button/button";
import { Input } from "../../input/input";
import styles from "./streamer-connections.module.css";

interface StreamerConnectionsSectionViewProps {
  readonly xboxXuid: string | null;
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

export function StreamerConnectionsSectionView({ xboxXuid }: StreamerConnectionsSectionViewProps): React.ReactElement {
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
                  void copyToClipboard("overlay", urls.overlayUrl);
                }}
              >
                {copyState === "overlay" ? "Copied!" : "Copy"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <Alert variant="info">Twitch automation and advanced overlay presets remain in the next Phase 4 slice.</Alert>
    </div>
  );
}
