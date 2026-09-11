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
          // mithril-lynx's own package entry (mithril-lynx/src/lynx-mithril-shim.js)
          // is CommonJS (module.exports), but Rspack treats .js as ESM inside a
          // "type": "module" package by default — same fix mithril-lynx core's
          // own rstest.config.ts applies to itself, scoped here to the
          // node_modules copy since we consume it as a real dependency.
          {
            test: /mithril-lynx[\\/]src[\\/].*\.js$/,
            type: "javascript/dynamic",
          },
        ],
      },
    },
  },
});
