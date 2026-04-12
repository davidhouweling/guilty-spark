import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { IndividualTrackerState } from "@guilty-spark/shared/individual-tracker/types";
import type { Services } from "../../services/types";
import { Button } from "../button/button";
import { Container } from "../container/container";
import { SettingsShell, type SettingsShellItem } from "../settings-shell/settings-shell";
import type { TrackerListItem, TrackerDisplayStatus } from "./tracker-list";
import { TrackerList } from "./tracker-list";
import styles from "./individual-tracker.module.css";

// ─── Types ────────────────────────────────────────────────────────────────────

type IndividualTrackerSectionId = "live-trackers" | "streamer-connections" | "additional-options";
type AuthState = "loading" | "authenticated" | "unauthenticated";

interface IndividualTrackerViewProps {
  readonly services: Services;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function derivedStatus(trackerState: IndividualTrackerState | null): TrackerDisplayStatus {
  if (trackerState === null) {
    return "not-started";
  }
  return trackerState.status;
}

function buildTrackerList(
  xboxGamertag: string | null,
  activeTracker: IndividualTrackerState | null,
): readonly TrackerListItem[] {
  if (xboxGamertag === null) {
    if (activeTracker === null) {
      return [];
    }
    return [
      {
        trackerId: activeTracker.trackerId,
        gamertag: activeTracker.gamertag,
        status: derivedStatus(activeTracker),
        isLive: true,
        isPinned: false,
      },
    ];
  }

  const isTrackerForPinnedGamertag =
    activeTracker !== null && activeTracker.gamertag.toLowerCase() === xboxGamertag.toLowerCase();

  const pinnedItem: TrackerListItem = {
    trackerId: isTrackerForPinnedGamertag ? activeTracker.trackerId : null,
    gamertag: xboxGamertag,
    status: isTrackerForPinnedGamertag ? derivedStatus(activeTracker) : "not-started",
    isLive: true,
    isPinned: true,
  };

  if (activeTracker === null || isTrackerForPinnedGamertag) {
    return [pinnedItem];
  }

  const additionalItem: TrackerListItem = {
    trackerId: activeTracker.trackerId,
    gamertag: activeTracker.gamertag,
    status: derivedStatus(activeTracker),
    isLive: false,
    isPinned: false,
  };

  return [pinnedItem, additionalItem];
}

// ─── Placeholder panels ───────────────────────────────────────────────────────

function StreamerConnectionsPanel(): React.ReactElement {
  return (
    <div className={styles.placeholderPanel}>
      <h2 className={styles.sectionTitle}>Streamer Connections</h2>
      <p className={styles.sectionDescription}>
        Connect your Twitch account to automate your stream — auto-start your tracker when you go live and pause it
        when your stream ends.
      </p>
      <p className={styles.comingSoon}>Twitch integration coming soon.</p>
    </div>
  );
}

function AdditionalOptionsPanel(): React.ReactElement {
  return (
    <div className={styles.placeholderPanel}>
      <h2 className={styles.sectionTitle}>Additional Options</h2>
      <p className={styles.sectionDescription}>
        Fine-tune tracker behaviour — control what happens when you log out and manage visibility of stopped trackers.
      </p>
      <p className={styles.comingSoon}>Additional settings coming soon.</p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function IndividualTrackerView({ services }: IndividualTrackerViewProps): React.ReactElement {
  const { authService, individualLiveTrackerService } = services;

  const [authState, setAuthState] = useState<AuthState>("loading");
  const [activeSection, setActiveSection] = useState<IndividualTrackerSectionId>("live-trackers");
  const [userId, setUserId] = useState<string | null>(null);
  const [xboxGamertag, setXboxGamertag] = useState<string | null>(null);

  const [activeTracker, setActiveTracker] = useState<IndividualTrackerState | null>(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const menuItems: readonly SettingsShellItem[] = useMemo(
    () => [
      {
        id: "live-trackers",
        label: "Live Trackers",
        description: "Start, stop, and manage your real-time Halo trackers.",
      },
      {
        id: "streamer-connections",
        label: "Streamer Connections",
        description: "Connect your accounts and automate your stream.",
      },
      {
        id: "additional-options",
        label: "Additional Options",
        description: "Fine-tune how your trackers behave.",
      },
    ],
    [],
  );

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const session = await authService.getSession();
      if (!session.authenticated || session.userId == null) {
        setAuthState("unauthenticated");
        setUserId(null);
        setXboxGamertag(null);
        setActiveTracker(null);
        return;
      }

      setAuthState("authenticated");
      setUserId(session.userId);
      setXboxGamertag(session.xboxGamertag ?? null);

      const statusResponse = await individualLiveTrackerService.getStatus();
      setActiveTracker(statusResponse.activeTracker);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load individual tracker.");
    } finally {
      setLoading(false);
    }
  }, [authService, individualLiveTrackerService]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (userId == null || activeTracker == null) {
      return;
    }

    const connection = individualLiveTrackerService.connectToTracker(userId, activeTracker.trackerId);

    const stateSubscription = connection.subscribe((state) => {
      setActiveTracker(state);
    });

    const statusSubscription = connection.subscribeStatus((status) => {
      if (status === "stopped") {
        setActiveTracker((prev) => (prev === null ? null : { ...prev, status: "stopped" }));
      }
    });

    return (): void => {
      stateSubscription.unsubscribe();
      statusSubscription.unsubscribe();
      connection.disconnect();
    };
  }, [activeTracker?.trackerId, individualLiveTrackerService, userId]);

  const startTracker = useCallback(
    async (gamertag?: string): Promise<void> => {
      setBusy(true);
      setErrorMessage(null);

      try {
        const result = await individualLiveTrackerService.startTracker({
          idleTimeoutHours: 1,
          ...(gamertag != null ? { gamertag } : {}),
        });

        if (!result.success) {
          setErrorMessage(result.error);
          return;
        }

        setActiveTracker(result.state);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to start tracker.");
      } finally {
        setBusy(false);
      }
    },
    [individualLiveTrackerService],
  );

  const stopTracker = useCallback(
    async (trackerId: string): Promise<void> => {
      setBusy(true);
      setErrorMessage(null);

      try {
        const result = await individualLiveTrackerService.stopTracker(trackerId);
        setActiveTracker(result.state);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to stop tracker.");
      } finally {
        setBusy(false);
      }
    },
    [individualLiveTrackerService],
  );

  const signIn = useCallback(async (): Promise<void> => {
    setErrorMessage(null);

    try {
      const { authUrl } = await authService.startMicrosoftAuth("/individual-tracker");
      window.location.assign(authUrl);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to start Microsoft sign-in.");
    }
  }, [authService]);

  const trackerItems = useMemo(
    () => buildTrackerList(xboxGamertag, activeTracker),
    [xboxGamertag, activeTracker],
  );

  const getActions = useCallback(
    (item: TrackerListItem) => {
      const actions: { label: string; disabled?: boolean; destructive?: boolean; onClick: () => void }[] = [];

      if (item.status === "not-started" || item.status === "stopped") {
        actions.push({
          label: "Start tracker",
          disabled: busy,
          onClick: (): void => {
            void startTracker(item.gamertag !== xboxGamertag ? item.gamertag : undefined);
          },
        });
      }

      if (item.status === "active" || item.status === "paused") {
        if (item.trackerId != null) {
          actions.push({
            label: "View tracker",
            onClick: (): void => {
              window.location.assign(`/individual-tracker?tracker=${item.trackerId ?? ""}`);
            },
          });
        }

        actions.push({
          label: "Stop tracker",
          disabled: busy || item.trackerId == null,
          onClick: (): void => {
            if (item.trackerId != null) {
              void stopTracker(item.trackerId);
            }
          },
        });
      }

      return actions;
    },
    [busy, startTracker, stopTracker, xboxGamertag],
  );

  if (loading) {
    return (
      <Container className={styles.pageContainer}>
        <div className={styles.loadingBox}>Loading individual tracker...</div>
      </Container>
    );
  }

  if (authState === "unauthenticated") {
    return (
      <Container className={styles.pageContainer}>
        <section className={styles.authBox}>
          <h1 className={styles.authTitle}>Sign in required</h1>
          <p className={styles.authSubtitle}>
            You need a Microsoft session before you can manage an individual tracker.
          </p>
          <Button onClick={(): void => void signIn()}>Sign in with Microsoft</Button>
          {errorMessage != null && <p className={styles.errorText}>{errorMessage}</p>}
        </section>
      </Container>
    );
  }

  let panelContent: React.ReactNode;

  switch (activeSection) {
    case "live-trackers": {
      panelContent = (
        <>
          {errorMessage != null && <p className={styles.errorText}>{errorMessage}</p>}
          <TrackerList
            items={trackerItems}
            getActions={getActions}
            onAddTracker={(): void => {
              // Phase 2: open Add Tracker dialog
            }}
          />
        </>
      );
      break;
    }
    case "streamer-connections": {
      panelContent = <StreamerConnectionsPanel />;
      break;
    }
    case "additional-options": {
      panelContent = <AdditionalOptionsPanel />;
      break;
    }
    default: {
      throw new Error(`Unknown section: ${String(activeSection)}`);
    }
  }

  return (
    <Container className={styles.pageContainer}>
      <SettingsShell
        title="Individual Tracker"
        subtitle="Manage your live trackers, streamer integrations, and preferences."
        items={menuItems}
        activeItemId={activeSection}
        onSelectItem={(id): void => {
          setActiveSection(id as IndividualTrackerSectionId);
        }}
      >
        {panelContent}
      </SettingsShell>
    </Container>
  );
}
