import React, { memo } from "react";
import classNames from "classnames";
import styles from "./streamer-overlay.module.css";

interface SeriesTab {
  readonly type: "series";
  readonly index: number;
  readonly label: string;
  readonly score: string;
  readonly teamColor: undefined;
}

interface MatchTab {
  readonly type: "match";
  readonly index: number;
  readonly matchId: string;
  readonly label: string;
  readonly score: string;
  readonly icon: string;
  readonly teamColor: string | undefined;
}

export type OverlayTab = SeriesTab | MatchTab;

interface OverlayTabsBarProps {
  readonly tabs: readonly OverlayTab[];
  readonly activeTabIndex: number | undefined;
  readonly selectedTab: number;
  readonly isPanelOpen: boolean;
  readonly onTabClick: (tabIndex: number) => void;
}

interface TabButtonProps {
  readonly tab: OverlayTab;
  readonly isActive: boolean;
  readonly isSelected: boolean;
  readonly onTabClick: (tabIndex: number) => void;
}

const TabButton = memo(function TabButton({
  tab,
  isActive,
  isSelected,
  onTabClick,
}: TabButtonProps): React.ReactElement {
  const tabIndex = tab.type === "series" ? -1 : tab.index;

  return (
    <button
      key={tab.type === "series" ? "series" : tab.matchId}
      type="button"
      className={classNames(styles.tab, {
        [styles.tabActive]: isActive,
        [styles.tabSelected]: isSelected,
        [styles.tabSeries]: tab.type === "series",
      })}
      onClick={(): void => {
        onTabClick(tabIndex);
      }}
      style={
        tab.teamColor != null
          ? ({
              "--tab-team-color": tab.teamColor,
            } as React.CSSProperties)
          : undefined
      }
    >
      <div className={styles.tabContent}>
        {tab.type === "match" && tab.icon && <img src={tab.icon} alt="" className={styles.tabIcon} />}
        <span className={styles.tabLabel}>{tab.label}</span>
        {tab.score && (
          <>
            {" "}
            • <span className={styles.tabScore}>{tab.score}</span>
          </>
        )}
      </div>
    </button>
  );
});

function OverlayTabsBarComponent({
  tabs,
  activeTabIndex,
  selectedTab,
  isPanelOpen,
  onTabClick,
}: OverlayTabsBarProps): React.ReactElement {
  return (
    <div className={styles.tabBar}>
      {tabs.map((tab) => {
        const tabIndex = tab.type === "series" ? -1 : tab.index;
        const isActive = activeTabIndex === tabIndex;
        const isSelected = selectedTab === tabIndex && isPanelOpen;

        return (
          <TabButton
            key={tab.type === "series" ? "series" : tab.matchId}
            tab={tab}
            isActive={isActive}
            isSelected={isSelected}
            onTabClick={onTabClick}
          />
        );
      })}
    </div>
  );
}

export const OverlayTabsBar = memo(OverlayTabsBarComponent);
