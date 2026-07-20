import React from "react";
import { Heading } from "../../heading/heading";
import styles from "./live-trackers-onboarding.module.css";

export function LiveTrackersOnboarding(): React.ReactElement {
  return (
    <div className={styles.onboarding}>
      <Heading tagName="h3" className={styles.title}>
        Getting Started with Individual Tracking
      </Heading>
      <ol className={styles.steps}>
        <li className={styles.step}>
          <div className={styles.stepNumber} aria-hidden="true">
            1
          </div>
          <div className={styles.stepContent}>
            <Heading tagName="h4" className={styles.stepTitle}>
              Start a Tracker
            </Heading>
            <p className={styles.stepDescription}>
              Start a tracker for your gamertag or add one for another player to monitor their live matches.
            </p>
          </div>
        </li>

        <li className={styles.step}>
          <div className={styles.stepNumber} aria-hidden="true">
            2
          </div>
          <div className={styles.stepContent}>
            <Heading tagName="h4" className={styles.stepTitle}>
              Configure Stats & Settings
            </Heading>
            <p className={styles.stepDescription}>
              Customize stat highlights and streamer display settings using the tabs above to tailor the overlay to your
              stream.
            </p>
          </div>
        </li>

        <li className={styles.step}>
          <div className={styles.stepNumber} aria-hidden="true">
            3
          </div>
          <div className={styles.stepContent}>
            <Heading tagName="h4" className={styles.stepTitle}>
              Share Viewer URL
            </Heading>
            <p className={styles.stepDescription}>
              Grab the Viewer URL from your tracker and paste it in your stream chat so viewers can follow along in real
              time.
            </p>
          </div>
        </li>

        <li className={styles.step}>
          <div className={styles.stepNumber} aria-hidden="true">
            4
          </div>
          <div className={styles.stepContent}>
            <Heading tagName="h4" className={styles.stepTitle}>
              Add Overlay to Stream
            </Heading>
            <p className={styles.stepDescription}>
              Use the Overlay URL with your streaming software (OBS, Streamlabs, etc.) to display live stats on your
              broadcast.
            </p>
          </div>
        </li>
      </ol>
    </div>
  );
}
