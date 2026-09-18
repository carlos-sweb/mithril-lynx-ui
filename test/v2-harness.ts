// test/v2-harness.ts
//
// Shared mount helper for the components migrated to mithril-lynx v2 (see
// .omo/plans/migrate-to-mithril-lynx-v2.md). Mirrors v1's own
// shim.renderToPage()-based test harness's ergonomics (mount/fire/textOf)
// as closely as the two architectures allow, so a migrated component's test
// body stays close to its v1 original — only the setup functions differ.
//
// Real, not mocked: renderApp() runs the actual v2 background-thread render
// against the actual fake-dom (src/fake-dom.js); the resulting ops are
// replayed by the actual createPatchApplier onto REAL Element PAPI nodes via
// @lynx-js/testing-environment (mithril-lynx/testing) — same two-thread
// round trip mithril-lynx core's own end-to-end.test.ts exercises. Events
// are fired directly on the background-thread fake-dom node (skipping the
// real main-thread-forwards-a-native-event hop, which core's own test suite
// already covers) — this harness is for verifying a COMPONENT's logic, not
// mithril-lynx's cross-thread wiring.

import { renderApp } from "mithril-lynx/background";
import { createPatchApplier } from "mithril-lynx/testing";

export interface V2Node {
	tag: string;
	className: string;
	firstChild: V2Node | null;
	nextSibling: V2Node | null;
	/** The background-thread virtual-backend id — internal, but needed by
	 * styleOf() below to find the real PAPI handle this node's ops applied
	 * to (see applier.getHandle()). */
	_id: unknown;
	dispatchEvent(event: { type: string; [key: string]: unknown }): void;
}

export interface Mounted {
	/** The single top-level node `root()` returned. */
	root: V2Node;
	/** Forces another render pass (mithril-lynx's own `redraw`), e.g. after
	 * a state change made outside a dispatched event. */
	redraw(): void;
	/** The real patch applier — styleOf() needs this to resolve a node's
	 * real PAPI handle; app code doesn't otherwise need to touch it. */
	applier: ReturnType<typeof createPatchApplier>;
}

/**
 * Mounts `root()` through the real renderApp()/apply-patch pipeline.
 * `root` is called exactly once by renderApp() itself; re-renders happen
 * through mithril-lynx's own auto-redraw-after-event contract, or by
 * calling the returned `.redraw()`.
 */
export function mount(root: () => unknown): Mounted {
	lynxTestingEnv.switchToMainThread();
	const pageId = __GetElementUniqueID(__CreatePage());
	const applier = createPatchApplier(pageId);
	applier.registerPageRoot(__CreateView(pageId));

	lynxTestingEnv.switchToBackgroundThread();
	const app = renderApp({
		root,
		sendPatch: (ops) => {
			lynxTestingEnv.switchToMainThread();
			applier.applyPatch(ops as unknown[]);
			lynxTestingEnv.switchToBackgroundThread();
		},
	});

	return {
		// A getter, not a value captured once: some components replace their
		// top-level node entirely across a redraw (e.g. a placeholder swapped
		// for its real content) rather than mutating one in place — always
		// read the CURRENT top node, matching what root.firstChild gave v1
		// tests every time they re-read it fresh after a shimModule.redraw().
		get root() {
			return (app.document as any).firstChild as V2Node;
		},
		redraw: app.redraw,
		applier,
	};
}

/** Fires a native-shaped event on a fake-dom node, same way a forwarded
 * native event would (see channel.js's onEventFromMainThread). */
export function fire(node: V2Node, type: string, payload: Record<string, unknown> = {}) {
	node.dispatchEvent({ type, currentTarget: node, ...payload });
}

/** Concatenates every LynxText descendant's value, depth-first — the same
 * shape v1 tests' `.textContent` read gave them. */
export function textOf(node: V2Node | null): string {
	if (node == null) return "";
	let out = "";
	let child = node.firstChild as any;
	while (child != null) {
		if (typeof child.nodeValue === "string") out += child.nodeValue;
		else out += textOf(child);
		child = child.nextSibling;
	}
	return out;
}

/** Depth-first search for the first descendant (or `node` itself) matching `predicate`. */
export function find(node: V2Node | null, predicate: (n: V2Node) => boolean): V2Node | null {
	if (node == null) return null;
	if (predicate(node)) return node;
	let child = node.firstChild;
	while (child != null) {
		const found = find(child, predicate);
		if (found != null) return found;
		child = child.nextSibling;
	}
	return null;
}

/** All direct children of `node`, in order — for asserting on a list/count. */
export function children(node: V2Node | null): V2Node[] {
	const out: V2Node[] = [];
	let child = node?.firstChild ?? null;
	while (child != null) {
		out.push(child);
		child = child.nextSibling;
	}
	return out;
}

/**
 * Every inline style property applied to `node`'s real PAPI handle, latest
 * value per key. Style has no readback of its own on the fake-dom node
 * (see fake-dom.js's write-only style proxy) — this reads it the same way
 * v1's own tests did, off the global PAPI-call recording
 * mithril-lynx-v1's testing polyfill installs (it wraps every
 * `__`-prefixed function regardless of which package actually called it,
 * so `__AddInlineStyle` calls made by v2's apply-patch.js are captured
 * here too, real call args, not simulated).
 */
export function attrOf(app: Mounted, node: V2Node, name: string): unknown {
	const handle = app.applier.getHandle(node._id);
	const calls = (globalThis as any).__papiCalls as { fn: string; args: unknown[] }[];
	return calls.filter((c) => c.fn === "__SetAttribute" && c.args[0] === handle && c.args[1] === name).at(-1)?.args[2];
}

export function styleOf(app: Mounted, node: V2Node): Record<string, unknown> {
	const handle = app.applier.getHandle(node._id);
	const calls = (globalThis as any).__papiCalls as { fn: string; args: unknown[] }[];
	const out: Record<string, unknown> = {};
	for (const call of calls) {
		if (call.fn === "__AddInlineStyle" && call.args[0] === handle) {
			out[call.args[1] as string] = call.args[2];
		}
	}
	return out;
}
