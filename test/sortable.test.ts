import { describe, expect, it } from "@rstest/core";
import m from "mithril-runtime";
import { SortableItem, SortableRoot } from "../src/sortable/sortable.js";
import { mount as harnessMount, fire, type Mounted, type TestNode } from "./harness.js";

// SortableItem is built on Draggable (real <view>, ontouchstart/move/end
// listeners via `fire`, same helpers draggable.test.ts already established)
// — no native gesture arena here, unlike swipe-action.js. Sizes come from a
// "layoutchange" event, fired the same way touch events are: a plain on*
// listener (see sortable.js's header).

interface Item {
	id: string;
	label: string;
}

function mount(
	items: Item[],
	attrs: { onSortEnd?: (data: any[]) => void; onSortStart?: () => void; enableSorting?: boolean; disabled?: Record<string, boolean> } = {},
): Mounted {
	installGeometry(items.length);
	const data = items.map((item) => ({ getSortingKey: () => item.id, dataItem: item }));
	const app = harnessMount(() =>
		m(SortableRoot, {
			className: "sortable-test-root",
			data,
			onSortEnd: attrs.onSortEnd ?? (() => {}),
			onSortStart: attrs.onSortStart,
			enableSorting: attrs.enableSorting,
			children: (item: { getSortingKey: () => string; dataItem: Item }) =>
				m(SortableItem, { sortingKey: item.getSortingKey(), disabled: attrs.disabled?.[item.getSortingKey()] }, m("text", {}, item.dataItem.label)),
		}),
	);

	// Report positions with a 4px gap before any test drives a drag.
	let node: TestNode | null = app.root.firstChild!;
	for (let index = 0; index < items.length; index++) {
		const top = index * 104;
		fire(node!, "layoutchange", { detail: { top, height: 100, bottom: top + 100 } });
		node = node!.nextSibling;
	}
	return app;
}

function installGeometry(itemCount: number) {
	(globalThis as any).__nodesRefInvokeHandler = (element: Element, method: string, _params: unknown, callback: (res: { code: number; data?: unknown }) => void) => {
		if (method !== "boundingClientRect") {
			callback({ code: 0, data: {} });
			return;
		}
		if (element.classList.contains("sortable-test-root")) {
			callback({ code: 0, data: { top: 40, bottom: 40 + Math.max(0, itemCount - 1) * 104 + 100 } });
			return;
		}
		const index = Array.from(element.parentElement?.children ?? []).indexOf(element);
		if (index < 0 || index >= itemCount) {
			callback({ code: 1, data: null });
			return;
		}
		const top = 40 + index * 104;
		callback({ code: 0, data: { top, bottom: top + 100, height: 100 } });
	};
}

/** See draggable.test.ts's own transformOf for why both places are checked. */
function transformOf(app: Mounted, node: TestNode): string | null | undefined {
	const handle = app.applier.getHandle(node._id) as Element & { style: CSSStyleDeclaration };
	return handle.getAttribute("transform") ?? handle.style.transform ?? undefined;
}

const touch = (x: number, y: number) => ({ touches: [{ pageX: x, pageY: y }] });
// Native rects resolve through the selector-query queue; a redraw after a
// completed sort is scheduled separately (~50ms), so this drains both.
const settle = () => new Promise((resolve) => setTimeout(resolve, 70));

const ITEMS: Item[] = [
	{ id: "a", label: "A" },
	{ id: "b", label: "B" },
	{ id: "c", label: "C" },
];

describe("sortable.js", () => {
	it("owns a stable native stacking context before and during selection", async () => {
		const app = mount(ITEMS);
		await settle();
		const container = app.applier.getHandle(app.root._id) as HTMLElement;
		expect(container.style.zIndex).toBe("0");
		const second = app.root.firstChild!.nextSibling!;
		fire(second, "touchstart", touch(0, 100));
		expect(container.style.zIndex).toBe("0");
		expect(transformOf(app, second)).toBe("translate(0px, 0px)");
		fire(second, "touchend", {});
		await settle();
		expect(container.style.zIndex).toBe("0");
	});
	it("dragging an item down past a neighbor moves that neighbor up to make room", async () => {
		const app = mount(ITEMS);
		await settle();
		const itemA = app.root.firstChild!;
		const itemB = itemA.nextSibling!;

		fire(itemA, "touchstart", touch(0, 0));
		expect(itemB.className).toContain("ui-sortable-shifting");
		fire(itemA, "touchmove", touch(0, 104)); // center reaches b's midpoint

		expect(transformOf(app, itemB)).toBe("translate(0px, -104px)");
		fire(itemA, "touchend", {});
		await settle();
		expect(itemB.className).toContain("ui-sortable-settling");
		expect(itemB.className).not.toContain("ui-sortable-shifting");
	});

	it("a small drag that never crosses the threshold doesn't move anything, and reports the unchanged order", async () => {
		const sorted: any[] = [];
		const app = mount(ITEMS, { onSortEnd: (data) => sorted.push(data.map((d: any) => d.dataItem)) });
		await settle();
		const itemA = app.root.firstChild!;

		fire(itemA, "touchstart", touch(0, 0));
		fire(itemA, "touchmove", touch(0, 30)); // before b's midpoint
		fire(itemA, "touchend", {});
		await settle();

		expect(sorted).toEqual([[ITEMS[0], ITEMS[1], ITEMS[2]]]);
	});

	it("a confirmed drag reports the re-sorted data on release, and settles every transform back to 0", async () => {
		const sorted: any[] = [];
		const app = mount(ITEMS, { onSortEnd: (data) => sorted.push(data.map((d: any) => d.dataItem)) });
		await settle();
		const itemA = app.root.firstChild!;
		const itemB = itemA.nextSibling!;

		fire(itemA, "touchstart", touch(0, 0));
		fire(itemA, "touchmove", touch(0, 104));
		fire(itemA, "touchend", {});
		await settle();

		expect(sorted).toEqual([[ITEMS[1], ITEMS[0], ITEMS[2]]]);
		expect(transformOf(app, itemB)).toBe("translate(0px, 0px)");
		expect(transformOf(app, itemA)).toBe("translate(0px, 0px)");
	});

	it("uses the updated data order for a second consecutive drag", async () => {
		let data = ITEMS.map((item) => ({ getSortingKey: () => item.id, dataItem: item }));
		const orders: string[][] = [];
		installGeometry(ITEMS.length);
		const app = harnessMount(() => m(SortableRoot, {
			className: "sortable-test-root",
			data,
			onSortEnd: (sorted) => { data = sorted; orders.push(sorted.map((item) => item.getSortingKey())); },
			children: (item: { getSortingKey: () => string; dataItem: Item }) =>
				m(SortableItem, { sortingKey: item.getSortingKey() }, m("text", {}, item.dataItem.label)),
		}));
		let node: TestNode | null = app.root.firstChild!;
		for (let index = 0; index < ITEMS.length; index++) {
			const top = index * 104;
			fire(node!, "layoutchange", { detail: { top, height: 100 } });
			node = node!.nextSibling;
		}
		await settle();

		const first = app.root.firstChild!;
		fire(first, "touchstart", touch(0, 0));
		fire(first, "touchmove", touch(0, 104));
		fire(first, "touchend", {});
		await settle();
		expect(orders[0]).toEqual(["b", "a", "c"]);

		const third = app.root.firstChild!.nextSibling!.nextSibling!;
		fire(third, "touchstart", touch(0, 208));
		fire(third, "touchmove", touch(0, 104));
		fire(third, "touchend", {});
		await settle();
		expect(orders[1]).toEqual(["b", "c", "a"]);
	});

	it("fires onSortStart when a drag begins", async () => {
		const starts: number[] = [];
		const app = mount(ITEMS, { onSortStart: () => starts.push(1) });
		await settle();
		fire(app.root.firstChild!, "touchstart", touch(0, 0));
		expect(starts.length).toBe(1);
		fire(app.root.firstChild!, "touchend", {});
		await settle();
	});

	it("a disabled item cannot be dragged, and is skipped as a swap target", async () => {
		const sorted: any[] = [];
		const app = mount(ITEMS, { onSortEnd: (data) => sorted.push(data.map((d: any) => d.dataItem)), disabled: { b: true } });
		await settle();
		const itemA = app.root.firstChild!;

		// Cross b's locked slot and c's midpoint.
		fire(itemA, "touchstart", touch(0, 0));
		fire(itemA, "touchmove", touch(0, 208));
		fire(itemA, "touchend", {});
		await settle();

		expect(sorted).toEqual([[ITEMS[2], ITEMS[1], ITEMS[0]]]); // b keeps its absolute slot (index 1)
	});

	it("disabled itself: touching a disabled item's own handle does nothing", async () => {
		const app = mount(ITEMS, { disabled: { a: true } });
		await settle();
		const itemA = app.root.firstChild!;

		fire(itemA, "touchstart", touch(0, 0));
		fire(itemA, "touchmove", touch(0, 60));

		expect(transformOf(app, itemA.nextSibling!)).toBe("translate(0px, 0px)");
		fire(itemA, "touchend", {});
		await settle();
	});

	it("enableSorting: false disables every item at once", async () => {
		const app = mount(ITEMS, { enableSorting: false });
		await settle();
		const itemA = app.root.firstChild!;

		fire(itemA, "touchstart", touch(0, 0));
		fire(itemA, "touchmove", touch(0, 60));

		expect(transformOf(app, itemA.nextSibling!)).toBe("translate(0px, 0px)");
	});

	it("keeps the dragged item within the root at both vertical edges", async () => {
		const upward = mount(ITEMS);
		await settle();
		const middleUp = upward.root.firstChild!.nextSibling!;
		fire(middleUp, "touchstart", touch(0, 144));
		await settle();
		fire(middleUp, "touchmove", touch(0, -1000));
		expect(transformOf(upward, middleUp)).toBe("translate(0px, -104px)");
		fire(middleUp, "touchend", {});
		await settle();

		const downward = mount(ITEMS);
		await settle();
		const middleDown = downward.root.firstChild!.nextSibling!;
		fire(middleDown, "touchstart", touch(0, 144));
		await settle();
		fire(middleDown, "touchmove", touch(0, 2000));
		expect(transformOf(downward, middleDown)).toBe("translate(0px, 104px)");
		fire(middleDown, "touchend", {});
		await settle();
	});

	it("a SortableItem outside SortableRoot fails loudly", () => {
		expect(() => harnessMount(() => m(SortableItem, { sortingKey: "x" }))).toThrow(/must be used inside a <SortableRoot>/);
	});

	it("SortableRoot requires a `children` function attr", () => {
		expect(() => harnessMount(() => m(SortableRoot, { data: [], onSortEnd: () => {}, children: "not a function" as any }))).toThrow(
			/requires a `children` function attr/,
		);
	});
});
