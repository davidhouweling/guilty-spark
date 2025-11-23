import type { Mock } from "vitest";
import { vi } from "vitest";
import { BaseCommand } from "../base-command.mjs";
import type { Services } from "../../../services/install.mjs";
import type { ExecuteResponse, ApplicationCommandData, CommandData, BaseInteraction } from "../base-command.mjs";
import { aFakeEnvWith } from "../../../base/fakes/env.fake.mjs";
import { installFakeServicesWith } from "../../../services/fakes/services.mjs";

export class TestCommand extends BaseCommand {
  public readonly commands: ApplicationCommandData[];
  public executeFn: Mock;
  private readonly dataOverride?: CommandData[] | undefined;

  constructor(
    services: Services,
    env: Env,
    commands: ApplicationCommandData[],
    executeFn?: Mock,
    dataOverride?: CommandData[],
  ) {
    super(services, env);
    this.commands = commands;
    this.executeFn = executeFn ?? vi.fn();
    this.dataOverride = dataOverride;
  }

  // Allow tests to override data for component/modal testing
  override get data(): CommandData[] {
    return this.dataOverride ?? super.data;
  }

  public execute(interaction: BaseInteraction): ExecuteResponse {
    return this.executeFn(interaction) as ExecuteResponse;
  }
}

export function aTestCommandWith(
  opts: {
    services?: Services;
    env?: Env;
    commands?: ApplicationCommandData[];
    data?: CommandData[];
    executeFn?: Mock;
  } = {},
): TestCommand {
  const defaultCommands: ApplicationCommandData[] = [
    {
      name: "test-command",
      type: 1,
      options: [],
      description: "A test command",
      default_member_permissions: null,
    },
  ];

  const env = opts.env ?? aFakeEnvWith();
  const services = opts.services ?? installFakeServicesWith({ env });

  return new TestCommand(services, env, opts.commands ?? defaultCommands, opts.executeFn, opts.data);
}
