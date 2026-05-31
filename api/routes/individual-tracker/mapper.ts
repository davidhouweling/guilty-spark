import type { TrackerProfile } from "@guilty-spark/shared/contracts/individual-tracker/profile";
import type { IndividualTrackerProfilesRow } from "../../services/database/types/individual_tracker_profiles";

export function toTrackerProfile(row: IndividualTrackerProfilesRow): TrackerProfile {
  return {
    profileId: row.ProfileId,
    activeIdentityId: row.ActiveIdentityId,
    name: row.Name,
  };
}
