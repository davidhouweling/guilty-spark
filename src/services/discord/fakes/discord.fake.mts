import { aFakeEnvWith } from "../../../base/fakes/env.fake.mjs";
import type { DiscordServiceOpts } from "../discord.mjs";
import { DiscordService } from "../discord.mjs";

export function aFakeDiscordServiceWith(opts: Partial<DiscordServiceOpts> = {}): DiscordService {
  return new DiscordService({
    env: aFakeEnvWith(),
    fetch: () => Promise.resolve(new Response()),
    verifyKey: () => Promise.resolve(true),
    ...opts,
  });
}
