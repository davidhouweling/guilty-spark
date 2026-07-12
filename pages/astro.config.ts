import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://guilty-spark.app",
  adapter: cloudflare(),
  integrations: [
    react(),
    sitemap({
      filter: (page) =>
        ![
          "https://guilty-spark.app/login",
          "https://guilty-spark.app/tracker",
          "https://guilty-spark.app/404",
          "https://guilty-spark.app/500",
        ].includes(page) &&
        !page.startsWith("https://guilty-spark.app/individual-tracker/") &&
        !page.startsWith("https://guilty-spark.app/stats/") &&
        !page.startsWith("https://guilty-spark.app/u/"),
    }),
  ],
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
