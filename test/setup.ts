// test/setup.ts
//
// mithril-lynx-ui is a separate package from mithril-lynx core, so this
// imports the polyfill helper via the public "mithril-lynx/testing" subpath
// (mithril-lynx core's own test/setup.ts uses a package-relative import
// instead, since it IS that package) — otherwise identical purpose: make
// the dual-thread jsdom PAPI simulation available before any test runs.

import { installTestingPolyfills } from "mithril-lynx/testing";

globalThis.onInjectMainThreadGlobals = installTestingPolyfills;
