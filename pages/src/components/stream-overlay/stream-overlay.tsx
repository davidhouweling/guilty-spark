import type { ReactElement, ReactNode } from "react";
import { Heading } from "../heading/heading";
import { LoginStatusSection } from "./login-status/login-status";
import type { LoginStatusAuthState } from "./login-status/types";
import styles from "./stream-overlay.module.css";

export interface StreamOverlayShellProps {
  readonly authState: LoginStatusAuthState;
  readonly gamertag: string | null;
  readonly avatarUrl: string | null;
  readonly signInHref: string;
  readonly overlayUrlsContent: ReactNode;
  readonly configureContent: ReactNode;
}

export function StreamOverlayShell({
  authState,
  gamertag,
  avatarUrl,
  signInHref,
  overlayUrlsContent,
  configureContent,
}: StreamOverlayShellProps): ReactElement {
  return (
    <div className={styles.container}>
      <section className={styles.step}>
        <Heading tagName="h2" className={styles.stepHeading}>
          Step 1: Sign in
        </Heading>
        <LoginStatusSection authState={authState} gamertag={gamertag} avatarUrl={avatarUrl} signInHref={signInHref} />
      </section>

      <section className={styles.step}>
        <Heading tagName="h2" className={styles.stepHeading}>
          Step 2: Overlay and Viewer URLs
        </Heading>
        {overlayUrlsContent}
      </section>

      <section className={styles.step}>
        <Heading tagName="h2" className={styles.stepHeading}>
          Step 3: Configure your overlay
        </Heading>
        {configureContent}
      </section>
    </div>
  );
}
