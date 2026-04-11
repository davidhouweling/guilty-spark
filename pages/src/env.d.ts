import type { Runtime } from "@astrojs/cloudflare";

declare namespace App {
  type Locals = Runtime<Env>;
}

interface ImportMetaEnv {
  readonly BACKEND_URL?: string;
  readonly PUBLIC_BACKEND_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    __TRACKER_API_HOST__?: string;
  }
}
