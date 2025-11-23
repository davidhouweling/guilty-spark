import type {
  APIApplicationCommandInteraction,
  APIApplicationCommand,
  APIInteractionResponse,
  APIMessageComponentButtonInteraction,
  APIModalSubmitInteraction,
  APIMessageComponentSelectMenuInteraction,
} from "discord-api-types/v10";
import { ComponentType, InteractionType, InteractionResponseType, MessageFlags } from "discord-api-types/v10";
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

/**
 * Maps component types to their corresponding interaction types
 */
export type InteractionForComponentType<T extends ComponentType | InteractionType> = T extends ComponentType.Button
  ? APIMessageComponentButtonInteraction
  : T extends
        | ComponentType.StringSelect
        | ComponentType.UserSelect
        | ComponentType.RoleSelect
        | ComponentType.MentionableSelect
        | ComponentType.ChannelSelect
    ? APIMessageComponentSelectMenuInteraction
    : T extends InteractionType.ModalSubmit
      ? APIModalSubmitInteraction
      : never;

/**
 * Handler function type that receives the correctly-typed interaction
 */
export type ComponentHandler<T extends ComponentType | InteractionType> = (
  interaction: InteractionForComponentType<T>,
) => ExecuteResponse | Promise<ExecuteResponse>;

/**
 * Component handler definition with metadata for registration
 */
export interface ComponentHandlerDefinition<T extends ComponentType | InteractionType> {
  componentType: T;
  handler: ComponentHandler<T>;
}

/**
 * Type for the handler map - keys are interaction component IDs
 */
export type ComponentHandlerMap = Record<string, ComponentHandlerDefinition<ComponentType | InteractionType>>;

export abstract class BaseCommand {
  constructor(
    readonly services: Services,
    readonly env: Env,
  ) {}

  /**
   * Slash commands to register with Discord.
   * Can be multiple commands if needed (though typically just one per command class).
   */
  abstract readonly commands: ApplicationCommandData[];

  /**
   * Component interaction handlers (buttons, selects, modals).
   * Optional - only needed if command has interactive components.
   */
  protected readonly components?: ComponentHandlerMap;

  /**
   * Auto-generated registration data combining commands + components.
   * Used by Discord service to register all interaction types.
   */
  get data(): CommandData[] {
    return [...this.commands, ...(this.components ? this.generateComponentData(this.components) : [])];
  }

  /**
   * Default execute implementation with error handling.
   * Subclasses can override this if they need custom behavior (e.g., guild validation).
   * Otherwise, they just implement handleInteraction() for their command logic.
   */
  execute(interaction: BaseInteraction): ExecuteResponse {
    try {
      return this.handleInteraction(interaction);
    } catch (error) {
      this.services.logService.error(error as Error);

      return {
        response: {
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            content: `Error: ${error instanceof Error ? error.message : "unknown"}`,
            flags: MessageFlags.Ephemeral,
          },
        },
      };
    }
  }

  /**
   * Command-specific interaction handling logic.
   * Subclasses implement this instead of execute() to get automatic error handling.
   */
  protected abstract handleInteraction(interaction: BaseInteraction): ExecuteResponse;

  /**
   * Helper: Defers message update and runs job
   */
  protected deferUpdate(job: () => Promise<void>): ExecuteResponse {
    return {
      response: {
        type: InteractionResponseType.DeferredMessageUpdate,
      },
      jobToComplete: job,
    };
  }

  /**
   * Helper: Defers channel message reply and runs job
   */
  protected deferReply(job: () => Promise<void>, ephemeral = false): ExecuteResponse {
    if (ephemeral) {
      return {
        response: {
          type: InteractionResponseType.DeferredChannelMessageWithSource,
          data: { flags: MessageFlags.Ephemeral },
        },
        jobToComplete: job,
      };
    }

    return {
      response: {
        type: InteractionResponseType.DeferredChannelMessageWithSource,
      },
      jobToComplete: job,
    };
  }

  /**
   * Helper: Returns immediate response
   */
  protected immediateResponse(response: APIInteractionResponse): ExecuteResponse {
    return { response };
  }

  /**
   * Helper: Create a button handler
   */
  protected buttonHandler(
    handler: ComponentHandler<ComponentType.Button>,
  ): ComponentHandlerDefinition<ComponentType.Button> {
    return {
      componentType: ComponentType.Button,
      handler,
    };
  }

  /**
   * Helper: Create a string select handler
   */
  protected stringSelectHandler(
    handler: ComponentHandler<ComponentType.StringSelect>,
  ): ComponentHandlerDefinition<ComponentType.StringSelect> {
    return {
      componentType: ComponentType.StringSelect,
      handler,
    };
  }

  /**
   * Helper: Create a channel select handler
   */
  protected channelSelectHandler(
    handler: ComponentHandler<ComponentType.ChannelSelect>,
  ): ComponentHandlerDefinition<ComponentType.ChannelSelect> {
    return {
      componentType: ComponentType.ChannelSelect,
      handler,
    };
  }

  /**
   * Helper: Create a modal submit handler
   */
  protected modalSubmitHandler(
    handler: ComponentHandler<InteractionType.ModalSubmit>,
  ): ComponentHandlerDefinition<InteractionType.ModalSubmit> {
    return {
      componentType: InteractionType.ModalSubmit,
      handler,
    };
  }

  /**
   * Helper: Create a validated handler map
   * Ensures all enum values have corresponding handlers
   */
  protected createHandlerMap(enumObj: Record<string, string>, handlers: ComponentHandlerMap): ComponentHandlerMap {
    // Runtime validation - ensure all handlers have matching enum values
    const enumValues = Object.values(enumObj);
    const handlerKeys = Object.keys(handlers);

    const missingHandlers = enumValues.filter((value) => !handlerKeys.includes(value));
    const extraHandlers = handlerKeys.filter((key) => !enumValues.includes(key));

    if (missingHandlers.length > 0) {
      throw new Error(`Missing handlers for: ${missingHandlers.join(", ")}`);
    }

    if (extraHandlers.length > 0) {
      throw new Error(`Extra handlers not in enum: ${extraHandlers.join(", ")}`);
    }

    return handlers;
  }

  /**
   * Helper: Auto-generates CommandData array from handler map
   */
  protected generateComponentData(
    handlers: ComponentHandlerMap,
  ): (ButtonInteractionData | ModalSubmitInteractionData)[] {
    return Object.entries(handlers).map(([customId, definition]) => {
      const { componentType } = definition;

      if (componentType === InteractionType.ModalSubmit) {
        return {
          type: InteractionType.ModalSubmit,
          data: {
            components: [],
            custom_id: customId,
          },
        };
      }

      // All other component types are MessageComponent interactions
      return {
        type: InteractionType.MessageComponent,
        data: {
          component_type: componentType,
          custom_id: customId,
          // Add required fields based on component type
          ...(componentType === ComponentType.StringSelect ||
          componentType === ComponentType.UserSelect ||
          componentType === ComponentType.RoleSelect ||
          componentType === ComponentType.MentionableSelect ||
          componentType === ComponentType.ChannelSelect
            ? { values: [] }
            : {}),
          ...(componentType === ComponentType.ChannelSelect
            ? {
                resolved: {
                  channels: {},
                },
              }
            : {}),
        },
      } as ButtonInteractionData;
    });
  }

  /**
   * Executes a component handler from the handler map.
   * Handles both synchronous and asynchronous handler results.
   *
   * This method provides runtime dispatch for component interactions,
   * wrapping async results in a deferred response pattern.
   *
   * @param handler - The handler definition from the component map
   * @param interaction - The component interaction to handle
   * @returns ExecuteResponse with optional jobToComplete
   */
  protected executeComponentHandler(
    handler: ComponentHandlerDefinition<ComponentType | InteractionType>,
    interaction:
      | APIMessageComponentButtonInteraction
      | APIModalSubmitInteraction
      | APIMessageComponentSelectMenuInteraction,
  ): ExecuteResponse {
    // Handler map guarantees type compatibility at runtime
    const result = handler.handler(interaction);

    // If handler returns a promise (async handler), wrap it
    if (result instanceof Promise) {
      return {
        response: { type: InteractionResponseType.DeferredMessageUpdate },
        jobToComplete: async (): Promise<void> => {
          const executeResponse = await result;
          if (executeResponse.jobToComplete) {
            await executeResponse.jobToComplete();
          }
        },
      };
    }

    return result;
  }
}
