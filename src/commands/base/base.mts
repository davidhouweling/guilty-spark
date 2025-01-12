import type {
  APIApplicationCommandInteraction,
  APIApplicationCommand,
  APIInteractionResponse,
} from "discord-api-types/v10";
import type { Services } from "../../services/install.mjs";

export type BaseApplicationCommandData = Omit<
  APIApplicationCommand,
  "id" | "application_id" | "default_member_permissions" | "version"
>;

export interface ExecuteResponse {
  response: APIInteractionResponse;
  jobToComplete?: () => Promise<void>;
}

export abstract class BaseCommand {
  constructor(readonly services: Services) {}

  abstract data: BaseApplicationCommandData;

  abstract execute(interaction: APIApplicationCommandInteraction): ExecuteResponse;
}
