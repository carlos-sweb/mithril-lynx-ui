import { describe, expect, it } from "@rstest/core";
import m from "mithril-runtime";
import { List } from "../src/list/list.js";
import { mount, type Mounted, type TestNode } from "./harness.js";

// Op.CreateList itself (mithril-lynx core) already has its own thorough
// test suite covering the native list contract (recycling, componentAtIndex,
// item-count growth/shrink) and list-cell.js's own background-thread
// rendering — these tests focus on what THIS declarative wrapper adds:
// exposing scrollOrientation/listType/spanCount/style/gap as ordinary
// attrs, keeping the native list's own item count current across
// re-renders, and the scrollTo ref. `renderItem` is a plain prop here,
// same as `view()` — it runs on the background thread through this
// component's own document, see list.js's own header.

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

/** A cell's real, DISPLAYED content is real PAPI elements the main thread
 * materialized by replaying ops list-cell.js already computed (see
 * list-support.js) — it never touches the background thread's own fake-dom
 * tree directly, so it has to be read off the REAL handle (a real jsdom
 * node here), not off the fake-dom `TestNode`. */
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
	const listId = __GetElementUniqueID(handle);
	return handle.componentAtIndex(handle, listId, index, opId);
}

describe("list.js", () => {
	it("renders a native list carrying the required attrs, sized from `items`", () => {
		const app = mount(() => m(List, { renderItem: (item: string) => m("text", {}, item), items: ["a", "b", "c"] }));
		const list = app.root.firstChild!;

		expect(attrsOf(app, list)).toMatchObject({
			"scroll-orientation": "vertical",
			"list-type": "single",
			"span-count": "1",
		});
	});

	it("renderItem(item, index) receives the actual item, not just the index", () => {
		const items = ["Alpha", "Bravo", "Charlie"];
		const app = mount(() => m(List, { renderItem: (item: string, index: number) => m("text", {}, `${index}:${item}`), items }));
		const list = app.root.firstChild!;

		requestCell(app, list, 1);
		const listHandle = app.applier.getHandle(list._id) as any;
		const listItem = listHandle.firstChild;
		expect(listItem.tagName?.toLowerCase() ?? listItem.nodeName?.toLowerCase()).toBe("list-item");
		expect(realTextOf(listItem)).toBe("1:Bravo");
	});

	it("growing/shrinking `items` sends the matching insertAction/removeAction, without recreating the native list", () => {
		let items = ["a", "b", "c"];
		const app = mount(() => m(List, { renderItem: (item: string) => m("text", {}, item), items }));
		const list = app.root.firstChild!;
		const createListCallsBefore = papiCalls().filter((c) => c.fn === "__CreateList").length;

		items = ["a", "b", "c", "d"];
		app.redraw();
		let infoCall = papiCalls()
			.filter((c) => c.fn === "__SetAttribute" && c.args[0] === app.applier.getHandle(list._id) && c.args[1] === "update-list-info")
			.at(-1);
		expect(infoCall?.args[2]).toEqual({ insertAction: [{ position: 3, type: "cell", "item-key": "3" }], removeAction: [], updateAction: [] });

		items = ["a"];
		app.redraw();
		infoCall = papiCalls()
			.filter((c) => c.fn === "__SetAttribute" && c.args[0] === app.applier.getHandle(list._id) && c.args[1] === "update-list-info")
			.at(-1);
		expect(infoCall?.args[2]).toEqual({ insertAction: [], removeAction: [1, 2, 3], updateAction: [] });

		// Same underlying native list throughout — not torn down and rebuilt.
		expect(papiCalls().filter((c) => c.fn === "__CreateList")).toHaveLength(createListCallsBefore);
		expect(app.root.firstChild).toBe(list);
	});

	it("a data change is visible the next time native recycles/requests a cell", () => {
		let items = ["a", "b", "c"];
		const app = mount(() => m(List, { renderItem: (item: string) => m("text", {}, item), items }));
		const list = app.root.firstChild!;

		items = ["x", "y", "z"];
		app.redraw();
		requestCell(app, list, 0, 5);

		const listHandle = app.applier.getHandle(list._id) as any;
		expect(realTextOf(listHandle.firstChild)).toBe("x");
	});

	it("a data change refreshes an already-attached cell's content in place, without a new componentAtIndex call", () => {
		let items = ["a", "b", "c"];
		const app = mount(() => m(List, { renderItem: (item: string) => m("text", {}, item), items }));
		const list = app.root.firstChild!;
		const listHandle = app.applier.getHandle(list._id) as any;

		requestCell(app, list, 0);
		expect(realTextOf(listHandle.firstChild)).toBe("a");

		items = ["z", "b", "c"];
		app.redraw();
		expect(realTextOf(listHandle.firstChild)).toBe("z");
	});

	it("pushes `style` onto the real native list element, not the placeholder view", () => {
		const app = mount(() => m(List, { renderItem: (item: string) => m("text", {}, item), items: ["a"], style: { width: "100%", height: "400px" } }));
		const list = app.root.firstChild!;

		expect(styleOf(app, list)).toMatchObject({ width: "100%", height: "400px" });
	});

	it("listRef.scrollTo invokes scrollToPosition on the native list", async () => {
		const listRef: { scrollTo?: (index: number) => Promise<unknown> } = {};
		const app = mount(() => m(List, { renderItem: (item: string) => m("text", {}, item), items: ["a", "b"], listRef }));
		const list = app.root.firstChild!;

		await listRef.scrollTo!(1);

		const handle = app.applier.getHandle(list._id);
		const calls = (globalThis as any).__nodesRefInvokeCalls as { element: unknown; method: string; params: unknown }[];
		const call = calls.filter((c) => c.element === handle).at(-1);
		expect(call?.method).toBe("scrollToPosition");
		expect(call?.params).toMatchObject({ position: 1, index: 1, useScroller: true });
	});

	it("scrollOrientation/listType/spanCount pass straight through to Op.CreateList", () => {
		const app = mount(() =>
			m(List, { renderItem: (item: string) => m("text", {}, item), items: ["a", "b"], scrollOrientation: "horizontal", listType: "flow", spanCount: 2 }),
		);
		const list = app.root.firstChild!;

		expect(attrsOf(app, list)).toMatchObject({
			"scroll-orientation": "horizontal",
			"list-type": "flow",
			"span-count": "2",
		});
	});

	it("requires a renderItem and fails loudly without one", () => {
		expect(() => mount(() => m(List, { items: ["a"] } as any))).toThrow(/requires a `renderItem`/);
	});
});
