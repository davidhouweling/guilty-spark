import React from "react";
import classNames from "classnames";
import styles from "./collapsible-panel.module.css";

interface CollapsiblePanelProps {
  readonly id: string;
  readonly defaultExpanded?: boolean;
  readonly header: React.ReactNode | ((expanded: boolean) => React.ReactNode);
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly toggleClassName?: string;
  readonly contentClassName?: string;
  readonly contentInnerClassName?: string;
}

export function CollapsiblePanel({
  id,
  defaultExpanded = false,
  header,
  children,
  className,
  toggleClassName,
  contentClassName,
  contentInnerClassName,
}: CollapsiblePanelProps): React.ReactElement {
  const bodyId = `${id}-content`;
  const [expanded, setExpanded] = React.useState(defaultExpanded);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const contentInnerRef = React.useRef<HTMLDivElement | null>(null);
  const isFirstRenderRef = React.useRef(true);
  const [contentHeight, setContentHeight] = React.useState(defaultExpanded ? "auto" : "0px");

  function handleToggle(): void {
    setExpanded((current) => !current);
  }

  const updateContentHeight: React.EffectCallback = () => {
    const contentElement = contentRef.current;
    const contentInnerElement = contentInnerRef.current;

    if (contentElement == null || contentInnerElement == null) {
      return;
    }

    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      setContentHeight(defaultExpanded ? "auto" : "0px");
      return;
    }

    const measuredHeight = `${contentInnerElement.scrollHeight.toString()}px`;

    if (expanded) {
      setContentHeight(measuredHeight);
      return;
    }

    setContentHeight(measuredHeight);
    const animationFrameId = requestAnimationFrame((): void => {
      setContentHeight("0px");
    });

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  };

  React.useLayoutEffect(updateContentHeight, [defaultExpanded, expanded]);

  function handleTransitionEnd(event: React.TransitionEvent<HTMLDivElement>): void {
    if (event.target !== event.currentTarget || event.propertyName !== "height") {
      return;
    }

    if (!expanded) {
      return;
    }

    setContentHeight("auto");
  }

  return (
    <div className={classNames(styles.panel, className)}>
      <button
        type="button"
        className={classNames(styles.toggle, toggleClassName)}
        onClick={handleToggle}
        aria-expanded={expanded}
        aria-controls={bodyId}
      >
        {typeof header === "function" ? header(expanded) : header}
      </button>
      <div
        ref={contentRef}
        id={bodyId}
        className={classNames(styles.content, contentClassName, {
          [styles.expanded]: expanded,
        })}
        aria-hidden={!expanded}
        style={{ height: contentHeight }}
        onTransitionEnd={handleTransitionEnd}
      >
        <div ref={contentInnerRef} className={classNames(styles.contentInner, contentInnerClassName)}>
          {children}
        </div>
      </div>
    </div>
  );
}
