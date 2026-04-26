import React from "react";
import classNames from "classnames";
import { Alert } from "../../alert/alert";
import styles from "./series-overview.module.css";

export interface SeriesOverviewPlayer {
  readonly id: string;
  readonly content: React.ReactNode;
}

export interface SeriesOverviewTeam {
  readonly id: string;
  readonly name: string;
  readonly players: readonly SeriesOverviewPlayer[];
  readonly colorHex?: string;
}

export interface SeriesOverviewMatch {
  readonly id: string;
  readonly gameMode: string;
  readonly score: string;
  readonly subScore?: string;
  readonly mapName: string;
  readonly mapThumbnailUrl: string;
  readonly winningTeamIndex?: number;
  readonly href?: string;
}

interface SeriesOverviewProps {
  readonly seriesScore: string;
  readonly matches: readonly SeriesOverviewMatch[];
  readonly teams: readonly SeriesOverviewTeam[];
  readonly gameModeIconSrc: (gameMode: string) => string;
  readonly emptyState?: React.ReactNode;
  readonly className?: string;
  readonly hidePartBorders?: boolean;
}

function renderScoreLink(match: SeriesOverviewMatch, gameModeIconUrl: string): React.ReactElement {
  const scoreContent = (
    <>
      <img src={gameModeIconUrl} alt={match.gameMode} className={styles.gameTypeIcon} />
      {match.score}
      {match.subScore != null ? <span className={styles.seriesSubScore}>({match.subScore})</span> : ""}
      <span className={styles.gameTypeAndMap}>{match.mapName}</span>
    </>
  );

  if (match.href != null) {
    return (
      <a href={match.href} className={styles.seriesScoreLink}>
        {scoreContent}
      </a>
    );
  }

  return <div className={styles.seriesScoreLink}>{scoreContent}</div>;
}

export function SeriesOverview({
  seriesScore,
  matches,
  teams,
  gameModeIconSrc,
  emptyState,
  className,
  hidePartBorders = false,
}: SeriesOverviewProps): React.ReactElement {
  return (
    <div className={classNames(styles.seriesOverview, className, { [styles.borderless]: hidePartBorders })}>
      <section className={styles.seriesScores}>
        {matches.length > 0 ? (
          <>
            <h3 className={styles.seriesScoresHeader} aria-label="Series scores">
              {seriesScore}
            </h3>
            <ul className={styles.seriesScoresList}>
              {matches.map((match) => {
                const winningTeamColorHex =
                  match.winningTeamIndex != null && match.winningTeamIndex < teams.length
                    ? teams[match.winningTeamIndex]?.colorHex
                    : undefined;

                return (
                  <li
                    key={match.id}
                    className={styles.seriesScore}
                    style={
                      {
                        "--series-score-bg": `url(${match.mapThumbnailUrl})`,
                        "--team-color": winningTeamColorHex ?? "transparent",
                      } as React.CSSProperties
                    }
                  >
                    {renderScoreLink(match, gameModeIconSrc(match.gameMode))}
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <div className={styles.noticeFlexFill}>
            {emptyState ?? (
              <Alert variant="info" icon="⏳">
                Waiting for first match to complete...
              </Alert>
            )}
          </div>
        )}
      </section>

      {teams.map((team) => (
        <section
          key={team.id}
          className={styles.teamCard}
          style={{ "--team-color": team.colorHex ?? "transparent" } as React.CSSProperties}
        >
          <h3 className={styles.teamName}>{team.name}</h3>
          <ul className={styles.playerList}>
            {team.players.map((player) => (
              <li key={player.id}>{player.content}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
