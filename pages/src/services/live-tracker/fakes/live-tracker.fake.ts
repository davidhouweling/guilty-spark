import type { LiveTrackerIdentity, LiveTrackerMessage } from "@guilty-spark/contracts/live-tracker/types";
import type {
  LiveTrackerConnection,
  LiveTrackerConnectionStatus,
  LiveTrackerListener,
  LiveTrackerService,
  LiveTrackerStatusListener,
  LiveTrackerSubscription,
} from "../types";
import type { LiveTrackerScenario } from "./scenario";

export type FakeLiveTrackerServiceMode = "interval" | "manual";

interface FakeLiveTrackerServiceOptions {
  readonly mode: FakeLiveTrackerServiceMode;
}

class FakeLiveTrackerConnection implements LiveTrackerConnection {
  private readonly messageListeners = new Set<LiveTrackerListener>();
  private readonly statusListeners = new Set<LiveTrackerStatusListener>();

  private readonly scenario: LiveTrackerScenario;
  private readonly mode: FakeLiveTrackerServiceMode;
  private intervalId: number | null = null;
  private frameIndex = 0;

  public constructor(scenario: LiveTrackerScenario, mode: FakeLiveTrackerServiceMode) {
    this.scenario = scenario;
    this.mode = mode;
  }

  public subscribe(listener: LiveTrackerListener): LiveTrackerSubscription {
    this.messageListeners.add(listener);
    return {
      unsubscribe: (): void => {
        this.messageListeners.delete(listener);
      },
    };
  }

  public subscribeStatus(listener: LiveTrackerStatusListener): LiveTrackerSubscription {
    this.statusListeners.add(listener);
    return {
      unsubscribe: (): void => {
        this.statusListeners.delete(listener);
      },
    };
  }

  public start(): void {
    this.emitStatus("connecting");
    this.emitStatus("connected");

    if (this.mode === "interval") {
      this.step();
      this.intervalId = window.setInterval((): void => {
        this.step();
      }, this.scenario.intervalMs);
    }
  }

  public step(): void {
    this.emitFrame();
  }

  public disconnect(): void {
    this.disconnectInternal({ emitDisconnectedStatus: true });
  }

  private disconnectInternal(options: { readonly emitDisconnectedStatus: boolean }): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (options.emitDisconnectedStatus) {
      this.emitStatus("disconnected");
    }

    this.messageListeners.clear();
    this.statusListeners.clear();
  }

  private emitStatus(status: LiveTrackerConnectionStatus, detail?: string): void {
    for (const listener of this.statusListeners) {
      listener(status, detail);
    }
  }

  private emitMessage(message: LiveTrackerMessage): void {
    for (const listener of this.messageListeners) {
      listener(message);
    }
  }

  private emitFrame(): void {
    if (this.frameIndex >= this.scenario.frames.length) {
      return;
    }

    const message = this.scenario.frames[this.frameIndex];
    this.frameIndex += 1;

    this.emitMessage(message);

    if (message.type === "stopped") {
      this.emitStatus("stopped");
      this.disconnectInternal({ emitDisconnectedStatus: false });
    }
  }
}

export class FakeLiveTrackerService implements LiveTrackerService {
  private readonly scenario: LiveTrackerScenario;
  private readonly options: FakeLiveTrackerServiceOptions;

  public constructor(scenario: LiveTrackerScenario, options?: Partial<FakeLiveTrackerServiceOptions>) {
    this.scenario = scenario;
    this.options = {
      mode: options?.mode ?? "interval",
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public connect(_identity: LiveTrackerIdentity): LiveTrackerConnection {
    const connection = new FakeLiveTrackerConnection(this.scenario, this.options.mode);

    queueMicrotask(() => {
      connection.start();
    });

    return connection;
  }
}
