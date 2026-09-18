import { defineConfig } from "@rstest/core";

export default defineConfig({
  testEnvironment: "jsdom",
  setupFiles: [
    // Set the PAPI polyfill hook before the testing environment installs.
    "./test/setup.ts",
    "@lynx-js/testing-environment/env/rstest",
  ],
  globals: true,
  include: ["test/**/*.test.ts"],
  tools: {
    rspack: {
      module: {
        rules: [
          // The v1 mithril-lynx package entry (src/lynx-mithril-shim.js) is
          // CommonJS (module.exports), but Rspack treats .js as ESM inside a
          // "type": "module" package by default — same fix mithril-lynx
          // core's own rstest.config.ts applies to itself, scoped here to
          // the node_modules copy since we consume it as a real dependency.
          // Matches BOTH the real "mithril-lynx" v2 package (real ESM
          // already — this rule is a harmless no-op there) and the
          // "mithril-lynx-v1" npm alias this project installs alongside it
          // during the v1->v2 migration (see .omo/plans/
          // migrate-to-mithril-lynx-v2.md) — the alias directory name has a
          // "-v1" suffix the original regex didn't account for.
          {
            test: /mithril-lynx(?:-v1)?[\\/]src[\\/].*\.js$/,
            type: "javascript/dynamic",
          },
        ],
      },
    },
  },
});
