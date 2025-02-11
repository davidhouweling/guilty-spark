import type { DiscordAssociationsRow } from "./types/discord_associations.mjs";

export interface DatabaseServiceOpts {
  env: Env;
}

export class DatabaseService {
  private readonly env: Env;

  constructor({ env }: DatabaseServiceOpts) {
    this.env = env;
  }

  async getDiscordAssociations(discordIds: string[]): Promise<DiscordAssociationsRow[]> {
    const placeholders = discordIds.map(() => "?").join(",");
    const query = `SELECT * FROM DiscordAssociations WHERE DiscordId IN (${placeholders})`;
    const stmt = this.env.DB.prepare(query).bind(...discordIds);
    const response = await stmt.all<DiscordAssociationsRow>();
    return response.results;
  }

  async upsertDiscordAssociations(associations: DiscordAssociationsRow[]): Promise<void> {
    const placeholders = associations.map(() => "(?, ?, ?, ?, ?)").join(",");
    const query = `
      INSERT INTO DiscordAssociations (DiscordId, XboxId, AssociationReason, AssociationDate, GamesRetrievable) VALUES ${placeholders}
      ON CONFLICT(DiscordId) DO UPDATE SET XboxId=excluded.XboxId, AssociationReason=excluded.AssociationReason, AssociationDate=excluded.AssociationDate, GamesRetrievable=excluded.GamesRetrievable
    `;
    const bindings = associations.flatMap((association) => [
      association.DiscordId,
      association.XboxId,
      association.AssociationReason,
      association.AssociationDate,
      association.GamesRetrievable,
    ]);
    const stmt = this.env.DB.prepare(query).bind(...bindings);
    await stmt.run();
  }

  async deleteDiscordAssociations(discordIds: string[]): Promise<void> {
    const placeholders = discordIds.map(() => "?").join(",");
    const query = `DELETE FROM DiscordAssociations WHERE DiscordId IN (${placeholders})`;
    const stmt = this.env.DB.prepare(query).bind(...discordIds);
    await stmt.run();
  }
}
