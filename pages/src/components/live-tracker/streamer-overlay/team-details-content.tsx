import React, { memo } from "react";
import classNames from "classnames";
import { ScrollingContent } from "../../scrolling-content/scrolling-content";
import type { LiveTrackerTeamRenderModel } from "../types";
import styles from "./streamer-overlay.module.css";

interface TeamDetailsContentProps {
  readonly team: LiveTrackerTeamRenderModel;
  readonly teamName: string | null;
  readonly disableTeamPlayerNames: boolean;
  readonly renderPlayerNameContent: (playerId: string, displayName: string) => React.ReactElement;
}

function TeamDetailsContentComponent({
  team,
  teamName,
  disableTeamPlayerNames,
  renderPlayerNameContent,
}: TeamDetailsContentProps): React.ReactElement {
  const hasTeamName = teamName !== null && teamName !== "";
  const showPlayerNames = !hasTeamName || !disableTeamPlayerNames;

  return (
    <div className={classNames(styles.teamWithPlayers, { [styles.animateTeamNames]: hasTeamName && showPlayerNames })}>
      {hasTeamName && <div className={styles.teamName}>{teamName}</div>}
      {showPlayerNames ? (
        <ScrollingContent maxWidth={600} className={styles.teamPlayersScroll}>
          {team.players.map((player, idx) => (
            <React.Fragment key={player.id}>
              {idx > 0 && ", "}
              {renderPlayerNameContent(player.id, player.displayName)}
            </React.Fragment>
          ))}
        </ScrollingContent>
      ) : null}
    </div>
  );
}

export const TeamDetailsContent = memo(TeamDetailsContentComponent);
