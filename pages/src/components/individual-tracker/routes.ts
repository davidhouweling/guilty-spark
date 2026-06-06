export type IndividualTrackerAppRoute =
  | {
      readonly kind: "manage";
    }
  | {
      readonly kind: "view-active";
    }
  | {
      readonly kind: "view-tracker";
      readonly trackerId: string;
    };

export function buildIndividualTrackerManagePath(): string {
  return "/";
}

export function buildIndividualTrackerActiveViewPath(): string {
  return "/active";
}

export function buildIndividualTrackerTrackerViewPath(trackerId: string): string {
  return `/tracker/${encodeURIComponent(trackerId)}`;
}

export function buildIndividualTrackerPublicViewPath(gamertag: string): string {
  return `/u/${encodeURIComponent(gamertag)}/view`;
}

export function buildIndividualTrackerPublicOverlayPath(gamertag: string): string {
  return `/u/${encodeURIComponent(gamertag)}/overlay`;
}
