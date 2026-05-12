import { createHaloInfiniteClientProxy } from "@guilty-spark/shared/halo/halo-infinite-client-proxy";
import { RealAuthService } from "./auth/auth";
import { RealLiveTrackerService } from "./live-tracker/live-tracker";
import { RealIndividualTrackerService } from "./individual-tracker/individual-tracker";
import type { Services } from "./types";

export type PagesMode = "REAL" | "FAKE";

function getMode(): PagesMode {
  const mode = import.meta.env.MODE;
  const normalized = mode.toLowerCase();
  return normalized === "fake" || normalized === "test" ? "FAKE" : "REAL";
}

interface InstallServicesOpts {
  readonly trackerXuid?: string;
}

export async function installServices(apiHost: string, opts: InstallServicesOpts = {}): Promise<Services> {
  const { trackerXuid } = opts;
  const mode = getMode();

  if (mode === "FAKE") {
    return import("./install.fake").then(async ({ installFakeServices }) => installFakeServices());
  }

  let latestSpartanToken: string | null = null;

  const authService = new RealAuthService({
    apiHost,
    onSessionResolved: (session): void => {
      latestSpartanToken = session.spartanToken ?? null;
    },
  });

  const haloInfiniteClient = createHaloInfiniteClientProxy({
    proxyBaseUrl: apiHost,
    credentials: "include",
    additionalHeaders: () => {
      const headers = new Headers();
      if (latestSpartanToken == null || latestSpartanToken === "") {
        return headers;
      }

      headers.set("x-343-authorization-spartan", latestSpartanToken);
      return headers;
    },
    ...(trackerXuid != null ? { additionalQueryParams: { trackerXuid } } : {}),
  });

  return {
    authService,
    liveTrackerService: new RealLiveTrackerService({ apiHost }),
    individualTrackerService: new RealIndividualTrackerService({ apiHost, haloInfiniteClient }),
  };
}
