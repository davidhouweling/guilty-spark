import { aFakeEnvWith } from "../../../base/fakes/env.fake.mjs";
import type { DatabaseServiceOpts } from "../database.mjs";
import { DatabaseService } from "../database.mjs";
import type { DiscordAssociationsRow } from "../types/discord_associations.mjs";
import { AssociationReason, GamesRetrievable } from "../types/discord_associations.mjs";

export function aFakeDiscordAssociationsRow(opts: Partial<DiscordAssociationsRow> = {}): DiscordAssociationsRow {
  return {
    DiscordId: "discord_user_01",
    XboxId: "0000000000001",
    AssociationReason: AssociationReason.USERNAME_SEARCH,
    AssociationDate: new Date("2024-09-01T00:00:00.000Z").getTime(),
    GamesRetrievable: GamesRetrievable.YES,
    ...opts,
  };
}

export function aFakeDatabaseServiceWith(opts: Partial<DatabaseServiceOpts> = {}): DatabaseService {
  return new DatabaseService({
    env: aFakeEnvWith(),
    ...opts,
  });
}
