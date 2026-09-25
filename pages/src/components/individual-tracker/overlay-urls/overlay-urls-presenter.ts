import { buildIndividualTrackerPublicOverlayPath, buildIndividualTrackerPublicViewPath } from "../routes";
import type { OverlayUrlsSectionProps } from "./types";
import type { OverlayUrlsCopyTarget, OverlayUrlsSnapshot, OverlayUrlsStore } from "./overlay-urls-store";

export interface OverlayUrlsViewModel {
  readonly viewUrl: string;
  readonly overlayUrl: string;
  readonly overlayOpenUrl: string;
  readonly previewOverlayUrl: string;
  readonly copyOverlayLabel: string;
  readonly copyViewerLabel: string;
  readonly copyTarget: OverlayUrlsCopyTarget;
}

interface Config {
  readonly store: OverlayUrlsStore;
}

export class OverlayUrlsPresenter {
  private readonly config: Config;
  private copyTimer: ReturnType<typeof setTimeout> | null = null;

  public constructor(config: Config) {
    this.config = config;
  }

  public present(
    props: Pick<OverlayUrlsSectionProps, "gamertag" | "previewColorMode" | "isDemo">,
    snapshot: OverlayUrlsSnapshot,
  ): OverlayUrlsViewModel {
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    const viewUrl = props.gamertag === null ? "" : `${origin}${buildIndividualTrackerPublicViewPath(props.gamertag)}`;
    const overlayUrl = props.gamertag === null ? "" : `${origin}${buildIndividualTrackerPublicOverlayPath(props.gamertag)}`;
    const previewOverlayUrl = this.buildPreviewUrl(overlayUrl, props.previewColorMode);
    const overlayOpenUrl = props.isDemo ? previewOverlayUrl : overlayUrl;

    return {
      viewUrl,
      overlayUrl: props.isDemo ? overlayOpenUrl : overlayUrl,
      overlayOpenUrl,
      previewOverlayUrl,
      copyOverlayLabel: snapshot.copyTarget === "overlay" ? "Copied overlay URL" : "Copy overlay URL",
      copyViewerLabel: snapshot.copyTarget === "view" ? "Copied viewer URL" : "Copy viewer URL",
      copyTarget: snapshot.copyTarget,
    };
  }

  public copy(target: Exclude<OverlayUrlsCopyTarget, "idle">, url: string): void {
    void this.copyAsync(target, url);
  }

  public open(url: string): void {
    if (typeof window !== "undefined") {
      window.open(url, "_blank");
    }
  }

  public dispose(): void {
    if (this.copyTimer !== null) {
      clearTimeout(this.copyTimer);
      this.copyTimer = null;
    }
  }

  private buildPreviewUrl(overlayUrl: string, previewMode: OverlayUrlsSectionProps["previewColorMode"]): string {
    const url = new URL(overlayUrl, typeof window === "undefined" ? "http://localhost" : window.location.origin);
    url.searchParams.set("preview", "1");
    url.searchParams.set("previewMode", previewMode);
    return url.toString();
  }

  private async copyAsync(target: Exclude<OverlayUrlsCopyTarget, "idle">, url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      return;
    }

    this.config.store.update({ copyTarget: target });
    if (this.copyTimer !== null) {
      clearTimeout(this.copyTimer);
    }
    this.copyTimer = setTimeout(() => {
      this.copyTimer = null;
      this.config.store.update({ copyTarget: "idle" });
    }, 1500);
  }
}
