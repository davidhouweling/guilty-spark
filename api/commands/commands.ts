import { ApplicationCommandType, InteractionType } from "discord-api-types/v10";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import type { Services } from "../services/install";
import type { BaseCommand } from "./base/base-command";
import { ConnectCommand } from "./connect/connect";
import { StatsCommand } from "./stats/stats";
import { SetupCommand } from "./setup/setup";
import { MapsCommand } from "./maps/maps";
import { TrackCommand } from "./track/track";
import { ServiceRecordCommand } from "./service-record/service-record";

export function getCommands(services: Services, env: Env): Map<string, BaseCommand> {
  const commandMap = new Map<string, BaseCommand>();
  const commands = [
    new ConnectCommand(services, env),
    new MapsCommand(services, env),
    new StatsCommand(services, env),
    new SetupCommand(services, env),
    new TrackCommand(services, env),
    new ServiceRecordCommand(services, env),
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
        case ApplicationCommandType.User: {
          commandMap.set(commandData.name, command);
          break;
        }
        case ApplicationCommandType.Message:
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
