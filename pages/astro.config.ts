import { createRequire } from "node:module";
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import type { EnvironmentOptions } from "vite";

const require = createRequire(import.meta.url);

export default defineConfig({
  adapter: cloudflare(),
  integrations: [react()],
  scopedStyleStrategy: "class",
  trailingSlash: "never",
  vite: {
    resolve: {
      alias: {
        // cockatiel (a transitive dep of halo-infinite-api) declares a `module`
        // field pointing at an esm entry that does not ship, so the workerd SSR
        // resolver fails to find it. Pin it to the CommonJS entry that exists.
        cockatiel: require.resolve("cockatiel"),
      },
    },
    ssr: {
      // CF Workers must have all deps bundled to avoid Vite SSR optimizer races.
      noExternal: true,
    },
    plugins: [
      {
        name: "cloudflare-worker-deps-prebundle",
        configEnvironment(name, options): EnvironmentOptions | undefined {
          if (name === "ssr" && (options.resolve?.conditions?.includes("workerd") ?? false)) {
            return {
              optimizeDeps: {
                include: [
                  // Vite's workerd runner can still hit nested CommonJS deps even when
                  // the main renderer deps are prebundled. Force this nested dependency
                  // into the SSR optimizer so the worker sees ESM instead of raw CJS.
                  "@astrojs/internal-helpers > picomatch",
                ],
              },
            };
          }
        },
      },
    ],
  },
});
