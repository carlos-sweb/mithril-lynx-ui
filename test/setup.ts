// test/setup.ts
//
// This package has components on BOTH mithril-lynx v1 and v2 during the
// migration (see .omo/plans/migrate-off-legacy-mithril-lynx.md) — one test run
// needs both polyfills installed. Order matters: v1's installTestingPolyfills
// wraps EVERY `__`-prefixed PAPI function for its own __papiCalls recording
// (used by v1 tests' papiCalls()/lastClassOf() helpers) — if it ran first,
// v2's polyfill would overwrite __AddEventListener/__RemoveEventListener/
// getEngine with plain, unwrapped versions and silently drop v1 tests'
// ability to see those calls. Running v2's minimal polyfill FIRST, then
// v1's superset on top, gives every test what it needs: v2's own tests only
// ever needed those three functions to work correctly (v1's wrapped
// versions still call through to the same real behavior), and v1's tests
// get their recording back.

import { installTestingPolyfills as installV2 } from "mithril-lynx/testing";
import { installTestingPolyfills as installV1 } from "mithril-lynx-v1/testing";

globalThis.onInjectMainThreadGlobals = (target: any) => {
	installV2(target);
	installV1(target);
};
