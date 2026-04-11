import React from "react";
import classNames from "classnames";
import styles from "./settings-shell.module.css";

export interface SettingsShellItem {
  readonly id: string;
  readonly label: string;
  readonly description: string;
}

interface SettingsShellProps {
  readonly title: string;
  readonly subtitle: string;
  readonly items: readonly SettingsShellItem[];
  readonly activeItemId: string;
  readonly onSelectItem: (id: string) => void;
  readonly children: React.ReactNode;
  readonly className?: string;
}

export function SettingsShell({
  title,
  subtitle,
  items,
  activeItemId,
  onSelectItem,
  children,
  className,
}: SettingsShellProps): React.ReactElement {
  return (
    <section className={classNames(styles.shell, className)}>
      <header className={styles.header}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.subtitle}>{subtitle}</p>
      </header>

      <div className={styles.layout}>
        <nav className={styles.menu} aria-label="Settings groups">
          {items.map((item) => {
            const isActive = item.id === activeItemId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={(): void => {
                  onSelectItem(item.id);
                }}
                className={classNames(styles.menuItem, { [styles.menuItemActive]: isActive })}
                aria-current={isActive ? "page" : undefined}
              >
                <span className={styles.menuLabel}>{item.label}</span>
                <span className={styles.menuDescription}>{item.description}</span>
              </button>
            );
          })}
        </nav>

        <div className={styles.panel}>{children}</div>
      </div>
    </section>
  );
}
