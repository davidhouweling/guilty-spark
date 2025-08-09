import { ApplicationCommandType, InteractionType } from "discord-api-types/v10";
import type { Services } from "../services/install.mjs";
import { UnreachableError } from "../base/unreachable-error.mjs";
import type { BaseCommand } from "./base/base.mjs";
import { ConnectCommand } from "./connect/connect.mjs";
import { StatsCommand } from "./stats/stats.mjs";
import { SetupCommand } from "./setup/setup.mjs";
import { MapsCommand } from "./maps/maps.mjs";

export function getCommands(services: Services, env: Env): Map<string, BaseCommand> {
  const commandMap = new Map<string, BaseCommand>();
  const commands = [
    new ConnectCommand(services, env),
    new MapsCommand(services, env),
    new StatsCommand(services, env),
    new SetupCommand(services, env),
  ];

  for (const command of commands) {
    for (const commandData of command.data) {
      const { type } = commandData;
      switch (type) {
        case ApplicationCommandType.ChatInput: {
          commandMap.set(commandData.name, command);
          break;
        }
        case InteractionType.MessageComponent:
        case InteractionType.ModalSubmit: {
          commandMap.set(commandData.data.custom_id, command);
          break;
        }
        case ApplicationCommandType.Message:
        case ApplicationCommandType.User:
        case ApplicationCommandType.PrimaryEntryPoint: {
          throw new Error("Unsupported command type");
        }
        default:
          throw new UnreachableError(type);
      }
    }
  }

  return commandMap;
}
