import React, { memo } from "react";
import classNames from "classnames";
import type { OverlayTab } from "./types";
import styles from "./streamer-overlay.module.css";

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

const TabButton = memo(({ tab, isActive, isSelected, onTabClick }: TabButtonProps): React.ReactElement => {
  const tabIndex = tab.index;
  const tabIcons =
    tab.type === "series"
      ? (tab.icons ?? [])
      : tab.type === "upcoming"
        ? tab.icons
        : (tab.icons ?? (tab.icon !== "" ? [{ src: tab.icon, dimmed: false as const }] : []));
  const isUpcoming = tab.type === "upcoming";
  const tabScore = isUpcoming ? "" : tab.score;
  const teamColor = isUpcoming ? undefined : tab.teamColor;

  return (
    <button
      type="button"
      className={classNames(styles.tab, {
        [styles.tabActive]: isActive,
        [styles.tabSelected]: isSelected,
        [styles.tabSeries]: tab.type === "series",
        [styles.tabUpcoming]: isUpcoming,
      })}
      disabled={isUpcoming}
      onClick={
        isUpcoming
          ? undefined
          : (): void => {
              onTabClick(tabIndex);
            }
      }
      style={
        teamColor != null
          ? ({
              "--tab-team-color": teamColor,
            } as React.CSSProperties)
          : undefined
      }
    >
      <div className={styles.tabContent}>
        {tabIcons.length > 0 && (
          <div className={styles.tabIcons}>
            {tabIcons.map((icon, index) => (
              <img
                key={`${icon.src}-${index.toString()}`}
                src={icon.src}
                alt=""
                className={classNames(styles.tabIcon, {
                  [styles.tabIconDimmed]: icon.dimmed,
                })}
              />
            ))}
          </div>
        )}
        <span className={styles.tabLabel}>{tab.label}</span>
        {tabScore && (
          <>
            {" "}
            • <span className={styles.tabScore}>{tabScore}</span>
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
        const tabIndex = tab.index;
        const tabKey =
          tab.type === "series"
            ? `series-${tab.seriesId}`
            : tab.type === "match"
              ? tab.matchId
              : `upcoming-${tabIndex.toString()}`;
        const isActive = tab.type !== "upcoming" && activeTabIndex === tabIndex;
        const isSelected = tab.type !== "upcoming" && selectedTab === tabIndex && isPanelOpen;

        return <TabButton key={tabKey} tab={tab} isActive={isActive} isSelected={isSelected} onTabClick={onTabClick} />;
      })}
    </div>
  );
}

export const OverlayTabsBar = memo(OverlayTabsBarComponent);
