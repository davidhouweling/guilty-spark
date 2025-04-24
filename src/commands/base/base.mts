import type {
  APIApplicationCommandInteraction,
  APIApplicationCommand,
  APIInteractionResponse,
  APIMessageComponentButtonInteraction,
  APIModalSubmitInteraction,
  APIMessageComponentSelectMenuInteraction,
} from "discord-api-types/v10";
import type { Services } from "../../services/install.mjs";

export type ApplicationCommandData = Omit<APIApplicationCommand, "id" | "application_id" | "version">;
export type ButtonInteractionData = Pick<APIMessageComponentButtonInteraction, "type" | "data">;
export type ModalSubmitInteractionData = Pick<APIModalSubmitInteraction, "type" | "data">;
export type StringSelectInteractionData = Pick<APIMessageComponentSelectMenuInteraction, "type" | "data">;
export type CommandData =
  | ApplicationCommandData
  | ButtonInteractionData
  | ModalSubmitInteractionData
  | StringSelectInteractionData;
export type BaseInteraction =
  | APIApplicationCommandInteraction
  | APIMessageComponentButtonInteraction
  | APIModalSubmitInteraction
  | APIMessageComponentSelectMenuInteraction;
export interface ExecuteResponse {
  response: APIInteractionResponse;
  jobToComplete?: () => Promise<void>;
}

export abstract class BaseCommand {
  constructor(
    readonly services: Services,
    readonly env: Env,
  ) {}

  abstract readonly data: CommandData[];

  abstract execute(interaction: BaseInteraction): ExecuteResponse;
}
