import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";

// https://astro.build/config
export default defineConfig({
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
    imageService: "cloudflare",
  }),
  integrations: [react()],
  scopedStyleStrategy: "class",
  trailingSlash: "never",
  vite: {
    optimizeDeps: {
      exclude: ["halo-infinite-api"],
    },
  },
});
