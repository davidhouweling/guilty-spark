import React, { memo } from "react";
import { CSSTransition } from "react-transition-group";
import styles from "./stats-panel.module.css";

interface StatsPanelProps {
  readonly isPanelOpen: boolean;
  readonly nodeRef: React.RefObject<HTMLDivElement | null>;
  readonly onClosePanel: () => void;
  readonly panelContent: React.ReactElement | null;
}

function StatsPanelComponent({
  isPanelOpen,
  nodeRef,
  onClosePanel,
  panelContent,
}: StatsPanelProps): React.ReactElement {
  return (
    <CSSTransition
      in={isPanelOpen}
      timeout={300}
      classNames={{
        enter: styles.panelEnter,
        enterActive: styles.panelEnterActive,
        exit: styles.panelExit,
        exitActive: styles.panelExitActive,
      }}
      nodeRef={nodeRef}
      unmountOnExit
    >
      <div ref={nodeRef} className={styles.statsPanel} onClick={onClosePanel}>
        <div
          className={styles.statsPanelContent}
          onClick={(e): void => {
            e.stopPropagation();
          }}
        >
          <button type="button" aria-label="Close" className={styles.closeButton} onClick={onClosePanel}>
            ✕
          </button>
          {panelContent}
        </div>
      </div>
    </CSSTransition>
  );
}

export const StatsPanel = memo(StatsPanelComponent);
