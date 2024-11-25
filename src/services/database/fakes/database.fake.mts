import { aFakeEnvWith } from "../../../base/fakes/env.fake.mjs";
import { DatabaseService, DatabaseServiceOpts } from "../database.mjs";
import { AssociationReason, DiscordAssociationsRow, GamesRetrievable } from "../types/discord_associations.mjs";

export function aFakeDiscordAssociationsRow(opts: Partial<DiscordAssociationsRow> = {}): DiscordAssociationsRow {
  return {
    DiscordId: "DiscordId",
    XboxId: "XboxId",
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
