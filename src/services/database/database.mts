import { DiscordAssociationsRow } from "./types/discord_associations.mjs";

interface DatabaseServiceOpts {
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
    const stmt = this.env.DB.prepare(query);
    discordIds.forEach((discordId, index) => stmt.bind(index + 1, discordId));
    const response = await stmt.all<DiscordAssociationsRow>();
    return response.results;
  }

  async addDiscordAssociation(associations: DiscordAssociationsRow[]): Promise<void> {
    const placeholders = associations.map(() => "(?, ?, ?, ?, ?)").join(",");
    const query = `INSERT INTO DiscordAssociations (DiscordId, XboxId, AssociationReason, AssociationDate, GamesRetrievable) VALUES ${placeholders}`;
    const stmt = this.env.DB.prepare(query);
    const bindings = associations.flatMap((association) => [
      association.DiscordId,
      association.XboxId,
      association.AssociationReason,
      association.AssociationDate,
      association.GamesRetrievable,
    ]);
    stmt.bind(...bindings);
    await stmt.run();
  }
}
