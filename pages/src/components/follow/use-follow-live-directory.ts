import { useCallback, useEffect, useRef, useState } from "react";
import type { TrackerDirectory } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import type { DirectoryConnectionStatus, FollowLiveService } from "../../services/follow/follow-types";
import { getReconnectDelayMs } from "../../services/base/reconnect-policy";

export interface UseFollowLiveDirectoryOpts {
  readonly followLiveService: FollowLiveService;
  readonly gamertag: string;
}

export interface FollowLiveDirectoryResult {
  readonly directory: TrackerDirectory | null;
  readonly directoryStatus: DirectoryConnectionStatus;
  readonly selectedTrackerId: string | null;
  readonly isFollowingLive: boolean;
  readonly onSelectTracker: (trackerId: string) => void;
  readonly onFollowLive: () => void;
  readonly onRetry: () => void;
}

function findPreferredTrackerId(directory: TrackerDirectory): string | null {
  if (directory.liveTrackerId != null) {
    const liveTracker = directory.trackers.find((entry) => entry.trackerId === directory.liveTrackerId);
    if (liveTracker != null) {
      return liveTracker.trackerId;
    }
  }

  for (const entry of directory.trackers) {
    if (entry.status === "active") {
      return entry.trackerId;
    }
  }

  return null;
}

export function useFollowLiveDirectory({
  followLiveService,
  gamertag,
}: UseFollowLiveDirectoryOpts): FollowLiveDirectoryResult {
  const [directory, setDirectory] = useState<TrackerDirectory | null>(null);
  const [directoryStatus, setDirectoryStatus] = useState<DirectoryConnectionStatus>("connecting");
  const [selectedTrackerId, setSelectedTrackerId] = useState<string | null>(null);
  const [isFollowingLive, setIsFollowingLive] = useState(true);
  const [retryCount, setRetryCount] = useState(0);

  // Refs let WS callbacks and action handlers read current values without
  // stale closures and without calling state setters inside updater functions.
  const isFollowingLiveRef = useRef(isFollowingLive);
  isFollowingLiveRef.current = isFollowingLive;
  const directoryRef = useRef(directory);
  directoryRef.current = directory;
  const selectedTrackerIdRef = useRef(selectedTrackerId);
  selectedTrackerIdRef.current = selectedTrackerId;

  const prevLiveTrackerIdRef = useRef<string | null>(null);
  const initialLoadDoneRef = useRef(false);
  const previousGamertagRef = useRef<string | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let isCancelled = false;
    const hasGamertagChanged = previousGamertagRef.current !== gamertag;
    previousGamertagRef.current = gamertag;

    initialLoadDoneRef.current = false;
    prevLiveTrackerIdRef.current = null;
    if (hasGamertagChanged) {
      setDirectory(null);
      setSelectedTrackerId(null);
      setIsFollowingLive(true);
    }
    setDirectoryStatus("connecting");

    const connection = followLiveService.connectDirectory(gamertag);

    function resetReconnectState(): void {
      reconnectAttemptRef.current = 0;
      if (reconnectTimerRef.current != null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    }

    function scheduleReconnect(): void {
      if (reconnectTimerRef.current != null) {
        return;
      }

      const delay = getReconnectDelayMs(reconnectAttemptRef.current);
      reconnectAttemptRef.current += 1;
      reconnectTimerRef.current = setTimeout(() => {
        if (isCancelled) {
          reconnectTimerRef.current = null;
          return;
        }
        reconnectTimerRef.current = null;
        setRetryCount((current) => current + 1);
      }, delay);
    }

    async function fetchDirectory(): Promise<void> {
      try {
        const dir = await followLiveService.getDirectory(gamertag);
        if (isCancelled) {
          return;
        }
        setDirectory(dir);
        const liveId = findPreferredTrackerId(dir);
        prevLiveTrackerIdRef.current = liveId;
        const selectedId = selectedTrackerIdRef.current;
        const selectedExists = selectedId != null && dir.trackers.some((tracker) => tracker.trackerId === selectedId);
        const shouldAdoptPreferredTracker =
          hasGamertagChanged || selectedId == null || isFollowingLiveRef.current || !selectedExists;

        if (shouldAdoptPreferredTracker) {
          setSelectedTrackerId(liveId);
          setIsFollowingLive(true);
        }
        setDirectoryStatus("connected");
        initialLoadDoneRef.current = true;
        resetReconnectState();
      } catch {
        if (isCancelled) {
          return;
        }
        setDirectoryStatus("error");
        initialLoadDoneRef.current = true;
      }
    }

    void fetchDirectory();

    const dirSubscription = connection.subscribe((updatedDirectory) => {
      if (isCancelled || !initialLoadDoneRef.current) {
        return;
      }

      // A valid directory payload indicates the connection is healthy.
      setDirectoryStatus("connected");
      resetReconnectState();

      setDirectory(updatedDirectory);

      const newLiveId = findPreferredTrackerId(updatedDirectory);
      const prevLiveId = prevLiveTrackerIdRef.current;
      const selectedId = selectedTrackerIdRef.current;
      const selectedExists =
        selectedId != null && updatedDirectory.trackers.some((tracker) => tracker.trackerId === selectedId);

      if (!selectedExists) {
        setSelectedTrackerId(newLiveId);
        setIsFollowingLive(true);
        prevLiveTrackerIdRef.current = newLiveId;
        return;
      }

      if (isFollowingLiveRef.current && newLiveId !== prevLiveId) {
        setSelectedTrackerId(newLiveId);
      }
      prevLiveTrackerIdRef.current = newLiveId;
    });

    const statusSubscription = connection.subscribeStatus((status) => {
      if (isCancelled) {
        return;
      }

      setDirectoryStatus(status);

      if (status === "connected") {
        resetReconnectState();
        return;
      }

      if (status === "error" || status === "disconnected") {
        scheduleReconnect();
      }
    });

    return (): void => {
      isCancelled = true;
      if (reconnectTimerRef.current != null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      dirSubscription.unsubscribe();
      statusSubscription.unsubscribe();
      connection.disconnect();
    };
  }, [followLiveService, gamertag, retryCount]);

  const onSelectTracker = useCallback((trackerId: string): void => {
    const dir = directoryRef.current;
    const entry = dir?.trackers.find((t) => t.trackerId === trackerId);
    const entryIsLive = entry?.isLive === true;
    setSelectedTrackerId(trackerId);
    setIsFollowingLive(entryIsLive);
  }, []);

  const onFollowLive = useCallback((): void => {
    const dir = directoryRef.current;
    const liveId = dir != null ? findPreferredTrackerId(dir) : null;
    setIsFollowingLive(true);
    if (liveId != null) {
      setSelectedTrackerId(liveId);
    }
  }, []);

  const onRetry = useCallback((): void => {
    setRetryCount((c) => c + 1);
  }, []);

  return {
    directory,
    directoryStatus,
    selectedTrackerId,
    isFollowingLive,
    onSelectTracker,
    onFollowLive,
    onRetry,
  };
}
