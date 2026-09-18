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
          // The legacy mithril-lynx package's entry (src/lynx-mithril-shim.js,
          // installed here under the "mithril-lynx-v1" npm alias — see
          // .omo/plans/migrate-off-legacy-mithril-lynx.md) is CommonJS
          // (module.exports), but Rspack treats .js as ESM inside a
          // "type": "module" package by default — same fix that package's
          // own rstest.config.ts applies to itself.
          //
          // Deliberately scoped to ONLY the "-v1" alias, not "mithril-lynx"
          // (current) too: the current package's own src/*.js files are
          // REAL ESM (e.g. testing.js's `export { x } from "./y.js"`), and
          // "javascript/dynamic" does NOT support import/export syntax at
          // all — applying this rule there broke every test with "'import'
          // and 'export' cannot be used outside of module code", confirmed
          // the hard way after a previous, broader version of this regex
          // matched both packages on the assumption both needed the fix.
          {
            test: /mithril-lynx-v1[\\/]src[\\/].*\.js$/,
            type: "javascript/dynamic",
          },
        ],
      },
    },
  },
});
