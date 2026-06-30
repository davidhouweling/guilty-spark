import React, { memo } from "react";
import classNames from "classnames";
import styles from "./streamer-overlay.module.css";

interface SeriesTab {
  readonly type: "series";
  readonly seriesId: string;
  readonly index: number;
  readonly label: string;
  readonly score: string;
  readonly teamColor: undefined;
  readonly icons?: readonly { readonly src: string; readonly dimmed: boolean }[];
}

interface MatchTabBase {
  readonly type: "match";
  readonly index: number;
  readonly matchId: string;
  readonly label: string;
  readonly score: string;
  readonly teamColor: string | undefined;
}

type SingleIconMatchTab = MatchTabBase & { readonly icon: string; readonly icons?: never };
type MultiIconMatchTab = MatchTabBase & {
  readonly icons: readonly { readonly src: string; readonly dimmed: boolean }[];
  readonly icon?: never;
};

export type MatchTab = SingleIconMatchTab | MultiIconMatchTab;
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

const TabButton = memo(({ tab, isActive, isSelected, onTabClick }: TabButtonProps): React.ReactElement => {
  const tabIndex = tab.index;
  const tabIcons =
    tab.type === "series"
      ? (tab.icons ?? [])
      : (tab.icons ?? (tab.icon !== "" ? [{ src: tab.icon, dimmed: false as const }] : []));

  return (
    <button
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
        const tabIndex = tab.index;
        const tabKey = tab.type === "series" ? `series-${tab.seriesId}` : tab.matchId;
        const isActive = activeTabIndex === tabIndex;
        const isSelected = selectedTab === tabIndex && isPanelOpen;

        return <TabButton key={tabKey} tab={tab} isActive={isActive} isSelected={isSelected} onTabClick={onTabClick} />;
      })}
    </div>
  );
}

export const OverlayTabsBar = memo(OverlayTabsBarComponent);
