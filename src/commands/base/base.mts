import type {
  APIApplicationCommandInteraction,
  APIApplicationCommand,
  APIInteractionResponse,
  APIMessageComponentButtonInteraction,
  APIModalSubmitInteraction,
} from "discord-api-types/v10";
import type { Services } from "../../services/install.mjs";

export type ApplicationCommandData = Omit<
  APIApplicationCommand,
  "id" | "application_id" | "default_member_permissions" | "version"
>;
export type ButtonInteractionData = Pick<APIMessageComponentButtonInteraction, "type" | "data">;
export type ModalSubmitInteractionData = Pick<APIModalSubmitInteraction, "type" | "data">;
export type CommandData = ApplicationCommandData | ButtonInteractionData | ModalSubmitInteractionData;
export type BaseInteraction =
  | APIApplicationCommandInteraction
  | APIMessageComponentButtonInteraction
  | APIModalSubmitInteraction;
export interface ExecuteResponse {
  response: APIInteractionResponse;
  jobToComplete?: () => Promise<void>;
}

export abstract class BaseCommand {
  constructor(readonly services: Services) {}

  abstract data: CommandData | CommandData[];

  abstract execute(interaction: BaseInteraction): ExecuteResponse;
}
