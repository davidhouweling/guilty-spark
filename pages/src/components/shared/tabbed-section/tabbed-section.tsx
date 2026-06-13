import React from "react";
import classNames from "classnames";
import type { TabbedSectionTab } from "./types";
import styles from "./tabbed-section.module.css";

interface TabbedSectionProps<TId extends string> {
  readonly tabs: readonly TabbedSectionTab<TId>[];
  readonly selectedTabId: TId;
  readonly onTabChange: (tabId: TId) => void;
  readonly tabListAriaLabel: string;
}

export function TabbedSection<TId extends string>({
  tabs,
  selectedTabId,
  onTabChange,
  tabListAriaLabel,
}: TabbedSectionProps<TId>): React.ReactElement {
  const tabSetId = React.useId();

  return (
    <div>
      <div className={styles.tabList} role="tablist" aria-label={tabListAriaLabel}>
        {tabs.map((tab) => {
          const tabDomId = `${tabSetId}-${tab.id}-tab`;
          const panelDomId = `${tabSetId}-${tab.id}-panel`;
          const isSelected = tab.id === selectedTabId;
          return (
            <button
              key={tab.id}
              id={tabDomId}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-controls={panelDomId}
              className={classNames(styles.tabButton, {
                [styles.tabButtonActive]: isSelected,
              })}
              onClick={(): void => {
                onTabChange(tab.id);
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {tabs.map((tab) => {
        const tabDomId = `${tabSetId}-${tab.id}-tab`;
        const panelDomId = `${tabSetId}-${tab.id}-panel`;
        const isSelected = tab.id === selectedTabId;
        return (
          <div
            key={tab.id}
            id={panelDomId}
            role="tabpanel"
            aria-labelledby={tabDomId}
            hidden={!isSelected}
            className={styles.panel}
          >
            {tab.content}
          </div>
        );
      })}
    </div>
  );
}
