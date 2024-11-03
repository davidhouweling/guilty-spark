import { Services } from "../../services/install.mjs";
import {
  APIApplicationCommandInteraction,
  APIApplicationCommand,
  RESTPostAPIWebhookWithTokenJSONBody,
} from "discord-api-types/v10";

export interface ExecuteResponse {
  response: Omit<
    RESTPostAPIWebhookWithTokenJSONBody,
    "username" | "avatar_url" | "thread_name" | "tts" | "applied_tags"
  >;
  deferred: boolean;
}

export abstract class BaseCommand {
  constructor(readonly services: Services) {}

  abstract data: Omit<APIApplicationCommand, "id" | "application_id" | "default_member_permissions" | "version">;

  abstract execute(interaction: APIApplicationCommandInteraction): Promise<ExecuteResponse>;
}
