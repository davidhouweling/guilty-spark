export type StreamOverlayAuthState = "loading" | "unauthenticated" | "authenticated";

export interface StreamOverlaySnapshot {
  readonly authState: StreamOverlayAuthState;
  readonly gamertag: string | null;
  readonly avatarUrl: string | null;
}

export class StreamOverlayStore {
  public snapshot: StreamOverlaySnapshot = {
    authState: "loading",
    gamertag: null,
    avatarUrl: null,
  };
  public readonly subscribers = new Set<() => void>();
}
