import React from "react";
import classNames from "classnames";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import type { TabbedSectionTab } from "./types";
import styles from "./tabbed-section.module.css";

interface TabbedSectionProps<TId extends string> {
  readonly tabs: readonly TabbedSectionTab<TId>[];
  readonly tabListAriaLabel: string;
  readonly onTabChange: (tabId: TId) => void;
  readonly tabsClassName?: string;
  readonly tabContainerClassName?: string;
}

interface TabbedSectionSectionProps<TId extends string> extends TabbedSectionProps<TId> {
  readonly variant?: "section";
  readonly selectedTabId: TId;
}

interface TabbedSectionNavigationProps<TId extends string> extends TabbedSectionProps<TId> {
  readonly variant: "navigation";
  readonly selectedTabId: TId | null;
}

type TabbedSectionComponentProps<TId extends string> =
  | TabbedSectionSectionProps<TId>
  | TabbedSectionNavigationProps<TId>;

export function TabbedSection<TId extends string>({
  tabs,
  selectedTabId,
  tabListAriaLabel,
  onTabChange,
  variant = "section",
  tabsClassName,
  tabContainerClassName,
}: TabbedSectionComponentProps<TId>): React.ReactElement {
  const tabSetId = React.useId();
  const tabListRef = React.useRef<HTMLDivElement>(null);

  const focusTab = React.useCallback(
    (tabId: TId): void => {
      const tabDomId = `${tabSetId}-${tabId}-tab`;
      const button = tabListRef.current?.ownerDocument.getElementById(tabDomId) as HTMLButtonElement | null;
      button?.focus();
    },
    [tabSetId],
  );

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>): void => {
      if (tabs.length === 0) {
        return;
      }
      // Skip key handling when modifier keys are held to preserve OS/browser shortcuts
      if (event.ctrlKey || event.altKey || event.metaKey) {
        return;
      }
      const currentIndex = selectedTabId != null ? tabs.findIndex((t) => t.id === selectedTabId) : -1;
      let nextIndex: number | null = null;

      switch (event.key) {
        case "ArrowRight": {
          nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % tabs.length;
          break;
        }
        case "ArrowLeft": {
          nextIndex = currentIndex === -1 ? tabs.length - 1 : (currentIndex - 1 + tabs.length) % tabs.length;
          break;
        }
        case "Home": {
          nextIndex = 0;
          break;
        }
        case "End": {
          nextIndex = tabs.length - 1;
          break;
        }
        default: {
          return;
        }
      }

      event.preventDefault();
      const nextTab = Preconditions.checkExists(tabs[nextIndex], "tab at index");
      onTabChange(nextTab.id);
      focusTab(nextTab.id);
    },
    [tabs, selectedTabId, onTabChange, focusTab],
  );

  return (
    <>
      <div
        ref={tabListRef}
        className={classNames(styles.tabList, tabsClassName)}
        role={variant === "section" ? "tablist" : undefined}
        aria-label={tabListAriaLabel}
        onKeyDown={handleKeyDown}
      >
        {tabs.map((tab) => {
          const tabDomId = `${tabSetId}-${tab.id}-tab`;
          const panelDomId = `${tabSetId}-${tab.id}-panel`;
          const isSelected = tab.id === selectedTabId;
          const isFallbackFocusable = selectedTabId == null && tabs[0]?.id === tab.id;
          return (
            <button
              key={tab.id}
              id={tabDomId}
              type="button"
              role={variant === "section" ? "tab" : undefined}
              aria-selected={variant === "section" ? isSelected : undefined}
              aria-pressed={variant === "navigation" ? isSelected : undefined}
              tabIndex={isSelected || isFallbackFocusable ? 0 : -1}
              aria-controls={variant === "section" ? panelDomId : undefined}
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

      {variant === "section" &&
        tabs.map((tab) => {
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
              className={classNames(styles.panel, tabContainerClassName)}
            >
              {tab.content}
            </div>
          );
        })}
    </>
  );
}
