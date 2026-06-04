import type { TrackerDirectory } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import type {
  DirectoryConnection,
  DirectoryConnectionStatus,
  DirectoryListener,
  DirectoryStatusListener,
  DirectorySubscription,
  FollowLiveService,
} from "../follow-types";

class FakeDirectoryConnection implements DirectoryConnection {
  private readonly listeners = new Set<DirectoryListener>();
  private readonly statusListeners = new Set<DirectoryStatusListener>();

  public subscribe(listener: DirectoryListener): DirectorySubscription {
    this.listeners.add(listener);
    return {
      unsubscribe: (): void => {
        this.listeners.delete(listener);
      },
    };
  }

  public subscribeStatus(listener: DirectoryStatusListener): DirectorySubscription {
    this.statusListeners.add(listener);
    return {
      unsubscribe: (): void => {
        this.statusListeners.delete(listener);
      },
    };
  }

  public disconnect(): void {
    this.listeners.clear();
    this.statusListeners.clear();
  }

  public emitDirectory(directory: TrackerDirectory): void {
    for (const listener of this.listeners) {
      listener(directory);
    }
  }

  public emitStatus(status: DirectoryConnectionStatus, detail?: string): void {
    for (const listener of this.statusListeners) {
      listener(status, detail);
    }
  }
}

export class FakeFollowLiveService implements FollowLiveService {
  private readonly directory: TrackerDirectory;
  public lastConnection: FakeDirectoryConnection | null = null;

  public constructor(options?: { readonly directory?: TrackerDirectory }) {
    this.directory = options?.directory ?? { trackers: [] };
  }

  public async getDirectory(): Promise<TrackerDirectory> {
    return Promise.resolve(this.directory);
  }

  public connectDirectory(): DirectoryConnection {
    const connection = new FakeDirectoryConnection();
    this.lastConnection = connection;
    return connection;
  }
}

export function aFakeFollowLiveServiceWith(opts: { directory?: TrackerDirectory } = {}): FakeFollowLiveService {
  return new FakeFollowLiveService(opts);
}
