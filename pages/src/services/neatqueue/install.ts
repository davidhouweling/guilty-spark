import { getMode } from "../mode";
import { RealNeatQueueClientService } from "./neatqueue";
import type { NeatQueueClientService } from "./types";

export async function installNeatQueueClientService(apiHost: string): Promise<NeatQueueClientService> {
  if (getMode() === "FAKE") {
    const { aFakeNeatQueueClientServiceWith } = await import("./fakes/neatqueue.fake");
    return aFakeNeatQueueClientServiceWith();
  }

  return new RealNeatQueueClientService({ apiHost });
}
