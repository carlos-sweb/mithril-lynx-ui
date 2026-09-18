import { describe, expect, it } from "@rstest/core";
import m from "mithril";
import shim from "mithril-lynx";
import { SortableItem, SortableRoot } from "../src/sortable/sortable.js";

// SortableItem is built on Draggable (real <view>, ontouchstart/move/end
// listeners via `fire`, same helpers draggable.test.ts already established)
// — no native gesture arena here, unlike swipe-action.js. Sizes come from a
// "layoutchange" event, fired the same way touch events are: a plain on*
// listener (see sortable.js's header).

const shimModule = ((shim as any).default ?? shim) as {
  renderToPage(pageElement: unknown, vnode: unknown): unknown;
  redraw(): void;
};

interface Item {
  id: string;
  label: string;
}

function mount(items: Item[], attrs: { onSortEnd?: (data: any[]) => void; onSortStart?: () => void; enableSorting?: boolean; disabled?: Record<string, boolean> } = {}) {
  lynxTestingEnv.switchToMainThread();
  const page = __CreatePage("0", 0);
  const data = items.map((item) => ({ getSortingKey: () => item.id, dataItem: item }));
  const root = shimModule.renderToPage(
    page,
    m({
      view: () =>
        m(SortableRoot, {
          data,
          onSortEnd: attrs.onSortEnd ?? (() => {}),
          onSortStart: attrs.onSortStart,
          enableSorting: attrs.enableSorting,
          children: (item: { getSortingKey: () => string; dataItem: Item }) =>
            m(SortableItem, { sortingKey: item.getSortingKey(), disabled: attrs.disabled?.[item.getSortingKey()] }, m("text", {}, item.dataItem.label)),
        }),
    }),
  ) as any;

  // Report every item's height (uniform, 100) before any test drives a drag —
  // the swap algorithm needs sizeMap populated to do anything meaningful.
  let node = root.firstChild;
  for (const item of items) {
    fire(node, "layoutchange", { detail: { height: 100 } });
    node = node.nextSibling;
  }
  return root;
}

const papiCalls = (): { fn: string; args: unknown[] }[] => (globalThis as any).__papiCalls;

const transformOf = (node: any): string | undefined => {
  const call = papiCalls()
    .filter((c) => c.fn === "__SetInlineStyles" && c.args[0] === node._handle && (c.args[1] as Record<string, unknown>)?.transform !== undefined)
    .at(-1);
  return (call?.args[1] as Record<string, string> | undefined)?.transform;
};

function fire(node: any, type: string, payload: Record<string, unknown> = {}) {
  node._listeners[type]?.wrapped({ type, ...payload });
}

const touch = (x: number, y: number) => ({ touches: [{ pageX: x, pageY: y }] });

const ITEMS: Item[] = [
  { id: "a", label: "A" },
  { id: "b", label: "B" },
  { id: "c", label: "C" },
];

describe("sortable.js", () => {
  it("dragging an item down past a neighbor moves that neighbor up to make room", () => {
    const root = mount(ITEMS);
    const itemA = root.firstChild;
    const itemB = itemA.nextSibling;

    fire(itemA, "touchstart", touch(0, 0));
    fire(itemA, "touchmove", touch(0, 60)); // 60% of b's 100px height — confirms the swap

    // Live-tracks proportionally to how far into b's own span the drag has
    // gone (-60, not -100) — a settle to the full -100 only happens once the
    // drag moves PAST b onto the next target (see clampPrevious in
    // internal/sortable-utils.js) or the drag ends.
    expect(transformOf(itemB)).toBe("translate(0px, -60px)");
  });

  it("a small drag that never crosses the threshold doesn't move anything, and reports the unchanged order", () => {
    const sorted: any[] = [];
    const root = mount(ITEMS, { onSortEnd: (data) => sorted.push(data.map((d: any) => d.dataItem)) });
    const itemA = root.firstChild;

    fire(itemA, "touchstart", touch(0, 0));
    fire(itemA, "touchmove", touch(0, 30)); // 30% — below the 50% confirm threshold
    fire(itemA, "touchend", {});

    expect(sorted).toEqual([[ITEMS[0], ITEMS[1], ITEMS[2]]]);
  });

  it("a confirmed drag reports the re-sorted data on release, and settles every transform back to 0", () => {
    const sorted: any[] = [];
    const root = mount(ITEMS, { onSortEnd: (data) => sorted.push(data.map((d: any) => d.dataItem)) });
    const itemA = root.firstChild;
    const itemB = itemA.nextSibling;

    fire(itemA, "touchstart", touch(0, 0));
    fire(itemA, "touchmove", touch(0, 60));
    fire(itemA, "touchend", {});

    expect(sorted).toEqual([[ITEMS[1], ITEMS[0], ITEMS[2]]]);
    expect(transformOf(itemB)).toBe("translate(0px, 0px)");
    expect(transformOf(itemA)).toBe("translate(0px, 0px)");
  });

  it("fires onSortStart when a drag begins", () => {
    const starts: number[] = [];
    const root = mount(ITEMS, { onSortStart: () => starts.push(1) });
    fire(root.firstChild, "touchstart", touch(0, 0));
    expect(starts.length).toBe(1);
  });

  it("a disabled item cannot be dragged, and is skipped as a swap target", () => {
    const sorted: any[] = [];
    const root = mount(ITEMS, { onSortEnd: (data) => sorted.push(data.map((d: any) => d.dataItem)), disabled: { b: true } });
    const itemA = root.firstChild;
    const itemB = itemA.nextSibling;
    const itemC = itemB.nextSibling;

    // Dragging a past b (disabled, size 100) and deep into c (60% of c) should
    // target c directly, leaving b's own position untouched.
    fire(itemA, "touchstart", touch(0, 0));
    fire(itemA, "touchmove", touch(0, 160));
    fire(itemA, "touchend", {});

    expect(sorted).toEqual([[ITEMS[2], ITEMS[1], ITEMS[0]]]); // b keeps its absolute slot (index 1)
    void itemC;
  });

  it("disabled itself: touching a disabled item's own handle does nothing", () => {
    const root = mount(ITEMS, { disabled: { a: true } });
    const itemA = root.firstChild;
    expect(itemA._listeners.touchstart).toBeUndefined();
  });

  it("enableSorting: false disables every item at once", () => {
    const root = mount(ITEMS, { enableSorting: false });
    expect(root.firstChild._listeners.touchstart).toBeUndefined();
  });

  it("a SortableItem outside SortableRoot fails loudly", () => {
    lynxTestingEnv.switchToMainThread();
    const page = __CreatePage("0", 0);
    expect(() => shimModule.renderToPage(page, m({ view: () => m(SortableItem, { sortingKey: "x" }) }))).toThrow(
      /must be used inside a <SortableRoot>/,
    );
  });

  it("SortableRoot requires a `children` function attr", () => {
    lynxTestingEnv.switchToMainThread();
    const page = __CreatePage("0", 0);
    expect(() =>
      shimModule.renderToPage(
        page,
        m({ view: () => m(SortableRoot, { data: [], onSortEnd: () => {}, children: "not a function" as any }) }),
      ),
    ).toThrow(/requires a `children` function attr/);
  });
});
