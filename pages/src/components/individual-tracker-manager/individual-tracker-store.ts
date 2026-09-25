export type IndividualTrackerAuthState = "loading" | "unauthenticated" | "authenticated";

export interface IndividualTrackerSnapshot {
  readonly authState: IndividualTrackerAuthState;
  readonly errorMessage: string | null;
  readonly gamertag: string | null;
}

export class IndividualTrackerStore {
  public snapshot: IndividualTrackerSnapshot = {
    authState: "loading",
    errorMessage: null,
    gamertag: null,
  };
  public readonly subscribers = new Set<() => void>();
}
