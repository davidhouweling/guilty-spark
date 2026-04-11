import React, { useCallback, useEffect, useMemo, useState } from "react";
import classNames from "classnames";
import type { IndividualTrackerState } from "@guilty-spark/shared/individual-tracker/types";
import type { Services } from "../../services/types";
import { Button } from "../button/button";
import { Input } from "../input/input";
import { Container } from "../container/container";
import { SettingsShell, type SettingsShellItem } from "../settings-shell/settings-shell";
import type { IndividualTrackerGame, IndividualTrackerProfile } from "../../services/individual-tracker/types";
import styles from "./individual-tracker.module.css";

type IndividualTrackerSectionId = "tracker" | "profile" | "games";

type AuthState = "loading" | "authenticated" | "unauthenticated";

interface IndividualTrackerViewProps {
  readonly services: Services;
}

interface StartResult {
  readonly state: IndividualTrackerState;
}

function toIsoFromLocalDateTime(value: string): string | undefined {
  if (value === "") {
    return undefined;
  }

  const asDate = new Date(value);
  if (Number.isNaN(asDate.getTime())) {
    return undefined;
  }

  return asDate.toISOString();
}

function toLocalDateTime(iso: string): string {
  const asDate = new Date(iso);
  if (Number.isNaN(asDate.getTime())) {
    return "";
  }

  const pad = (num: number): string => String(num).padStart(2, "0");
  return `${asDate.getFullYear().toString()}-${pad(asDate.getMonth() + 1)}-${pad(asDate.getDate())}T${pad(asDate.getHours())}:${pad(asDate.getMinutes())}`;
}

function formatStatus(value: IndividualTrackerState["status"] | null): string {
  if (value === null) {
    return "Not running";
  }

  switch (value) {
    case "active": {
      return "Active";
    }
    case "paused": {
      return "Paused";
    }
    case "stopped": {
      return "Stopped";
    }
    default: {
      return value;
    }
  }
}

export function IndividualTrackerView({ services }: IndividualTrackerViewProps): React.ReactElement {
  const { authService, individualTrackerService, individualLiveTrackerService } = services;

  const [authState, setAuthState] = useState<AuthState>("loading");
  const [activeSection, setActiveSection] = useState<IndividualTrackerSectionId>("tracker");
  const [userId, setUserId] = useState<string | null>(null);

  const [profile, setProfile] = useState<IndividualTrackerProfile | null>(null);
  const [games, setGames] = useState<IndividualTrackerGame[]>([]);
  const [activeTracker, setActiveTracker] = useState<IndividualTrackerState | null>(null);

  const [profileNameInput, setProfileNameInput] = useState("");
  const [searchStartInput, setSearchStartInput] = useState("");
  const [idleTimeoutHours, setIdleTimeoutHours] = useState(1);
  const [matchIdInput, setMatchIdInput] = useState("");

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState("disconnected");

  const menuItems: readonly SettingsShellItem[] = useMemo(
    () => [
      {
        id: "tracker",
        label: "Tracker Runtime",
        description: "Start, stop, and monitor your current tracker session.",
      },
      {
        id: "profile",
        label: "Profile",
        description: "Manage your tracker profile and linked identity selection.",
      },
      {
        id: "games",
        label: "Game Curation",
        description: "Add or remove matches from your tracked game list.",
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
        setProfile(null);
        setGames([]);
        setActiveTracker(null);
        return;
      }

      setAuthState("authenticated");
      setUserId(session.userId);

      const [profileResponse, statusResponse] = await Promise.all([
        individualTrackerService.getProfile(),
        individualLiveTrackerService.getStatus(),
      ]);

      setProfile(profileResponse.profile);
      setGames(profileResponse.games);
      setProfileNameInput(profileResponse.profile?.Name ?? "");
      setActiveTracker(statusResponse.activeTracker);
      if (statusResponse.activeTracker != null) {
        setSearchStartInput(toLocalDateTime(statusResponse.activeTracker.searchStartTime));
        setIdleTimeoutHours(statusResponse.activeTracker.idleTimeoutHours);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load individual tracker.");
    } finally {
      setLoading(false);
    }
  }, [authService, individualLiveTrackerService, individualTrackerService]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (userId == null || activeTracker == null) {
      setConnectionState("disconnected");
      return;
    }

    const connection = individualLiveTrackerService.connectToTracker(userId, activeTracker.trackerId);
    const stateSubscription = connection.subscribe((state) => {
      setActiveTracker(state);
    });

    const statusSubscription = connection.subscribeStatus((status) => {
      setConnectionState(status);
      if (status === "error" || status === "disconnected") {
        setBannerMessage("Live updates disconnected. Data may be stale.");
      }
    });

    return (): void => {
      stateSubscription.unsubscribe();
      statusSubscription.unsubscribe();
      connection.disconnect();
    };
  }, [activeTracker?.trackerId, individualLiveTrackerService, userId]);

  const startTracker = useCallback(async (): Promise<void> => {
    setBusy(true);
    setErrorMessage(null);
    setBannerMessage(null);

    try {
      const searchStartTime = toIsoFromLocalDateTime(searchStartInput);
      const result = await individualLiveTrackerService.startTracker({
        idleTimeoutHours,
        searchStartTime,
      });

      if (!result.success) {
        setErrorMessage(result.error);
        return;
      }

      const payload: StartResult = {
        state: result.state,
      };

      setActiveTracker(payload.state);
      setBannerMessage("Tracker started.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to start tracker.");
    } finally {
      setBusy(false);
    }
  }, [idleTimeoutHours, individualLiveTrackerService, searchStartInput]);

  const stopTracker = useCallback(async (): Promise<void> => {
    if (activeTracker == null) {
      return;
    }

    setBusy(true);
    setErrorMessage(null);

    try {
      const result = await individualLiveTrackerService.stopTracker(activeTracker.trackerId);
      setActiveTracker(result.state);
      setBannerMessage("Tracker stopped.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to stop tracker.");
    } finally {
      setBusy(false);
    }
  }, [activeTracker, individualLiveTrackerService]);

  const saveProfile = useCallback(async (): Promise<void> => {
    setBusy(true);
    setErrorMessage(null);

    try {
      if (profile == null) {
        const created = await individualTrackerService.createProfile({ name: profileNameInput });
        setProfile(created.profile);
        setBannerMessage("Profile created.");
      } else {
        const updated = await individualTrackerService.updateProfile({
          profileId: profile.ProfileId,
          name: profileNameInput,
        });
        setProfile(updated.profile);
        setBannerMessage("Profile updated.");
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save profile.");
    } finally {
      setBusy(false);
    }
  }, [individualTrackerService, profile, profileNameInput]);

  const addGame = useCallback(async (): Promise<void> => {
    if (profile == null || matchIdInput === "") {
      return;
    }

    setBusy(true);
    setErrorMessage(null);

    try {
      const response = await individualTrackerService.addGame({
        profileId: profile.ProfileId,
        matchId: matchIdInput,
      });
      setGames(response.games);
      setMatchIdInput("");
      setBannerMessage("Game added.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to add game.");
    } finally {
      setBusy(false);
    }
  }, [individualTrackerService, matchIdInput, profile]);

  const removeGame = useCallback(async (): Promise<void> => {
    if (profile == null || matchIdInput === "") {
      return;
    }

    setBusy(true);
    setErrorMessage(null);

    try {
      const response = await individualTrackerService.removeGame({
        profileId: profile.ProfileId,
        matchId: matchIdInput,
      });
      setGames(response.games);
      setMatchIdInput("");
      setBannerMessage("Game removed.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to remove game.");
    } finally {
      setBusy(false);
    }
  }, [individualTrackerService, matchIdInput, profile]);

  const signIn = useCallback(async (): Promise<void> => {
    setErrorMessage(null);

    try {
      const { authUrl } = await authService.startMicrosoftAuth("/individual-tracker");
      window.location.assign(authUrl);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to start Microsoft sign-in.");
    }
  }, [authService]);

  let panelBody: React.ReactNode;
  if (activeSection === "tracker") {
    panelBody = (
      <div className={styles.sectionBody}>
        <h2 className={styles.sectionTitle}>Tracker Runtime</h2>
        <p className={styles.sectionDescription}>Manage the runtime session for your individual live tracker.</p>

        <div className={styles.controlsGrid}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Idle timeout</span>
            <select
              value={idleTimeoutHours.toString()}
              onChange={(event): void => {
                setIdleTimeoutHours(Number(event.currentTarget.value));
              }}
              className={styles.select}
            >
              {[1, 2, 3, 4, 5, 6].map((value) => (
                <option key={value.toString()} value={value.toString()}>
                  {value.toString()}h
                </option>
              ))}
            </select>
          </label>

          <Input
            type="datetime-local"
            label="Search start time"
            value={searchStartInput}
            onChange={(event): void => {
              setSearchStartInput(event.currentTarget.value);
            }}
            hint="Optional. Defaults to now if empty."
          />
        </div>

        <div className={styles.actionsRow}>
          <Button onClick={(): void => void startTracker()} disabled={busy}>
            Start Tracker
          </Button>
          <Button variant="secondary" onClick={(): void => void stopTracker()} disabled={busy || activeTracker == null}>
            Stop Tracker
          </Button>
          <Button variant="secondary" onClick={(): void => void refresh()} disabled={busy || loading}>
            Refresh Status
          </Button>
        </div>

        <div className={styles.statusCard}>
          <div className={styles.statusItem}>
            <span className={styles.statusLabel}>Tracker status</span>
            <span className={styles.statusValue}>{formatStatus(activeTracker?.status ?? null)}</span>
          </div>
          <div className={styles.statusItem}>
            <span className={styles.statusLabel}>Connection</span>
            <span className={styles.statusValue}>{connectionState}</span>
          </div>
          <div className={styles.statusItem}>
            <span className={styles.statusLabel}>Gamertag</span>
            <span className={styles.statusValue}>{activeTracker?.gamertag ?? "-"}</span>
          </div>
          <div className={styles.statusItem}>
            <span className={styles.statusLabel}>Tracked matches</span>
            <span className={styles.statusValue}>{activeTracker?.matchIds.length.toString() ?? "0"}</span>
          </div>
        </div>
      </div>
    );
  } else if (activeSection === "profile") {
    panelBody = (
      <div className={styles.sectionBody}>
        <h2 className={styles.sectionTitle}>Profile</h2>
        <p className={styles.sectionDescription}>Create or update your persisted profile settings.</p>

        <Input
          label="Profile name"
          value={profileNameInput}
          onChange={(event): void => {
            setProfileNameInput(event.currentTarget.value);
          }}
          placeholder="My stream profile"
        />

        <div className={styles.actionsRow}>
          <Button onClick={(): void => void saveProfile()} disabled={busy || profileNameInput.trim() === ""}>
            {profile == null ? "Create Profile" : "Update Profile"}
          </Button>
        </div>

        <div className={styles.statusCard}>
          <div className={styles.statusItem}>
            <span className={styles.statusLabel}>Profile ID</span>
            <span className={classNames(styles.statusValue, styles.codeLike)}>{profile?.ProfileId ?? "-"}</span>
          </div>
          <div className={styles.statusItem}>
            <span className={styles.statusLabel}>User ID</span>
            <span className={classNames(styles.statusValue, styles.codeLike)}>{profile?.UserId ?? userId ?? "-"}</span>
          </div>
        </div>
      </div>
    );
  } else {
    panelBody = (
      <div className={styles.sectionBody}>
        <h2 className={styles.sectionTitle}>Game Curation</h2>
        <p className={styles.sectionDescription}>Add or remove games in your profile game list by match ID.</p>

        <Input
          label="Match ID"
          value={matchIdInput}
          onChange={(event): void => {
            setMatchIdInput(event.currentTarget.value);
          }}
          placeholder="4f266d3c-..."
        />

        <div className={styles.actionsRow}>
          <Button onClick={(): void => void addGame()} disabled={busy || profile == null || matchIdInput.trim() === ""}>
            Add Game
          </Button>
          <Button
            variant="secondary"
            onClick={(): void => void removeGame()}
            disabled={busy || profile == null || matchIdInput.trim() === ""}
          >
            Remove Game
          </Button>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.gamesTable}>
            <thead>
              <tr>
                <th scope="col">Match ID</th>
                <th scope="col">Position</th>
                <th scope="col">Included</th>
              </tr>
            </thead>
            <tbody>
              {games.length === 0 ? (
                <tr>
                  <td colSpan={3} className={styles.emptyCell}>
                    No games configured.
                  </td>
                </tr>
              ) : (
                games.map((game) => (
                  <tr key={game.MatchId}>
                    <td className={styles.codeLike}>{game.MatchId}</td>
                    <td>{game.Position.toString()}</td>
                    <td>{game.Included === 1 ? "Yes" : "No"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <Container className={styles.pageContainer}>
      {loading ? (
        <div className={styles.loadingBox}>Loading individual tracker...</div>
      ) : authState === "unauthenticated" ? (
        <section className={styles.authBox}>
          <h1 className={styles.authTitle}>Sign in required</h1>
          <p className={styles.authSubtitle}>
            You need a Microsoft session before you can manage an individual tracker.
          </p>
          <Button onClick={(): void => void signIn()}>Sign in with Microsoft</Button>
          {errorMessage != null && <p className={styles.errorText}>{errorMessage}</p>}
        </section>
      ) : (
        <>
          {bannerMessage != null && <p className={styles.banner}>{bannerMessage}</p>}
          {errorMessage != null && <p className={styles.errorText}>{errorMessage}</p>}

          <SettingsShell
            title="Individual Tracker"
            subtitle="Use the menu to the left to configure profile, runtime settings, and game curation controls."
            items={menuItems}
            activeItemId={activeSection}
            onSelectItem={(value): void => {
              if (value === "tracker" || value === "profile" || value === "games") {
                setActiveSection(value);
              }
            }}
          >
            {panelBody}
          </SettingsShell>
        </>
      )}
    </Container>
  );
}
