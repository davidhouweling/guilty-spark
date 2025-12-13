import type { Runtime } from "@astrojs/cloudflare";

declare namespace App {
  type Locals = Runtime<Env>;
}

interface ImportMetaEnv {
  readonly PUBLIC_API_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    __TRACKER_API_HOST__?: string;
  }
}
