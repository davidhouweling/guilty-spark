/**
 * Shared bootstrap for the analysis scripts in this folder: installs the Workers cache shim
 * and wires the Halo service graph against the file-backed KV namespace.
 */
import "dotenv/config";
import path from "node:path";

if (typeof caches === "undefined") {
  /* eslint-disable @typescript-eslint/promise-function-async */
  (globalThis as unknown as Record<string, unknown>)["caches"] = {
    default: {
      match: (): Promise<undefined> => Promise.resolve(undefined),
      put: (): Promise<void> => Promise.resolve(),
      delete: (): Promise<boolean> => Promise.resolve(false),
    },
  };
  /* eslint-enable @typescript-eslint/promise-function-async */
}

import { fileURLToPath } from "node:url";
import { authenticate } from "@xboxreplay/xboxlive-auth";
import { aFakeEnvWith } from "../base/fakes/env.fake";
import { aFakeDatabaseServiceWith } from "../services/database/fakes/database.fake";
import { aFakeLogServiceWith } from "../services/log/fakes/log.fake";
import { aFakePlayerMatchesRateLimiterWith } from "../services/halo/fakes/player-matches-rate-limiter.fake";
import { createFileBackedKVNamespace } from "../base/fakes/namespace-to-file";
import { createHaloInfiniteClientProxy } from "../services/halo/halo-infinite-client-proxy";
import { HaloService } from "../services/halo/halo";
import { XboxService } from "../services/xbox/xbox";
import { CustomSpartanTokenProvider } from "../services/halo/custom-spartan-token-provider";
import { HaloFilmService } from "../services/halo/halo-film";

export interface ScriptServices {
  haloService: HaloService;
  haloFilmService: HaloFilmService;
  databaseService: ReturnType<typeof aFakeDatabaseServiceWith>;
  logService: ReturnType<typeof aFakeLogServiceWith>;
}

export async function createScriptServices(): Promise<ScriptServices> {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const fakeNamespace = await createFileBackedKVNamespace(path.join(__dirname, "app-data.json"));
  const env = aFakeEnvWith({
    APP_DATA: fakeNamespace,
    XBOX_USERNAME: process.env.XBOX_USERNAME,
    XBOX_PASSWORD: process.env.XBOX_PASSWORD,
  });
  const xboxService = new XboxService({ env, authenticate });
  const databaseService = aFakeDatabaseServiceWith();
  const logService = aFakeLogServiceWith();
  const haloService = new HaloService({
    env,
    logService,
    databaseService,
    xboxService,
    infiniteClient: createHaloInfiniteClientProxy({ env }),
    playerMatchesRateLimiter: aFakePlayerMatchesRateLimiterWith(),
  });
  const haloFilmService = new HaloFilmService({
    env,
    spartanTokenProvider: new CustomSpartanTokenProvider({ env, xboxService }),
  });
  return { haloService, haloFilmService, databaseService, logService };
}

export function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60).toString()}:${(s % 60).toString().padStart(2, "0")}`;
}
