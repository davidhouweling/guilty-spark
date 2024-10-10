import express, { Request } from "express";
import morgan from "morgan";
import { services } from "./services/services.mjs";

const PORT = process.env["PORT"] ?? 3000;
const { xbox } = services;

const app = express();
app.use(morgan("common"));

app.get("/authorize", (_req, res) => {
  res.redirect(xbox.authorizeUrl);
});

app.get("/oauth2", (req: Request<null, { success: boolean }, null, { code: string }>, res) => {
  const code = req.query.code;
  if (!code) {
    res.sendStatus(403);
    return;
  }

  res.send({ success: true });
});

export function server(onReady: () => void) {
  app.listen(PORT, () => {
    console.log("Listening on port", PORT);

    onReady();
  });
}
