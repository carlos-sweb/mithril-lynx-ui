import { describe, expect, it } from "@rstest/core";
import m from "mithril-runtime";
import { FeedList } from "../src/feed-list/feed-list.js";
import { mount, fire, type Mounted, type TestNode } from "./harness.js";

// FeedList here is List (already its own thoroughly-tested wrapper around
// mithril-lynx's native list support) plus a native <refresh>/<refresh-header>
// wrapper. These tests focus on what THIS file adds, driving native events
// the same way every other native event in this project is driven: fire it
// directly on the node. The load-more footer sentinel this file used to
// ship is gone — see this file's own header for the current status.

function papiCalls(): { fn: string; args: unknown[] }[] {
	return (globalThis as any).__papiCalls;
}

function attrOf(app: Mounted, node: TestNode, name: string): unknown {
	const handle = app.applier.getHandle(node._id);
	return papiCalls()
		.filter((c) => c.fn === "__SetAttribute" && c.args[0] === handle && c.args[1] === name)
		.at(-1)?.args[2];
}

function requestCell(app: Mounted, list: TestNode, index: number, opId = 1) {
	const handle = app.applier.getHandle(list._id) as any;
	const listId = __GetElementUniqueID(handle);
	return handle.componentAtIndex(handle, listId, index, opId);
}

const renderItem = (item: string) => m("text", {}, item);

describe("feed-list.js", () => {
	it("with no refreshOptions, it's just List — no <refresh> wrapper", () => {
		const app = mount(() => m(FeedList, { items: ["a", "b"], renderItem }));

		expect(app.root.tag).not.toBe("refresh");
		const list = app.root.firstChild!;
		requestCell(app, list, 0);
		requestCell(app, list, 1);
		expect(papiCalls().filter((c) => c.fn === "__CreateList")).toHaveLength(1);
		expect(() => requestCell(app, list, 2)).toThrow(/out of range/);
	});

	it("wraps List in a native <refresh>/<refresh-header> when refreshOptions is truthy", () => {
		const app = mount(() => m(FeedList, { items: ["a"], renderItem, refreshOptions: true, listId: "feed1" }));

		const refreshView = app.root.firstChild!;
		expect(refreshView.tag).toBe("refresh");
		expect(attrOf(app, refreshView, "enable-refresh")).toBe("true");
		expect(refreshView.firstChild!.tag).toBe("refresh-header");
		expect(refreshView.firstChild!.nextSibling).not.toBeUndefined(); // the placeholder view wrapping the real native list
	});

	it("pushes <refresh>'s own measured layout size to the inner List as explicit pixels, not a percentage", async () => {
		// A percentage style on List here does NOT reliably resolve against
		// <refresh> as a parent (confirmed on device: the list's items rendered
		// shrink-wrapped to content width while <refresh> itself filled its box
		// correctly) — see feed-list.js's own comment on this. The fix measures
		// <refresh> via its own onlayoutchange and pushes real pixels instead.
		const app = mount(() => m(FeedList, { items: ["a"], renderItem, refreshOptions: true, style: { width: "100%", height: "260px" } }));
		const refreshView = app.root.firstChild!;
		// .nextSibling here is List's own placeholder <view> (see list.js's
		// own header) — the real native list is a further child appended
		// imperatively in List's oncreate, not List's own top-level node.
		const list = refreshView.firstChild!.nextSibling!.firstChild!;

		fire(refreshView, "layoutchange", { detail: { width: 344, height: 260 } });
		// onlayoutchange only sets state synchronously — the redraw() it calls
		// (mount-redraw's own, unlike legacy's synchronous shim.redraw()) is
		// asynchronous, so the resulting style write only lands after this
		// resolves. Same class of fix as popover.test.ts's REDRAW_MARGIN.
		await new Promise((r) => setTimeout(r, 70));

		const handle = app.applier.getHandle(list._id) as any;
		expect(handle.style.width).toBe("344px");
		expect(handle.style.height).toBe("260px");
	});

	it("bindstartrefresh/bindheaderoffset/bindrefreshstatechange forward to the matching callback", () => {
		const events: unknown[] = [];
		const app = mount(() =>
			m(FeedList, {
				items: ["a"],
				renderItem,
				refreshOptions: {
					enableRefresh: true,
					onStartRefresh: (e: unknown) => events.push(["start", e]),
					onRefreshOffsetChange: (e: unknown) => events.push(["offset", e]),
					onRefreshStateChange: (e: unknown) => events.push(["state", e]),
				},
			}),
		);
		const refreshView = app.root.firstChild!;

		fire(refreshView, "startrefresh", { detail: { isManual: true } });
		fire(refreshView, "headeroffset", { detail: { offsetPercent: 0.5, isDragging: true } });
		fire(refreshView, "refreshstatechange", { detail: { state: 2 } });

		expect(events).toEqual([
			["start", { triggeredBy: "drag" }],
			["offset", { offset: 0, headerSize: 0, isDragging: true }], // headerHeight unmeasured yet — 0 until refresh-header's onlayoutchange fires
			["state", { state: 2 }],
		]);
	});

	it("listRef.startRefresh/finishRefresh invoke the matching native UI method on the <refresh> node", async () => {
		const listRef: { startRefresh?: () => Promise<unknown>; finishRefresh?: () => Promise<unknown> } = {};
		const app = mount(() => m(FeedList, { items: ["a"], renderItem, refreshOptions: true, listRef }));
		const refreshView = app.root.firstChild!;
		const handle = app.applier.getHandle(refreshView._id);
		const invokeCalls = () => (globalThis as any).__nodesRefInvokeCalls as { element: unknown; method: string }[];

		await listRef.startRefresh!();
		expect(invokeCalls().filter((c) => c.element === handle).at(-1)?.method).toBe("autoStartRefresh");

		await listRef.finishRefresh!();
		expect(invokeCalls().filter((c) => c.element === handle).at(-1)?.method).toBe("finishRefresh");
	});

	it("listRef.scrollTo forwards to the underlying List's own scrollTo", async () => {
		const listRef: { scrollTo?: (index: number) => Promise<unknown> } = {};
		const app = mount(() => m(FeedList, { items: ["a", "b"], renderItem, listRef }));
		const list = app.root.firstChild!;

		await listRef.scrollTo!(1);

		const handle = app.applier.getHandle(list._id);
		const invokeCalls = (globalThis as any).__nodesRefInvokeCalls as { element: unknown; method: string }[];
		expect(invokeCalls.filter((c) => c.element === handle).at(-1)?.method).toBe("scrollToPosition");
	});
});
