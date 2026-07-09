import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";

export default defineConfig({
  adapter: cloudflare(),
  integrations: [react()],
  scopedStyleStrategy: "class",
  trailingSlash: "never",
  vite: {
    build: {
      cssMinify: "esbuild",
    },
    ssr: {
      // CF Workers must have all deps bundled to avoid Vite SSR optimizer races.
      noExternal: true,
    },
  },
});
