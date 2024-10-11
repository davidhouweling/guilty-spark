import "dotenv/config";
import { Server } from "./server.mjs";
import { installServices } from "./services/install.mjs";
import { getCommands } from "./commands/commands.mjs";

const { discordService, xboxService } = installServices();

const server = new Server({ xboxService });
server.connect(() => {
  void discordService.activate(getCommands(discordService.client));
});
