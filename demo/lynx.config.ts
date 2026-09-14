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
      // Isolated harness for investigating drawer.js's own animation, apart
      // from the full gallery — white page, a single plain <text> trigger,
      // nothing else. Build it, then `cp dist/drawer-lab.bundle
      // demo-android/app/src/main/assets/main-thread.bundle` (renamed on
      // copy — MainActivity always calls renderTemplateUrl("main-thread.bundle", ...)
      // regardless of which entry produced the file) to run it in place of
      // the gallery; rebuild "main-thread" and re-copy to switch back.
      "drawer-lab": path.join(projectRoot, "src/drawer-lab-main-thread.ts"),
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
    //
    // enableCSSRule (@lynx-js/type-config's own doc comment) ALSO defaults
    // to false, and explicitly governs "style, media, supports, keyframes,
    // font-face, and layer rules" being "parsed and decoded through the
    // unified rule path." Without it, @keyframes blocks are simply never
    // compiled into the bundle at all — the "ui-entering"/"ui-leaving"
    // classes this project's own presence.js-driven components apply still
    // toggle correctly, but the `animation: name Ns ...` they reference
    // resolves to nothing, so the element just pops to its final state
    // instantly instead of animating. This was found live, on-device,
    // investigating why drawer.js's slide-in looked instant/"disastrous"
    // despite `transition: true` being passed correctly — suspected to be
    // the SAME reason every other Presence-animated component in this
    // project (Dialog/Sheet/Popover/FeedList) has only ever been verified
    // via before/after screenshots, never a live/recorded transition, so
    // this may have silently affected the whole project until now.
    pluginLynxConfig({ enableNewGesture: true, enableCSSRule: true }),
    pluginQRCode({
      schema(url) {
        return `${url}?fullscreen=true`;
      },
    }),
    pluginTypeCheck(),
  ],
});
