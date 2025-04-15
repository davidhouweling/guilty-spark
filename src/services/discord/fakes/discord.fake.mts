import { aFakeEnvWith } from "../../../base/fakes/env.fake.mjs";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake.mjs";
import type { DiscordServiceOpts } from "../discord.mjs";
import { DiscordService } from "../discord.mjs";

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
