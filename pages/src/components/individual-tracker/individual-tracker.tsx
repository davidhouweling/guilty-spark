import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IndividualTrackerState } from "@guilty-spark/shared/individual-tracker/types";
import type { Services } from "../../services/types";
import { Button } from "../button/button";
import { Container } from "../container/container";
import { SettingsShell, type SettingsShellItem } from "../settings-shell/settings-shell";
import type { TrackerListItem, TrackerDisplayStatus } from "./tracker-list";
import { TrackerList } from "./tracker-list";
import { AddTrackerDialog } from "./add-tracker-dialog";
import styles from "./individual-tracker.module.css";

// ─── Types ────────────────────────────────────────────────────────────────────

type IndividualTrackerSectionId = "live-trackers" | "streamer-connections" | "additional-options";
type AuthState = "loading" | "authenticated" | "unauthenticated";

interface IndividualTrackerViewProps {
  readonly services: Services;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const NON_LIVE_POLL_INTERVAL_MS = 30_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function derivedStatus(trackerState: IndividualTrackerState | null): TrackerDisplayStatus {
  if (trackerState === null) {
    return "not-started";
  }
  return trackerState.status;
}

function buildTrackerList(
  xboxGamertag: string | null,
  activeTrackerId: string | null,
  runningTrackers: readonly { trackerId: string; gamertag: string }[],
  trackerStatuses: Readonly<Record<string, IndividualTrackerState | null>>,
): readonly TrackerListItem[] {
  const rows: TrackerListItem[] = [];

  const pinnedRuntimeTracker =
    xboxGamertag == null
      ? null
      : (runningTrackers.find((tracker) => tracker.gamertag.toLowerCase() === xboxGamertag.toLowerCase()) ?? null);

  if (xboxGamertag != null) {
    const pinnedState = pinnedRuntimeTracker != null ? (trackerStatuses[pinnedRuntimeTracker.trackerId] ?? null) : null;
    rows.push({
      trackerId: pinnedRuntimeTracker?.trackerId ?? null,
      gamertag: xboxGamertag,
      status: pinnedState != null ? derivedStatus(pinnedState) : "not-started",
      isLive:
        pinnedRuntimeTracker != null ? pinnedRuntimeTracker.trackerId === activeTrackerId : activeTrackerId == null,
      isPinned: true,
    });
  }

  for (const tracker of runningTrackers) {
    if (pinnedRuntimeTracker?.trackerId === tracker.trackerId) {
      continue;
    }

    const trackerState = trackerStatuses[tracker.trackerId] ?? null;
    rows.push({
      trackerId: tracker.trackerId,
      gamertag: tracker.gamertag,
      status: trackerState != null ? derivedStatus(trackerState) : "stopped",
      isLive: tracker.trackerId === activeTrackerId,
      isPinned: false,
    });
  }

  return rows;
}

// ─── Placeholder panels ───────────────────────────────────────────────────────

function StreamerConnectionsPanel(): React.ReactElement {
  return (
    <div className={styles.placeholderPanel}>
      <h2 className={styles.sectionTitle}>Streamer Connections</h2>
      <p className={styles.sectionDescription}>
        Connect your Twitch account to automate your stream — auto-start your tracker when you go live and pause it when
        your stream ends.
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
  const [runningTrackers, setRunningTrackers] = useState<readonly { trackerId: string; gamertag: string }[]>([]);
  const [trackerStatuses, setTrackerStatuses] = useState<Record<string, IndividualTrackerState | null>>({});

  // Refs so polling callback always reads the latest values without restarting the interval
  const runningTrackersRef = useRef(runningTrackers);
  const activeTrackerIdRef = useRef(activeTracker?.trackerId ?? null);
  useEffect(() => {
    runningTrackersRef.current = runningTrackers;
  }, [runningTrackers]);
  useEffect(() => {
    activeTrackerIdRef.current = activeTracker?.trackerId ?? null;
  }, [activeTracker?.trackerId]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

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
        setRunningTrackers([]);
        setTrackerStatuses({});
        return;
      }

      setAuthState("authenticated");
      setUserId(session.userId);
      setXboxGamertag(session.xboxGamertag ?? null);

      const [trackerListResponse, activeStatusResponse] = await Promise.all([
        individualLiveTrackerService.getTrackers(session.userId),
        individualLiveTrackerService.getActiveTrackerState(session.userId),
      ]);

      setRunningTrackers(
        trackerListResponse.trackers.map((tracker) => ({ trackerId: tracker.trackerId, gamertag: tracker.gamertag })),
      );
      setTrackerStatuses(trackerListResponse.statuses);
      setActiveTracker(activeStatusResponse.activeTracker);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load individual tracker.");
    } finally {
      setLoading(false);
    }
  }, [authService, individualLiveTrackerService]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // WebSocket effect: subscribe to the live (active) tracker only
  useEffect(() => {
    if (userId == null || activeTracker == null) {
      return;
    }

    // Capture trackerId at setup time; effect reruns when it changes
    const liveTrackerId = activeTracker.trackerId;
    const connection = individualLiveTrackerService.connectToTracker(userId, liveTrackerId);

    const stateSubscription = connection.subscribe((state) => {
      setActiveTracker(state);
      setTrackerStatuses((prev) => ({ ...prev, [state.trackerId]: state }));
    });

    const statusSubscription = connection.subscribeStatus((status) => {
      if (status === "stopped") {
        setActiveTracker((prev) => (prev === null ? null : { ...prev, status: "stopped" }));
        setTrackerStatuses((prev) => {
          const existing = prev[liveTrackerId];
          if (existing == null) {
            return prev;
          }
          return { ...prev, [liveTrackerId]: { ...existing, status: "stopped" } };
        });
      }
    });

    return (): void => {
      stateSubscription.unsubscribe();
      statusSubscription.unsubscribe();
      connection.disconnect();
    };
  }, [activeTracker?.trackerId, individualLiveTrackerService, userId]);

  // Polling effect: refresh non-live tracker statuses on a fixed interval
  useEffect(() => {
    if (userId == null) {
      return;
    }

    const pollNonLiveTrackers = async (): Promise<void> => {
      const activeId = activeTrackerIdRef.current;
      const hasNonLive = runningTrackersRef.current.some((tracker) => tracker.trackerId !== activeId);

      if (!hasNonLive) {
        return;
      }

      const response = await individualLiveTrackerService.getTrackers(userId);
      setRunningTrackers(response.trackers.map((t) => ({ trackerId: t.trackerId, gamertag: t.gamertag })));
      setTrackerStatuses((prev) => ({ ...prev, ...response.statuses }));
    };

    const intervalId = setInterval(() => void pollNonLiveTrackers(), NON_LIVE_POLL_INTERVAL_MS);

    return (): void => {
      clearInterval(intervalId);
    };
  }, [userId, individualLiveTrackerService]);

  const startTracker = useCallback(
    async (gamertag?: string): Promise<IndividualTrackerState | null> => {
      setBusy(true);
      setErrorMessage(null);

      try {
        const result = await individualLiveTrackerService.startTracker({
          idleTimeoutHours: 1,
          ...(gamertag != null ? { gamertag } : {}),
        });

        if (!result.success) {
          setErrorMessage(result.error);
          return null;
        }

        setActiveTracker(result.state);
        setTrackerStatuses((prev) => ({ ...prev, [result.state.trackerId]: result.state }));
        await refresh();
        return result.state;
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to start tracker.");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [individualLiveTrackerService, refresh],
  );

  const stopTracker = useCallback(
    async (trackerId: string): Promise<void> => {
      setBusy(true);
      setErrorMessage(null);

      try {
        const result = await individualLiveTrackerService.stopTracker(trackerId);
        setActiveTracker(result.state);
        setTrackerStatuses((prev) => ({ ...prev, [result.state.trackerId]: result.state }));
        await refresh();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to stop tracker.");
      } finally {
        setBusy(false);
      }
    },
    [individualLiveTrackerService, refresh],
  );

  const pauseTracker = useCallback(
    async (trackerId: string): Promise<void> => {
      setBusy(true);
      setErrorMessage(null);

      try {
        const result = await individualLiveTrackerService.pauseTracker(trackerId);
        setTrackerStatuses((prev) => ({ ...prev, [result.state.trackerId]: result.state }));
        if (activeTracker?.trackerId === trackerId) {
          setActiveTracker(result.state);
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to pause tracker.");
      } finally {
        setBusy(false);
      }
    },
    [activeTracker?.trackerId, individualLiveTrackerService],
  );

  const resumeTracker = useCallback(
    async (trackerId: string): Promise<void> => {
      setBusy(true);
      setErrorMessage(null);

      try {
        const result = await individualLiveTrackerService.resumeTracker(trackerId);
        setTrackerStatuses((prev) => ({ ...prev, [result.state.trackerId]: result.state }));
        if (activeTracker?.trackerId === trackerId) {
          setActiveTracker(result.state);
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to resume tracker.");
      } finally {
        setBusy(false);
      }
    },
    [activeTracker?.trackerId, individualLiveTrackerService],
  );

  const selectLiveTracker = useCallback(
    async (trackerId: string): Promise<void> => {
      setBusy(true);
      setErrorMessage(null);

      try {
        await individualLiveTrackerService.selectLiveTracker(trackerId);
        await refresh();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to set live tracker.");
      } finally {
        setBusy(false);
      }
    },
    [individualLiveTrackerService, refresh],
  );

  const deleteTracker = useCallback(
    async (trackerId: string): Promise<void> => {
      if (!window.confirm("Delete this tracker? This cannot be undone.")) {
        return;
      }

      setBusy(true);
      setErrorMessage(null);

      try {
        await individualLiveTrackerService.deleteTracker(trackerId);
        if (activeTracker?.trackerId === trackerId) {
          setActiveTracker(null);
        }
        await refresh();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to delete tracker.");
      } finally {
        setBusy(false);
      }
    },
    [activeTracker?.trackerId, individualLiveTrackerService, refresh],
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
    () => buildTrackerList(xboxGamertag, activeTracker?.trackerId ?? null, runningTrackers, trackerStatuses),
    [xboxGamertag, activeTracker?.trackerId, runningTrackers, trackerStatuses],
  );

  const hasMultipleTrackers = trackerItems.length > 1;

  const getActions = useCallback(
    (item: TrackerListItem) => {
      const actions: { label: string; disabled?: boolean; destructive?: boolean; onClick: () => void }[] = [];

      if ((item.status === "not-started" || item.status === "stopped") && item.gamertag !== "") {
        actions.push({
          label: "Start tracker",
          disabled: busy,
          onClick: (): void => {
            void startTracker(item.gamertag !== xboxGamertag ? item.gamertag : undefined);
          },
        });
      }

      if (hasMultipleTrackers && !item.isLive) {
        actions.push({
          label: "Set as live",
          disabled: busy || item.trackerId == null,
          onClick: (): void => {
            if (item.trackerId != null) {
              void selectLiveTracker(item.trackerId);
            }
          },
        });
      }

      if (item.trackerId != null) {
        actions.push({
          label: "View tracker",
          onClick: (): void => {
            window.location.assign(`/individual-tracker?tracker=${item.trackerId ?? ""}`);
          },
        });
      }

      if (item.status === "active") {
        actions.push({
          label: "Pause",
          disabled: busy || item.trackerId == null,
          onClick: (): void => {
            if (item.trackerId != null) {
              void pauseTracker(item.trackerId);
            }
          },
        });
      }

      if (item.status === "paused") {
        actions.push({
          label: "Resume",
          disabled: busy || item.trackerId == null,
          onClick: (): void => {
            if (item.trackerId != null) {
              void resumeTracker(item.trackerId);
            }
          },
        });
      }

      if (item.status === "active" || item.status === "paused") {
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

      actions.push({
        label: "Game selection",
        disabled: item.status !== "active",
        onClick: (): void => {
          // Phase 4: wire game-selection sync dialog.
        },
      });

      actions.push({
        label: "Streamer settings",
        disabled: true,
        onClick: (): void => {
          // Phase 5: wire streamer settings overrides.
        },
      });

      if (!item.isPinned) {
        actions.push({
          label: "Delete tracker",
          destructive: true,
          disabled: busy || item.trackerId == null,
          onClick: (): void => {
            if (item.trackerId != null) {
              void deleteTracker(item.trackerId);
            }
          },
        });
      }

      return actions;
    },
    [
      busy,
      deleteTracker,
      hasMultipleTrackers,
      pauseTracker,
      resumeTracker,
      selectLiveTracker,
      startTracker,
      stopTracker,
      xboxGamertag,
    ],
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
              setIsAddDialogOpen(true);
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
    <>
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

      <AddTrackerDialog
        isOpen={isAddDialogOpen}
        busy={busy}
        onClose={(): void => {
          if (!busy) {
            setIsAddDialogOpen(false);
          }
        }}
        onSearchGamertag={async (query) => individualLiveTrackerService.searchGamertag(query)}
        onLoadMatches={async (xuid, start, count) => individualLiveTrackerService.getRecentMatches(xuid, start, count)}
        onStartTracker={async ({ gamertag, selectedMatchIds }): Promise<void> => {
          const state = await startTracker(gamertag);
          if (state == null) {
            return;
          }

          for (const matchId of selectedMatchIds) {
            await individualLiveTrackerService.addMatchToTracker(state.trackerId, matchId);
          }

          setIsAddDialogOpen(false);
          await refresh();
        }}
      />
    </>
  );
}
