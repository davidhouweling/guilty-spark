import { APIApplicationCommandInteraction, APIApplicationCommand, APIInteractionResponse } from "discord-api-types/v10";
import { Services } from "../../services/install.mjs";

export interface ExecuteResponse {
  response: APIInteractionResponse;
  jobToComplete?: Promise<void>;
}

export abstract class BaseCommand {
  constructor(readonly services: Services) {}

  abstract data: Omit<APIApplicationCommand, "id" | "application_id" | "default_member_permissions" | "version">;

  abstract execute(interaction: APIApplicationCommandInteraction): ExecuteResponse;
}
