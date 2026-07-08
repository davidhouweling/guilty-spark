import React, { memo, useLayoutEffect, useMemo, useRef, useState } from "react";
import classNames from "classnames";
import styles from "./streamer-overlay.module.css";

const MIN_MATCH_TAB_WIDTH = 80;
const MIN_SERIES_TAB_WIDTH = 100;
const TAB_GAP_WIDTH = 4;

interface SeriesTab {
  readonly type: "series";
  readonly seriesId: string;
  readonly index: number;
  readonly label: string;
  readonly score: string;
  readonly teamColor: string | undefined;
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

export function getOverlayTabDisplayLimit(containerWidth: number, tabs: readonly OverlayTab[]): number {
  if (tabs.length === 0) {
    return 0;
  }

  if (containerWidth <= 0) {
    return 1;
  }

  let usedWidth = 0;
  let visibleCount = 0;

  for (const tab of tabs) {
    const tabWidth = tab.type === "series" ? MIN_SERIES_TAB_WIDTH : MIN_MATCH_TAB_WIDTH;
    const nextWidth = usedWidth + tabWidth + (visibleCount > 0 ? TAB_GAP_WIDTH : 0);

    if (nextWidth > containerWidth) {
      break;
    }

    usedWidth = nextWidth;
    visibleCount += 1;
  }

  return Math.max(1, visibleCount);
}

interface GetVisibleTabsOptions {
  readonly tabs: readonly OverlayTab[];
  readonly displayLimit: number;
  readonly activeTabIndex: number | undefined;
  readonly selectedTab: number;
}

export function getVisibleTabsForWidth(options: GetVisibleTabsOptions): readonly OverlayTab[] {
  const { tabs, displayLimit, activeTabIndex, selectedTab } = options;

  if (tabs.length <= displayLimit) {
    return tabs;
  }

  const summaryPosition = tabs[0]?.type === "series" ? 0 : undefined;
  const activePosition = activeTabIndex == null ? undefined : tabs.findIndex((tab) => tab.index === activeTabIndex);
  const selectedPosition = tabs.findIndex((tab) => tab.index === selectedTab);

  const priorityPositions = [activePosition, selectedPosition, summaryPosition].filter(
    (position): position is number => position != null && position >= 0,
  );

  if (priorityPositions.length >= displayLimit) {
    const clampedPriorityPositions = Array.from(new Set(priorityPositions)).slice(0, displayLimit);
    const clampedPositionSet = new Set(clampedPriorityPositions);

    return tabs.filter((_tab, position) => clampedPositionSet.has(position));
  }

  const includedPositions = new Set(priorityPositions);

  for (let position = tabs.length - 1; position >= 0 && includedPositions.size < displayLimit; position -= 1) {
    includedPositions.add(position);
  }

  return tabs.filter((_tab, position) => includedPositions.has(position));
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
  const tabBarRef = useRef<HTMLDivElement | null>(null);
  const [tabDisplayLimit, setTabDisplayLimit] = useState<number>(tabs.length);

  useLayoutEffect(() => {
    const tabBarNode = tabBarRef.current;
    if (tabBarNode == null) {
      return;
    }

    const recalculateTabDisplayLimit = (): void => {
      const nextLimit = getOverlayTabDisplayLimit(tabBarNode.clientWidth, tabs);
      setTabDisplayLimit((previousLimit) => (previousLimit === nextLimit ? previousLimit : nextLimit));
    };

    recalculateTabDisplayLimit();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      recalculateTabDisplayLimit();
    });
    resizeObserver.observe(tabBarNode);

    return (): void => {
      resizeObserver.disconnect();
    };
  }, [tabs]);

  const visibleTabs = useMemo(
    () =>
      getVisibleTabsForWidth({
        tabs,
        displayLimit: tabDisplayLimit,
        activeTabIndex,
        selectedTab,
      }),
    [activeTabIndex, selectedTab, tabDisplayLimit, tabs],
  );

  return (
    <div ref={tabBarRef} className={styles.tabBar}>
      {visibleTabs.map((tab) => {
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
