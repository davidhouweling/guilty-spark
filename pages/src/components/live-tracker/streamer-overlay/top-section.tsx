import React, { memo } from "react";
import type { TeamColor } from "../../team-colors/team-colors";
import { TeamIcon } from "../../icons/team-icon";
import styles from "./streamer-overlay.module.css";

interface TopSectionProps {
  readonly title: string | null;
  readonly subtitle: string | null;
  readonly iconUrl: string | null;
  readonly showScore: boolean;
  readonly showTeamDetails: boolean;
  readonly seriesScore: string;
  readonly teamColors: TeamColor[];
  readonly teamLeft: React.ReactNode;
  readonly teamRight: React.ReactNode;
}

function TopSectionComponent({
  title,
  subtitle,
  iconUrl,
  showScore,
  showTeamDetails,
  seriesScore,
  teamColors,
  teamLeft,
  teamRight,
}: TopSectionProps): React.ReactElement {
  return (
    <div className={styles.topSection}>
      {title != null && <div className={styles.title}>{title}</div>}
      {iconUrl != null && (
        <div className={styles.serverIconSlot}>
          <img src={iconUrl} alt="Server" className={styles.serverIcon} />
        </div>
      )}
      {subtitle != null && <div className={styles.subtitle}>{subtitle}</div>}
      {showScore && (
        <>
          <div className={styles.teamLeftScore} style={{ "--team-color": teamColors[0]?.hex } as React.CSSProperties}>
            {seriesScore.split(":")[0]}
          </div>
          <div className={styles.teamRightScore} style={{ "--team-color": teamColors[1]?.hex } as React.CSSProperties}>
            {seriesScore.split(":")[1]}
          </div>
        </>
      )}
      {showTeamDetails && (
        <>
          <div className={styles.teamLeft} style={{ "--team-color": teamColors[0]?.hex } as React.CSSProperties}>
            <TeamIcon teamId={0} />
            <div className={styles.teamPlayers}>{teamLeft}</div>
          </div>
          <div className={styles.teamRight} style={{ "--team-color": teamColors[1]?.hex } as React.CSSProperties}>
            <TeamIcon teamId={1} />
            <div className={styles.teamPlayers}>{teamRight}</div>
          </div>
        </>
      )}
    </div>
  );
}

export const TopSection = memo(TopSectionComponent);
