import React, { memo } from "react";
import type { TeamColor } from "../team-colors/team-colors";
import { InformationTicker, type TickerMatchGroup } from "../information-ticker/information-ticker";
import styles from "./streamer-overlay.module.css";

interface BottomSectionProps {
  readonly showTabs: boolean;
  readonly showTicker: boolean;
  readonly showPreSeriesInfo: boolean;
  readonly matchesLength: number;
  readonly currentMatchGroup: TickerMatchGroup | undefined;
  readonly teamColors: TeamColor[];
  readonly tabsBarSlot: React.ReactNode;
  readonly onScrollComplete: () => void;
}

function BottomSectionComponent({
  showTabs,
  showTicker,
  showPreSeriesInfo,
  matchesLength,
  currentMatchGroup,
  teamColors,
  tabsBarSlot,
  onScrollComplete,
}: BottomSectionProps): React.ReactElement | null {
  if (!showTabs && !showTicker) {
    return null;
  }

  return (
    <div className={styles.bottomSection}>
      {showTabs && tabsBarSlot}

      {showTicker && currentMatchGroup != null && (
        <InformationTicker
          currentMatchGroup={currentMatchGroup}
          teamColors={teamColors}
          onScrollComplete={onScrollComplete}
        />
      )}

      {showTicker && currentMatchGroup == null && !showPreSeriesInfo && matchesLength === 0 && (
        <div className={styles.tickerPlaceholder}>Waiting for first match to complete...</div>
      )}
    </div>
  );
}

export const BottomSection = memo(BottomSectionComponent);
