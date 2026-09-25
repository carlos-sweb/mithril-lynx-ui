import { describe, expect, it, rstest } from "@rstest/core";
import m from "mithril-runtime";
import { List } from "../src/list/list.js";
import { mount, fire, type Mounted, type TestNode } from "./harness.js";

// List is a thin wrapper over mithril-lynx's native `list`/`list-item`
// elements (3.0.0+). mithril-lynx core has its own suite for the native
// contract itself (update-list-info diffing, componentAtIndex attach/detach,
// typed attributes, teardown); these tests cover what THIS wrapper adds:
// keyed items from getItemKey, per-item attrs from getItemAttrs, the
// camelCase conveniences and their defaults, pass-through of every other
// attribute and event, and the listRef methods.

function papiCalls(): { fn: string; args: unknown[] }[] {
	return (globalThis as any).__papiCalls;
}

function attrsOf(app: Mounted, node: TestNode): Record<string, unknown> {
	const handle = app.applier.getHandle(node._id);
	const out: Record<string, unknown> = {};
	for (const call of papiCalls()) {
		if (call.fn === "__SetAttribute" && call.args[0] === handle) out[call.args[1] as string] = call.args[2];
	}
	return out;
}

function styleOf(app: Mounted, node: TestNode): Record<string, unknown> {
	const handle = app.applier.getHandle(node._id);
	const out: Record<string, unknown> = {};
	for (const call of papiCalls()) {
		if (call.fn === "__AddInlineStyle" && call.args[0] === handle) out[call.args[1] as string] = call.args[2];
	}
	return out;
}

function lastListInfo(app: Mounted, list: TestNode): any {
	const handle = app.applier.getHandle(list._id);
	return papiCalls()
		.filter((c) => c.fn === "__SetAttribute" && c.args[0] === handle && c.args[1] === "update-list-info")
		.at(-1)?.args[2];
}

function realTextOf(node: any): string {
	if (node == null) return "";
	let out = "";
	for (let child = node.firstChild; child != null; child = child.nextSibling) {
		out += child.nodeType === 3 ? child.nodeValue : realTextOf(child);
	}
	return out;
}

function requestCell(app: Mounted, list: TestNode, index: number, opId = 1) {
	const handle = app.applier.getHandle(list._id) as any;
	return handle.componentAtIndex(handle, __GetElementUniqueID(handle), index, opId, false);
}

const renderItem = (item: string) => m("text", {}, item);
const getItemKey = (item: string) => item;

describe("list.js", () => {
	it("renders a native <list> with the required attrs, typed, defaulting to vertical/single/1", () => {
		const app = mount(() => m(List, { renderItem, getItemKey, items: ["a"] }));
		expect(app.root.tag).toBe("list");
		expect(attrsOf(app, app.root)).toMatchObject({ "scroll-orientation": "vertical", "list-type": "single", "span-count": 1 });
	});

	it("scrollOrientation/listType/spanCount pass straight through", () => {
		const app = mount(() => m(List, { renderItem, getItemKey, items: ["a"], scrollOrientation: "horizontal", listType: "waterfall", spanCount: 2 }));
		expect(attrsOf(app, app.root)).toMatchObject({ "scroll-orientation": "horizontal", "list-type": "waterfall", "span-count": 2 });
	});

	it("every other attribute and event reaches the native list, with its real type", () => {
		const hits: unknown[] = [];
		const app = mount(() =>
			m(List, {
				renderItem,
				getItemKey,
				items: ["a"],
				bounces: false,
				"item-snap": { factor: 0, offset: 0 },
				"lower-threshold-item-count": 2,
				onscrolltolower: (e: any) => hits.push(e.detail),
			}),
		);
		expect(attrsOf(app, app.root)).toMatchObject({ bounces: false, "item-snap": { factor: 0, offset: 0 }, "lower-threshold-item-count": 2 });
		fire(app.root, "scrolltolower", { detail: { scrollTop: 5 } });
		expect(hits).toEqual([{ scrollTop: 5 }]);
	});

	it("keys items with getItemKey, and a middle insert is a single insertAction", () => {
		let items = ["a", "b", "c"];
		const app = mount(() => m(List, { renderItem, getItemKey, items }));
		expect(lastListInfo(app, app.root).insertAction.map((a: any) => a["item-key"])).toEqual(["a", "b", "c"]);

		items = ["a", "x", "b", "c"];
		app.redraw();
		expect(lastListInfo(app, app.root)).toEqual({
			insertAction: [{ position: 1, type: "list-item", "item-key": "x" }],
			removeAction: [],
			updateAction: [],
		});
	});

	it("getItemAttrs adds per-item platform info", () => {
		const app = mount(() =>
			m(List, { renderItem, getItemKey, items: ["h", "a"], getItemAttrs: (item: string) => (item === "h" ? { "full-span": true, "sticky-top": true } : {}) }),
		);
		expect(lastListInfo(app, app.root).insertAction[0]).toEqual({ position: 0, type: "list-item", "item-key": "h", "full-span": true, "sticky-top": true });
	});

	it("renderItem(item, index) content is what native attaches for that index", () => {
		const app = mount(() => m(List, { renderItem: (item: string, index: number) => m("text", {}, `${index}:${item}`), getItemKey, items: ["Alpha", "Bravo"] }));
		requestCell(app, app.root, 1);
		const listHandle = app.applier.getHandle(app.root._id) as any;
		expect(realTextOf(listHandle.firstChild)).toBe("1:Bravo");
	});

	it("a data change refreshes an already-attached item in place", () => {
		let items = [{ id: "a", label: "one" }];
		const app = mount(() => m(List, { renderItem: (item: any) => m("text", {}, item.label), getItemKey: (item: any) => item.id, items }));
		requestCell(app, app.root, 0);
		items = [{ id: "a", label: "two" }];
		app.redraw();
		const listHandle = app.applier.getHandle(app.root._id) as any;
		expect(realTextOf(listHandle.firstChild)).toBe("two");
	});

	it("pushes `style` onto the native list element", () => {
		const app = mount(() => m(List, { renderItem, getItemKey, items: ["a"], style: { width: "100%", height: "400px" } }));
		expect(styleOf(app, app.root)).toMatchObject({ width: "100%", height: "400px" });
	});

	it("listRef exposes the four native methods plus the scrollTo shorthand", async () => {
		const listRef: any = {};
		const app = mount(() => m(List, { renderItem, getItemKey, items: ["a", "b"], listRef }));
		await listRef.scrollTo(1);
		await listRef.scrollToPosition({ position: 1, alignTo: "top", itemKey: "b" });
		await listRef.scrollBy(100);
		await listRef.autoScroll({ rate: "60px", start: true });
		await listRef.getVisibleCells();

		const handle = app.applier.getHandle(app.root._id);
		const calls = ((globalThis as any).__nodesRefInvokeCalls as { element: unknown; method: string; params: unknown }[]).filter((c) => c.element === handle);
		expect(calls.slice(-5).map((c) => c.method)).toEqual(["scrollToPosition", "scrollToPosition", "scrollBy", "autoScroll", "getVisibleCells"]);
		expect(calls.at(-5)?.params).toMatchObject({ position: 1, index: 1, useScroller: true });
		expect(calls.at(-3)?.params).toEqual({ offset: 100 });
	});

	it("warns once when getItemKey is missing, and falls back to index keys", () => {
		const warn = rstest.spyOn(console, "warn").mockImplementation(() => {});
		const app = mount(() => m(List, { renderItem, items: ["a", "b"] }));
		app.redraw();
		expect(warn.mock.calls.filter((c) => String(c[0]).includes("getItemKey"))).toHaveLength(1);
		expect(lastListInfo(app, app.root).insertAction.map((a: any) => a["item-key"])).toEqual(["0", "1"]);
		warn.mockRestore();
	});

	it("requires a renderItem and fails loudly without one", () => {
		expect(() => mount(() => m(List, { items: ["a"] } as any))).toThrow(/requires a `renderItem`/);
	});
});
