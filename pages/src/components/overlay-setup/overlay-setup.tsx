import type { ReactElement, ReactNode } from "react";
import { Container } from "../container/container";
import { Heading } from "../heading/heading";
import { LoginStatusSection } from "./login-status/login-status";
import type { LoginStatusAuthState } from "./login-status/types";
import styles from "./overlay-setup.module.css";

export interface OverlaySetupShellProps {
  readonly authState: LoginStatusAuthState;
  readonly gamertag: string | null;
  readonly avatarUrl: string | null;
  readonly signInHref: string;
  readonly overlayUrlsContent: ReactNode;
  readonly previewContent: ReactNode;
  readonly configureContent: ReactNode;
  readonly errorMessage?: string | null | undefined;
  readonly onRetry?: (() => void) | undefined;
}

export function OverlaySetupShell({
  authState,
  gamertag,
  avatarUrl,
  signInHref,
  overlayUrlsContent,
  previewContent,
  configureContent,
  errorMessage,
  onRetry,
}: OverlaySetupShellProps): ReactElement {
  return (
    <Container wide>
      <div className={styles.pageGrid}>
      <section className={styles.step}>
        <Heading tagName="h2" className={styles.stepHeading}>
          Step 1: Sign in
        </Heading>
        <LoginStatusSection
          authState={authState}
          gamertag={gamertag}
          avatarUrl={avatarUrl}
          signInHref={signInHref}
          errorMessage={errorMessage}
          onRetry={onRetry}
        />
      </section>

      <section className={styles.step}>
        <Heading tagName="h2" className={styles.stepHeading}>
          Step 2: Overlay and Viewer URLs
        </Heading>
        {overlayUrlsContent}
      </section>

      <div className={styles.previewSlot}>{previewContent}</div>

      <section className={styles.step}>
        <Heading tagName="h2" className={styles.stepHeading}>
          Step 3: Configure your overlay
        </Heading>
        {configureContent}
      </section>
      </div>
    </Container>
  );
}
