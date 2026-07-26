import React, { memo } from "react";
import classNames from "classnames";
import type { TeamColor } from "../team-colors/team-colors";
import { TeamIcon } from "../icons/team-icon";
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
  const [leftScore = "0", rightScore = "0"] = seriesScore.split(":");
  const hasTitle = title != null;
  const hasSubtitle = subtitle != null;
  const hasSingleMetadataLine = hasTitle !== hasSubtitle;
  const hasAnyMetadataLine = hasTitle || hasSubtitle;

  const topSectionClassName = classNames(styles.topSection, {
    [styles.topSectionNoScore]: !showScore,
    [styles.topSectionSingleMetadataLine]: hasSingleMetadataLine,
    [styles.topSectionNoMetadataLine]: !hasAnyMetadataLine,
  });

  const serverIconSlotClassName = classNames(styles.serverIconSlot, {
    [styles.serverIconSlotCompact]: hasSingleMetadataLine || !hasAnyMetadataLine,
    [styles.serverIconSlotCentered]: !showScore && hasSingleMetadataLine,
  });

  const titleClassName = classNames(styles.title, {
    [styles.metadataSingleLine]: hasSingleMetadataLine,
  });

  const subtitleClassName = classNames(styles.subtitle, {
    [styles.metadataSingleLine]: hasSingleMetadataLine,
  });

  return (
    <div className={topSectionClassName}>
      {title != null && <div className={titleClassName}>{title}</div>}
      {iconUrl != null && (
        <div className={serverIconSlotClassName}>
          <img src={iconUrl} alt="Server" className={styles.serverIcon} />
        </div>
      )}
      {subtitle != null && <div className={subtitleClassName}>{subtitle}</div>}
      {showScore && (
        <>
          <div className={styles.teamLeftScore} style={{ "--team-color": teamColors[0]?.hex } as React.CSSProperties}>
            {leftScore}
          </div>
          <div className={styles.teamRightScore} style={{ "--team-color": teamColors[1]?.hex } as React.CSSProperties}>
            {rightScore}
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
