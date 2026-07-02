import { useState, useEffect } from "react";
import type { JSX } from "react";
import classNames from "classnames";
import discordLogo from "../../assets/discord-logo.png";
import XboxLogo from "../../assets/xbox-logo.png";
import styles from "./player-name.module.css";

interface PlayerNameProps {
  readonly discordName: string | null;
  readonly gamertag: string | null;
  readonly showIcons?: boolean;
  readonly className?: string;
}

export function PlayerName({ discordName, gamertag, showIcons = false, className }: PlayerNameProps): JSX.Element {
  if (discordName == null && gamertag == null) {
    return <span className={classNames(styles.playerName, className)} />;
  }

  if (discordName == null) {
    return (
      <span className={classNames(styles.playerName, className)}>
        <span className={classNames(styles.nameWithIcon, styles.xbox)}>
          {showIcons && <img src={XboxLogo.src} alt="Xbox" className={styles.icon} />}
          <span>{gamertag}</span>
        </span>
      </span>
    );
  }

  if (gamertag == null) {
    return (
      <span className={classNames(styles.playerName, className)}>
        <span className={classNames(styles.nameWithIcon, styles.discord)}>
          {showIcons && <img src={discordLogo.src} alt="Discord" className={styles.icon} />}
          <span>{discordName}</span>
        </span>
      </span>
    );
  }

  const [showDiscord, setShowDiscord] = useState(true);

  // Always fade between Discord and Xbox every 10 seconds
  useEffect((): (() => void) => {
    const interval = setInterval(() => {
      setShowDiscord((prev) => !prev);
    }, 10000); // 10 seconds

    return (): void => {
      clearInterval(interval);
    };
  }, []);

  // Always fade between Discord and Xbox icons/names
  return (
    <span className={classNames(styles.playerName, className)}>
      <span
        className={classNames(styles.fadeContainer, {
          [styles.showDiscord]: showDiscord,
          [styles.showXbox]: !showDiscord,
        })}
      >
        <span className={classNames(styles.nameWithIcon, styles.discord)}>
          {showIcons && <img src={discordLogo.src} alt="Discord" className={styles.icon} />}
          <span>{discordName}</span>
        </span>
        <span className={classNames(styles.nameWithIcon, styles.xbox)}>
          {showIcons && <img src={XboxLogo.src} alt="Xbox" className={styles.icon} />}
          <span>{gamertag}</span>
        </span>
      </span>
    </span>
  );
}
