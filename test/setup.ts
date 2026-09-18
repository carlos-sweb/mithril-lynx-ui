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

// lynx.createSelectorQuery() (used by src/internal/native-ref.js — see
// docs/native-papi/papi-01-imperative-refs.md) is already implemented by
// @lynx-js/testing-environment for real, backed by its real jsdom
// `document` (see test/harness.ts's mount() for the one piece that WAS
// missing: actually attaching a mounted app's root under that document).
// The one gap: its `NodesRef.invoke()` — the method `.invoke()` calls —
// is unconditionally `throw new Error("not implemented")` in this version
// of the package (`setNativeProps()` has a real implementation; `invoke()`
// doesn't). Patched here, once, the same way a test would patch any other
// third-party stub: grab an instance via `selectUniqueID()` (the one path
// that doesn't require a real element to exist yet), reach its shared
// prototype, and replace `invoke` with a working simulation that resolves
// the element through the same `document.querySelector()` the real
// `setNativeProps()` already uses, then always succeeds, echoing back
// `{method, params}` — same default behavior as mithril-lynx-v1's own
// simulated `__InvokeUIMethod`. A test needing a specific response
// overrides this the same way (see docs/native-papi/papi-03-async-geometry-measurement.md).
// invoke() calls don't go through any `__`-prefixed PAPI function (unlike
// setNativeProps(), which calls a real DOM method) — there's nothing for
// the existing __papiCalls log to record. Logged separately here instead,
// keyed by the real element (the same object identity
// applier.getHandle(node._id) returns), so a test can find its own calls
// by filtering on that — see test/input.test.ts's invocations() for the
// pattern.
(globalThis as any).__nodesRefInvokeCalls = [];

let invokePatched = false;
globalThis.onInjectBackgroundThreadGlobals = (target: any) => {
	if (invokePatched) return;
	const probe = target.lynx?.createSelectorQuery?.().selectUniqueID?.(0);
	if (probe == null) return;
	invokePatched = true;

	const proto = Object.getPrototypeOf(probe);
	proto.invoke = function (this: { _nodeSelectToken: { type: number; identifier: string } }, opts: {
		method: string;
		params?: unknown;
		success?: (data: unknown) => void;
		fail?: (data: unknown) => void;
	}) {
		const token = this._nodeSelectToken;
		return {
			exec() {
				const element = token.type === 0 ? lynxTestingEnv.env.window.document.querySelector(token.identifier) : null;
				if (element == null) {
					opts.fail?.({ code: 2, data: null }); // NODE_NOT_FOUND
					return;
				}
				(globalThis as any).__nodesRefInvokeCalls.push({ element, method: opts.method, params: opts.params });
				// A test needing a specific response (e.g. a real-looking
				// boundingClientRect) sets this per test — same override
				// convention __InvokeUIMethod already established. Default:
				// always succeed, echoing back {method, params}.
				const handler = (globalThis as any).__nodesRefInvokeHandler as
					| ((element: unknown, method: string, params: unknown, callback: (res: { code: number; data?: unknown }) => void) => void)
					| undefined;
				if (typeof handler === "function") {
					handler(element, opts.method, opts.params, (res) => {
						if (res && res.code === 0) opts.success?.(res.data);
						else opts.fail?.(res);
					});
					return;
				}
				opts.success?.({ method: opts.method, params: opts.params });
			},
		};
	};
};
