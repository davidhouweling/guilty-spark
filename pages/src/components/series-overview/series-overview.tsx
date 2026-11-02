import React from "react";
import classNames from "classnames";
import { Alert } from "../alert/alert";
import { Heading } from "../heading/heading";
import { PlayerName } from "../player-name/player-name";
import styles from "./series-overview.module.css";
import type { SeriesOverviewMatch, SeriesOverviewProps } from "./types";

function ScoreTileContent({ match }: { readonly match: SeriesOverviewMatch }): React.JSX.Element {
  return (
    <>
      {(match.gameModeIconUrl != null || match.gameModeAlt !== "") && (
        <img src={match.gameModeIconUrl ?? "data:,"} alt={match.gameModeAlt} className={styles.gameTypeIcon} />
      )}
      {match.score}
      {match.subScore != null ? <span className={styles.seriesSubScore}>({match.subScore})</span> : ""}
      <span className={styles.gameTypeAndMap}>{match.mapLabel}</span>
    </>
  );
}

export function SeriesOverview({ score, matches, teams, waitingMessage }: SeriesOverviewProps): React.JSX.Element {
  return (
    <div className={styles.seriesOverviewScroller}>
      <div className={styles.seriesOverview}>
        <section className={styles.seriesScores}>
          {waitingMessage != null ? (
            <div className={styles.noticeFlexFill}>
              <Alert variant="info" icon="⏳">
                {waitingMessage}
              </Alert>
            </div>
          ) : (
            <Heading tagName="h3" className={styles.seriesScoresHeader} aria-label="Series scores">
              {score}
            </Heading>
          )}
          {matches.length > 0 && (
            <ul className={styles.seriesScoresList} aria-label="Series score tiles">
              {matches.map((match) => {
                const style = {
                  "--series-score-bg": `url(${match.mapBackgroundUrl})`,
                  ...(!match.isUpcoming && match.teamColorHex !== undefined
                    ? { "--team-color": match.teamColorHex }
                    : {}),
                } as React.CSSProperties;
                const content = <ScoreTileContent match={match} />;

                return (
                  <li
                    key={match.id}
                    className={classNames(styles.seriesScore, match.isUpcoming && styles.seriesScoreUpcoming)}
                    style={style}
                  >
                    {match.href != null ? (
                      <a href={match.href} className={styles.seriesScoreLink}>
                        {content}
                      </a>
                    ) : (
                      <div className={styles.seriesScoreLink}>{content}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        {teams.map((team) => (
          <section
            key={team.id}
            className={styles.teamCard}
            style={{ "--team-color": team.teamColorHex } as React.CSSProperties}
          >
            <Heading tagName="h3" className={styles.teamName}>
              {team.name}
            </Heading>
            <ul className={styles.playerList}>
              {team.players.map((player) => (
                <li key={player.id}>
                  <PlayerName discordName={player.discordName} gamertag={player.gamertag} showIcons={true} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
