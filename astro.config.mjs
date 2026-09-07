// @ts-check
import { defineConfig } from "astro/config";

import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  /*
   * Scout now needs a real Cloudflare Worker
   * runtime for:
   *
   * - queue()
   * - future server/API routes
   *
   * Individual pages may still be prerendered.
   */
  output: "server",

  adapter: cloudflare(),
});
