import React, { memo, useState, useEffect, useRef } from "react";
import { CSSTransition } from "react-transition-group";
import { ScrollingContent } from "../scrolling-content/scrolling-content";
import styles from "./streamer-overlay.module.css";

interface TeamPlayer {
  readonly id: string;
  readonly displayName: string;
}

interface TeamDetails {
  readonly players: readonly TeamPlayer[];
}

interface TeamDetailsContentProps {
  readonly team: TeamDetails;
  readonly teamName: string | null;
  readonly disableTeamPlayerNames: boolean;
  readonly renderPlayerNameContent: (playerId: string, displayName: string) => React.ReactElement;
}

// Show each content for 19 seconds, fade for 0.5 seconds = 19.5 second cycle.
const CONTENT_DISPLAY_DURATION_MS = 19000;
const TRANSITION_DURATION_MS = 500;

function TeamDetailsContentComponent({
  team,
  teamName,
  disableTeamPlayerNames,
  renderPlayerNameContent,
}: TeamDetailsContentProps): React.ReactElement {
  const hasTeamName = teamName !== null && teamName !== "";
  const shouldAnimateBetween = hasTeamName && !disableTeamPlayerNames;

  // Track which content to show when animating between team name and players
  const [showTeamName, setShowTeamName] = useState(true);
  const teamNameRef = useRef<HTMLDivElement | null>(null);
  const playersRef = useRef<HTMLDivElement | null>(null);

  // Toggle between team name and players every CONTENT_DISPLAY_DURATION_MS
  useEffect(() => {
    if (!shouldAnimateBetween) {
      return;
    }

    const interval = setInterval(() => {
      setShowTeamName((prev) => !prev);
    }, CONTENT_DISPLAY_DURATION_MS + TRANSITION_DURATION_MS);

    return (): void => {
      clearInterval(interval);
    };
  }, [shouldAnimateBetween]);

  if (!hasTeamName && !disableTeamPlayerNames) {
    // No team name and player names are enabled: show only players (no animation needed)
    return (
      <div className={styles.teamWithPlayers}>
        <ScrollingContent maxWidth={600} className={styles.teamPlayersScroll}>
          {team.players.map((player, idx) => (
            <React.Fragment key={player.id}>
              {idx > 0 && ", "}
              {renderPlayerNameContent(player.id, player.displayName)}
            </React.Fragment>
          ))}
        </ScrollingContent>
      </div>
    );
  }

  if (!hasTeamName || disableTeamPlayerNames) {
    // Either no team name or player names are disabled: show only what's available (no animation)
    return (
      <div className={styles.teamWithPlayers}>
        {hasTeamName && <div className={styles.teamName}>{teamName}</div>}
        {!disableTeamPlayerNames && (
          <ScrollingContent maxWidth={600} className={styles.teamPlayersScroll}>
            {team.players.map((player, idx) => (
              <React.Fragment key={player.id}>
                {idx > 0 && ", "}
                {renderPlayerNameContent(player.id, player.displayName)}
              </React.Fragment>
            ))}
          </ScrollingContent>
        )}
      </div>
    );
  }

  // Both team name and player names should be shown: animate between them
  // using react-transition-group to ensure proper DOM mount/unmount
  return (
    <div className={styles.teamWithPlayers}>
      <CSSTransition
        in={showTeamName}
        timeout={TRANSITION_DURATION_MS}
        classNames={{
          enter: styles.contentEnter,
          enterActive: styles.contentEnterActive,
          exit: styles.contentExit,
          exitActive: styles.contentExitActive,
        }}
        nodeRef={teamNameRef}
        unmountOnExit
      >
        <div ref={teamNameRef} className={styles.teamName}>
          {teamName}
        </div>
      </CSSTransition>

      <CSSTransition
        in={!showTeamName}
        timeout={TRANSITION_DURATION_MS}
        classNames={{
          enter: styles.contentEnter,
          enterActive: styles.contentEnterActive,
          exit: styles.contentExit,
          exitActive: styles.contentExitActive,
        }}
        nodeRef={playersRef}
        unmountOnExit
      >
        <div ref={playersRef} className={styles.teamPlayersScroll}>
          <ScrollingContent maxWidth={600}>
            {team.players.map((player, idx) => (
              <React.Fragment key={player.id}>
                {idx > 0 && ", "}
                {renderPlayerNameContent(player.id, player.displayName)}
              </React.Fragment>
            ))}
          </ScrollingContent>
        </div>
      </CSSTransition>
    </div>
  );
}

export const TeamDetailsContent = memo(TeamDetailsContentComponent);
