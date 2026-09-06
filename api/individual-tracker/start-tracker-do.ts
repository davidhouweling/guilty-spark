import { individualTrackerStartContract } from "@guilty-spark/shared/contracts/durable-objects/individual-tracker/lifecycle";
import type {
  IndividualTrackerDoState,
  IndividualTrackerStartRequest,
} from "@guilty-spark/shared/contracts/durable-objects/individual-tracker/lifecycle";

export const DEFAULT_IDLE_TIMEOUT_HOURS = 6;

export function trackerDoStub(env: Env, userId: string, trackerId: string): DurableObjectStub {
  const doId = env.INDIVIDUAL_TRACKER_DO.idFromName(`${userId}:${trackerId}`);
  return env.INDIVIDUAL_TRACKER_DO.get(doId);
}

export function assertDoOk(response: Response): void {
  if (!response.ok) {
    throw new Error(`DO request failed with status ${response.status.toString()}`);
  }
}

export async function startTrackerDo(
  env: Env,
  startRequest: IndividualTrackerStartRequest,
): Promise<IndividualTrackerDoState> {
  const stub = trackerDoStub(env, startRequest.userId, startRequest.trackerId);
  const response = await stub.fetch("http://do/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(startRequest),
  });
  assertDoOk(response);
  const result = await individualTrackerStartContract.fromResponse(response);
  return result.state;
}
