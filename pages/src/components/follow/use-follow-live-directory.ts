import { useCallback, useEffect, useRef, useState } from "react";
import type { TrackerDirectory } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import type { DirectoryConnectionStatus, FollowLiveService } from "../../services/follow/follow-types";

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

function findLiveTrackerId(directory: TrackerDirectory): string | null {
  for (const entry of directory.trackers) {
    if (entry.isLive) {
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

  const prevLiveTrackerIdRef = useRef<string | null>(null);
  const initialLoadDoneRef = useRef(false);

  useEffect(() => {
    let isCancelled = false;
    initialLoadDoneRef.current = false;
    prevLiveTrackerIdRef.current = null;
    setDirectory(null);
    setSelectedTrackerId(null);
    setIsFollowingLive(true);
    setDirectoryStatus("connecting");

    const connection = followLiveService.connectDirectory(gamertag);

    async function fetchDirectory(): Promise<void> {
      try {
        const dir = await followLiveService.getDirectory(gamertag);
        if (isCancelled) {
          return;
        }
        setDirectory(dir);
        const liveId = findLiveTrackerId(dir);
        prevLiveTrackerIdRef.current = liveId;
        setSelectedTrackerId(liveId);
        setDirectoryStatus("connected");
        initialLoadDoneRef.current = true;
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
      setDirectory(updatedDirectory);

      const newLiveId = findLiveTrackerId(updatedDirectory);
      const prevLiveId = prevLiveTrackerIdRef.current;

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
    });

    return (): void => {
      isCancelled = true;
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
    const liveId = dir != null ? findLiveTrackerId(dir) : null;
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
