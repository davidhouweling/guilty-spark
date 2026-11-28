import { useState } from "react";
import type { ReactElement } from "react";
import { Button } from "../button/button";
import type { AllStreamerSettings } from "../live-tracker/settings/types";
import { buildArchiveOverlayUrl } from "./archive-overlay-url";

interface ArchiveOverlayUrlButtonProps {
  readonly settings: AllStreamerSettings;
  readonly stableTeamSlotsAvailable: boolean;
}

export function ArchiveOverlayUrlButton({
  settings,
  stableTeamSlotsAvailable,
}: ArchiveOverlayUrlButtonProps): ReactElement {
  const [copied, setCopied] = useState(false);

  const copyUrlAsync = async (): Promise<void> => {
    const url = buildArchiveOverlayUrl(window.location.href, settings, stableTeamSlotsAvailable);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      console.error("Failed to copy archive overlay URL:", error);
    }
  };

  return (
    <Button
      onClick={(): void => {
        void copyUrlAsync();
      }}
      disabled={copied}
      variant="primary"
    >
      {copied ? "Copied!" : "Copy URL for OBS"}
    </Button>
  );
}
