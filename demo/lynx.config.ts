import path from "node:path";
import { fileURLToPath } from "node:url";

import { pluginQRCode } from "@lynx-js/qrcode-rsbuild-plugin";
import { defineConfig } from "@lynx-js/rspeedy";
import { pluginTypeCheck } from "@rsbuild/plugin-type-check";

import { pluginMithrilLynx } from "mithril-lynx/plugin";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  source: {
    // mithril-lynx keeps its render state (root wrapper, redraw fn) in
    // module-level variables, so two physical copies means two disconnected
    // renderers: the app renders through one and any library calling
    // shim.redraw() hits the other, whose redraw is still null — a silent
    // no-op, no error. That happens here because mithril-lynx-ui is linked in
    // and resolves its own nested copy. Forcing one copy is the same fix
    // mithril-lynx/plugin already applies to `mithril` itself.
    // The trailing $ makes this an exact match on the bare specifier only,
    // so "mithril-lynx/main-thread" and friends still resolve through the
    // package's own exports map.
    alias: {
      "mithril-lynx$": path.resolve(
        projectRoot,
        "node_modules/mithril-lynx/src/lynx-mithril-shim.js",
      ),
    },
    entry: {
      "main-thread": path.join(projectRoot, "src/main-thread.ts"),
    },
  },
  output: {
    distPath: {
      root: path.join(projectRoot, "dist"),
    },
    filename: "[name].bundle",
  },
  plugins: [
    pluginMithrilLynx(),
    pluginQRCode({
      schema(url) {
        return `${url}?fullscreen=true`;
      },
    }),
    pluginTypeCheck(),
  ],
});
