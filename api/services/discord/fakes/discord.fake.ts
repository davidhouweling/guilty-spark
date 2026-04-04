import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake";
import type { DiscordServiceOpts } from "../discord";
import { DiscordService } from "../discord";

async function fakeFetch(): Promise<Response> {
  return Promise.resolve(new Response());
}
async function fakeVerifyKey(): Promise<boolean> {
  return Promise.resolve(true);
}

export function aFakeDiscordServiceWith(opts: Partial<DiscordServiceOpts> = {}): DiscordService {
  const env = opts.env ?? aFakeEnvWith();
  const logService = opts.logService ?? aFakeLogServiceWith();
  const fetch = opts.fetch ?? fakeFetch;
  const verifyKey = opts.verifyKey ?? fakeVerifyKey;

  return new DiscordService({
    env,
    logService,
    fetch,
    verifyKey,
    ...opts,
  });
}
