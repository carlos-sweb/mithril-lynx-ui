import path from "node:path";
import { fileURLToPath } from "node:url";

import { pluginLynxConfig } from "@lynx-js/config-rsbuild-plugin";
import { pluginQRCode } from "@lynx-js/qrcode-rsbuild-plugin";
import { defineConfig } from "@lynx-js/rspeedy";
import { pluginTypeCheck } from "@rsbuild/plugin-type-check";

import { pluginMithrilLynx } from "mithril-lynx/plugin";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  source: {
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
    // enableNewGesture defaults to false (legacy touch-only gesture path) —
    // without it, __SetGestureDetector registrations (swipe-action.js's
    // createGesture() call) are simply never acted on by the runtime. See
    // mithril-lynx/DEVICE_VERIFICATION.md and mithril-app's own lynx.config.ts.
    pluginLynxConfig({ enableNewGesture: true }),
    pluginQRCode({
      schema(url) {
        return `${url}?fullscreen=true`;
      },
    }),
    pluginTypeCheck(),
  ],
});
