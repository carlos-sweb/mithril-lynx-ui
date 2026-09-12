import { describe, expect, it } from "@rstest/core";
import m from "mithril";
import shim from "mithril-lynx";
import { List } from "../list.js";

// createList() itself (mithril-lynx core) already has its own thorough
// device-verified test suite — these tests focus on what THIS declarative
// wrapper adds: turning an `items` array + renderItem(item, index) into
// core's index-based API, keeping that translation current across
// re-renders, setItemCount on an items-length change, style push-through
// (createList() itself has no notion of style), and the scrollTo ref.

const shimModule = ((shim as any).default ?? shim) as {
  renderToPage(pageElement: unknown, vnode: unknown): unknown;
  redraw(): void;
};

function mount(view: () => unknown): any {
  lynxTestingEnv.switchToMainThread();
  const page = __CreatePage("0", 0);
  return shimModule.renderToPage(page, m({ view })) as any;
}

const papiCalls = (): { fn: string; args: unknown[] }[] => (globalThis as any).__papiCalls;
const callsOf = (fn: string) => papiCalls().filter((c) => c.fn === fn);
const lastCallOf = (fn: string) => callsOf(fn).at(-1);

function requestCell(list: any, index: number, opId = 1) {
  const listId = __GetElementUniqueID(list._handle);
  return list._handle.componentAtIndex(list._handle, listId, index, opId);
}

describe("list.js", () => {
  it("renders a native list carrying the required attrs, sized from `items`", () => {
    const root = mount(() =>
      m(List, { items: ["a", "b", "c"], renderItem: (item: string) => m("text", {}, item) }),
    );
    const list = root.firstChild.firstChild;

    // createList()'s own return shape is {_handle, nodeType, setItemCount} —
    // not a full LynxNodeWrapper with its own `_tag` — so identity is
    // checked via `_handle`-addressed PAPI calls, same as core's own Tier 2
    // list tests do.
    const attrsOfList = callsOf("__SetAttribute").filter((c) => c.args[0] === list._handle);
    expect(attrsOfList).toEqual(
      expect.arrayContaining([
        { fn: "__SetAttribute", args: [list._handle, "scroll-orientation", "vertical"] },
        { fn: "__SetAttribute", args: [list._handle, "list-type", "single"] },
        { fn: "__SetAttribute", args: [list._handle, "span-count", "1"] },
      ]),
    );
  });

  it("renderItem(item, index) receives the actual item, not just the index", () => {
    const items = ["Alpha", "Bravo", "Charlie"];
    const root = mount(() => m(List, { items, renderItem: (item: string) => m("text", {}, item) }));
    const list = root.firstChild.firstChild;

    requestCell(list, 1);
    const listItem = list.firstChild;
    expect(listItem._tag).toBe("list-item");
    expect(listItem.textContent).toBe("Bravo");
  });

  it("a custom itemKey receives (item, index) too", () => {
    const items = [{ id: "x1" }, { id: "x2" }];
    const root = mount(() =>
      m(List, { items, renderItem: (item: { id: string }) => m("text", {}, item.id), itemKey: (item: { id: string }) => item.id }),
    );
    const list = root.firstChild.firstChild;

    requestCell(list, 1);
    const listItem = list.firstChild;
    const itemKeyCall = callsOf("__SetAttribute").find((c) => c.args[0] === listItem._handle && c.args[1] === "item-key");
    expect(itemKeyCall?.args[2]).toBe("x2");
  });

  it("growing/shrinking `items` sends the matching insertAction/removeAction, without recreating the native list", () => {
    let items = ["a", "b", "c"];
    const root = mount(() => m(List, { items, renderItem: (item: string) => m("text", {}, item) }));
    const list = root.firstChild.firstChild;
    const createListCallsBefore = callsOf("__CreateList").length;

    items = ["a", "b", "c", "d"];
    shimModule.redraw();
    let infoCall = callsOf("__SetAttribute").filter((c) => c.args[0] === list._handle && c.args[1] === "update-list-info").at(-1);
    expect(infoCall?.args[2]).toEqual({ insertAction: [{ position: 3, type: "cell", "item-key": "3" }], removeAction: [], updateAction: [] });

    items = ["a"];
    shimModule.redraw();
    infoCall = callsOf("__SetAttribute").filter((c) => c.args[0] === list._handle && c.args[1] === "update-list-info").at(-1);
    expect(infoCall?.args[2]).toEqual({ insertAction: [], removeAction: [1, 2, 3], updateAction: [] });

    // Same underlying native list throughout — not torn down and rebuilt.
    expect(callsOf("__CreateList")).toHaveLength(createListCallsBefore);
    expect(root.firstChild.firstChild).toBe(list);
  });

  it("a data change is visible the next time native recycles/requests a cell", () => {
    let items = ["a", "b", "c"];
    const root = mount(() => m(List, { items, renderItem: (item: string) => m("text", {}, item) }));
    const list = root.firstChild.firstChild;

    items = ["x", "y", "z"];
    shimModule.redraw();
    requestCell(list, 0, 5);

    expect(list.firstChild.textContent).toBe("x");
  });

  it("pushes `style` onto the real native list element, not the placeholder view", () => {
    const root = mount(() =>
      m(List, { items: ["a"], renderItem: (item: string) => m("text", {}, item), style: { width: "100%", height: "400px" } }),
    );
    const list = root.firstChild.firstChild;

    // Filtered by the list's own handle — the placeholder view gets its own
    // (empty) __SetInlineStyles call from Mithril's ordinary element
    // creation, which isn't what this test is about.
    const styleCall = callsOf("__SetInlineStyles").filter((c) => c.args[0] === list._handle).at(-1);
    expect(styleCall?.args).toEqual([list._handle, { width: "100%", height: "400px" }]);
  });

  it("listRef.scrollTo invokes scrollToPosition on the native list", () => {
    const listRef: { scrollTo?: (index: number) => Promise<unknown> } = {};
    const root = mount(() => m(List, { items: ["a", "b"], renderItem: (item: string) => m("text", {}, item), listRef }));
    const list = root.firstChild.firstChild;

    void listRef.scrollTo!(1);

    const invokeCall = lastCallOf("__InvokeUIMethod");
    expect(invokeCall?.args[0]).toBe(list._handle);
    expect(invokeCall?.args[1]).toBe("scrollToPosition");
    expect(invokeCall?.args[2]).toMatchObject({ position: 1, index: 1, useScroller: true });
  });

  it("scrollOrientation/listType/spanCount pass straight through to createList", () => {
    const root = mount(() =>
      m(List, {
        items: ["a", "b"],
        renderItem: (item: string) => m("text", {}, item),
        scrollOrientation: "horizontal",
        listType: "flow",
        spanCount: 2,
      }),
    );
    const list = root.firstChild.firstChild;

    const attrsOfList = callsOf("__SetAttribute").filter((c) => c.args[0] === list._handle);
    expect(attrsOfList).toEqual(
      expect.arrayContaining([
        { fn: "__SetAttribute", args: [list._handle, "scroll-orientation", "horizontal"] },
        { fn: "__SetAttribute", args: [list._handle, "list-type", "flow"] },
        { fn: "__SetAttribute", args: [list._handle, "span-count", "2"] },
      ]),
    );
  });
});
