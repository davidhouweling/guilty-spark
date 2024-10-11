import express, { Request } from "express";
import morgan from "morgan";
import { config } from "./config.mjs";
import { XboxService } from "./services/xbox/xbox.mjs";

interface ServerOpts {
  xboxService: XboxService;
}

export class Server {
  private readonly xboxService: XboxService;
  app = express();

  constructor({ xboxService }: ServerOpts) {
    this.xboxService = xboxService;

    this.loadMiddlewares();
    this.loadRoutes();
  }

  connect(readyCallback: () => void) {
    this.app.listen(config.SERVER_PORT, () => {
      console.log("Listening on port", config.SERVER_PORT);

      readyCallback();
    });
  }

  private loadMiddlewares() {
    this.app.use(morgan("common"));
  }

  private loadRoutes() {
    this.app.get("/authorize", (_req, res) => {
      res.redirect(this.xboxService.authorizeUrl);
    });

    this.app.get("/oauth2", (req: Request<null, { success: boolean }, null, { code: string }>, res) => {
      const code = req.query.code;
      if (!code) {
        res.sendStatus(403);
        return;
      }

      res.send({ success: true });
    });
  }
}
