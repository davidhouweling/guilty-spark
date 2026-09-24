import type { ReactElement } from "react";
import { Button } from "../../button/button";
import { Heading } from "../../heading/heading";
import { LoadingState } from "../../loading-state/loading-state";
import { ProfileAvatar } from "../../header/profile-avatar";
import type { LoginStatusSectionProps } from "./types";
import styles from "./login-status.module.css";

export function LoginStatusSection({
  authState,
  gamertag,
  avatarUrl,
  signInHref,
}: LoginStatusSectionProps): ReactElement {
  if (authState === "loading") {
    return (
      <div className={styles.panel}>
        <LoadingState text="Checking session..." />
      </div>
    );
  }

  if (authState === "authenticated") {
    return (
      <div className={styles.panel}>
        <div className={styles.identity}>
          <ProfileAvatar avatarUrl={avatarUrl} />
          <div>
            <p className={styles.signedInLabel}>Logged in as</p>
            <Heading tagName="h2" className={styles.gamertag}>
              {gamertag ?? "Unknown Spartan"}
            </Heading>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div>
        <p className={styles.signInPrompt}>Sign in with your Microsoft account to get your own overlay URLs.</p>
        <Button href={signInHref}>Sign in with Microsoft</Button>
      </div>
    </div>
  );
}
