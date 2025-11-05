import type { Runtime } from "@astrojs/cloudflare";

declare namespace App {
  type Locals = Runtime<Env>;
}
