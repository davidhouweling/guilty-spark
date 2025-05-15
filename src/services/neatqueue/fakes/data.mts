import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  NeatQueueJoinQueueRequest,
  NeatQueueLeaveQueueRequest,
  NeatQueueMatchCompletedRequest,
  NeatQueueMatchStartedRequest,
  NeatQueueSubstitutionRequest,
  NeatQueueTeamsCreatedRequest,
} from "../types.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function readFakeData<T>(filename: string): Promise<T> {
  const filePath = path.join(__dirname, "./data", filename);
  const fileContents = await readFile(filePath, "utf-8");
  return JSON.parse(fileContents) as T;
}

export const joinQueueData = await readFakeData<NeatQueueJoinQueueRequest>("join-queue.json");
export const leaveQueueData = await readFakeData<NeatQueueLeaveQueueRequest>("leave-queue.json");
export const matchStartedData = await readFakeData<NeatQueueMatchStartedRequest>("match-started.json");
export const teamsCreatedData = await readFakeData<NeatQueueTeamsCreatedRequest>("teams-created.json");
export const substitutionData = await readFakeData<NeatQueueSubstitutionRequest>("substitution.json");
export const matchCompletedData = await readFakeData<NeatQueueMatchCompletedRequest>("match-completed.json");
