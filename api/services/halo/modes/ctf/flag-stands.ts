import type { Quantum3 } from "../../positions/types";
import type { CtfFlagEvent } from "../../statborg/types";
import { FlagAxis, medianPosition } from "./flag-axis";
import type { PositionLookup } from "./position-lookup";

function carrierPositions(events: readonly CtfFlagEvent[], lookup: PositionLookup): Quantum3[] {
  const positions: Quantum3[] = [];
  for (const event of events) {
    const position = lookup.positionAt(event.xuid, event.timestampMs);
    if (position != null) {
      positions.push(position);
    }
  }
  return positions;
}

// a team that never captured scores at its own stand (the two coincide within a few quanta)
export class FlagStands {
  private readonly stands = new Map<number, Quantum3>();
  private readonly capturePoints = new Map<number, Quantum3>();

  constructor(flagEvents: readonly CtfFlagEvent[], teamIds: readonly number[], lookup: PositionLookup) {
    for (const teamId of teamIds) {
      const stealsOfThisFlag = flagEvents.filter((event) => event.kind === "steal" && event.teamId !== teamId);
      const ownCaptures = flagEvents.filter((event) => event.kind === "capture" && event.teamId === teamId);
      const stand = medianPosition(carrierPositions(stealsOfThisFlag, lookup));
      const capturePoint = medianPosition(carrierPositions(ownCaptures, lookup));
      if (stand != null) {
        this.stands.set(teamId, stand);
      }
      if (capturePoint != null) {
        this.capturePoints.set(teamId, capturePoint);
      }
    }
  }

  axisFor(flagTeamId: number, carrierTeamId: number): FlagAxis | null {
    const stand = this.stands.get(flagTeamId);
    const capturePoint = this.capturePoints.get(carrierTeamId) ?? this.stands.get(carrierTeamId);
    if (stand == null || capturePoint == null) {
      return null;
    }
    const axis = new FlagAxis(stand, capturePoint);
    return axis.isDegenerate ? null : axis;
  }

  standOf(flagTeamId: number): Quantum3 | null {
    return this.stands.get(flagTeamId) ?? null;
  }
}
