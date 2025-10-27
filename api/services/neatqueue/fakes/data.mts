import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  NeatQueueJoinQueueRequest,
  NeatQueueLeaveQueueRequest,
  NeatQueueMatchCancelledRequest,
  NeatQueueMatchCompletedRequest,
  NeatQueueMatchStartedRequest,
  NeatQueueSubstitutionRequest,
  NeatQueueTeamsCreatedRequest,
} from "../types.mjs";
import { UnreachableError } from "../../../base/unreachable-error.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function readFakeData<T>(filename: string): Promise<T> {
  const filePath = path.join(__dirname, "./data", filename);
  const fileContents = await readFile(filePath, "utf-8");
  return JSON.parse(fileContents) as T;
}

type NeatQueueEvent =
  | "joinQueue"
  | "leaveQueue"
  | "matchStarted"
  | "teamsCreated"
  | "substitution"
  | "matchCompleted"
  | "matchCancelled";

interface NeatQueueEventDataMap {
  joinQueue: NeatQueueJoinQueueRequest;
  leaveQueue: NeatQueueLeaveQueueRequest;
  matchStarted: NeatQueueMatchStartedRequest;
  teamsCreated: NeatQueueTeamsCreatedRequest;
  substitution: NeatQueueSubstitutionRequest;
  matchCompleted: NeatQueueMatchCompletedRequest;
  matchCancelled: NeatQueueMatchCancelledRequest;
}

const joinQueueData = await readFakeData<NeatQueueJoinQueueRequest>("join-queue.json");
const leaveQueueData = await readFakeData<NeatQueueLeaveQueueRequest>("leave-queue.json");
const matchStartedData = await readFakeData<NeatQueueMatchStartedRequest>("match-started.json");
const teamsCreatedData = await readFakeData<NeatQueueTeamsCreatedRequest>("teams-created.json");
const substitutionData = await readFakeData<NeatQueueSubstitutionRequest>("substitution.json");
const matchCompletedData = await readFakeData<NeatQueueMatchCompletedRequest>("match-completed.json");
const matchCancelledData = await readFakeData<NeatQueueMatchCancelledRequest>("match-cancelled.json");

export function getFakeNeatQueueData<E extends NeatQueueEvent>(event: E): NeatQueueEventDataMap[E] {
  switch (event) {
    case "joinQueue":
      return structuredClone(joinQueueData) as NeatQueueEventDataMap[E];
    case "leaveQueue":
      return structuredClone(leaveQueueData) as NeatQueueEventDataMap[E];
    case "matchStarted":
      return structuredClone(matchStartedData) as NeatQueueEventDataMap[E];
    case "teamsCreated":
      return structuredClone(teamsCreatedData) as NeatQueueEventDataMap[E];
    case "substitution":
      return structuredClone(substitutionData) as NeatQueueEventDataMap[E];
    case "matchCompleted":
      return structuredClone(matchCompletedData) as NeatQueueEventDataMap[E];
    case "matchCancelled":
      return structuredClone(matchCancelledData) as NeatQueueEventDataMap[E];
    default:
      throw new UnreachableError(event);
  }
}
