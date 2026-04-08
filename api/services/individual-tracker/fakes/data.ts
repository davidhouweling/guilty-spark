import type { IndividualTrackerProfilesRow } from "../../database/types/individual_tracker_profiles";
import type { IndividualTrackerGamesRow } from "../../database/types/individual_tracker_games";

export function aFakeIndividualTrackerProfilesWith(
  opts: Partial<IndividualTrackerProfilesRow> = {},
): IndividualTrackerProfilesRow {
  const nowEpoch = Math.floor(Date.now() / 1000);

  const defaultOpts: IndividualTrackerProfilesRow = {
    ProfileId: "profile-1",
    UserId: "user-1",
    ActiveIdentityId: "identity-1",
    Name: "default",
    CreatedAt: nowEpoch,
    UpdatedAt: nowEpoch,
  };

  return {
    ...defaultOpts,
    ...opts,
  };
}

export function aFakeIndividualTrackerGamesWith(
  opts: Partial<IndividualTrackerGamesRow> = {},
): IndividualTrackerGamesRow {
  const nowEpoch = Math.floor(Date.now() / 1000);

  const defaultOpts: IndividualTrackerGamesRow = {
    ProfileId: "profile-1",
    MatchId: "match-1",
    Position: 1,
    Included: 1 as const,
    AnnotationsJson: "{}",
    CreatedAt: nowEpoch,
    UpdatedAt: nowEpoch,
  };

  return {
    ...defaultOpts,
    ...opts,
  };
}
