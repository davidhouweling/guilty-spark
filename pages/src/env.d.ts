import type { Runtime } from "@astrojs/cloudflare";

declare namespace App {
  type Locals = Runtime<Env>;
}

declare global {
  interface Window {
    __TRACKER_API_HOST__?: string;
  }
}
