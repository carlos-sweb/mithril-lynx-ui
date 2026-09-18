import { describe, expect, it } from "@rstest/core";
import m from "mithril";
import shim from "mithril-lynx";
import { FeedList } from "../src/feed-list/feed-list.js";

// FeedList here is List (already its own thoroughly-tested wrapper around
// core's createList()) plus two additions: a native <refresh>/<refresh-header>
// wrapper, and a load-more footer sentinel item. These tests focus on what
// THIS file adds, driving native events the same way every other native
// event in this project is driven: fire it directly on the node.

const shimModule = ((shim as any).default ?? shim) as {
  renderToPage(pageElement: unknown, vnode: unknown): unknown;
  redraw(): void;
};

function mount(view: () => unknown): any {
  lynxTestingEnv.switchToMainThread();
  const page = __CreatePage("0", 0);
  return shimModule.renderToPage(page, m({ view })) as any;
}

function fire(node: any, type: string, detail: Record<string, unknown> = {}) {
  node._listeners[type]?.wrapped({ type, detail });
}

const papiCalls = (): { fn: string; args: unknown[] }[] => (globalThis as any).__papiCalls;
const callsOf = (fn: string) => papiCalls().filter((c) => c.fn === fn);
const lastCallOf = (fn: string) => callsOf(fn).at(-1);
const attrOf = (node: any, name: string): unknown =>
  papiCalls()
    .filter((c) => c.fn === "__SetAttribute" && c.args[0] === node._handle && c.args[1] === name)
    .at(-1)?.args[2];

function requestCell(list: any, index: number, opId = 1) {
  const listId = __GetElementUniqueID(list._handle);
  return list._handle.componentAtIndex(list._handle, listId, index, opId);
}

describe("feed-list.js", () => {
  it("with no refreshOptions and no onLoadMore, it's just List — no <refresh> wrapper, no footer item", () => {
    const items = ["a", "b"];
    const root = mount(() => m(FeedList, { items, renderItem: (item: string) => m("text", {}, item) }));

    expect(root.firstChild._tag).not.toBe("refresh");
    const list = root.firstChild.firstChild;
    requestCell(list, 0);
    requestCell(list, 1);
    expect(callsOf("__CreateList")).toHaveLength(1);
    // No synthetic footer index was added: native's own itemCount is still 2,
    // so asking for a 3rd cell is genuinely out of range.
    expect(() => requestCell(list, 2)).toThrow(/out of range/);
  });

  it("wraps List in a native <refresh>/<refresh-header> when refreshOptions is truthy", () => {
    const root = mount(() =>
      m(FeedList, { items: ["a"], renderItem: (item: string) => m("text", {}, item), refreshOptions: true, listId: "feed1" }),
    );

    const refreshView = root.firstChild.firstChild;
    expect(refreshView._tag).toBe("refresh");
    expect(attrOf(refreshView, "enable-refresh")).toBe("true");
    expect(refreshView.firstChild._tag).toBe("refresh-header");
    expect(refreshView.firstChild.nextSibling.firstChild._tag).not.toBeUndefined(); // the real native list
  });

  it("pushes <refresh>'s own measured layout size to the inner List as explicit pixels, not a percentage", () => {
    // A percentage style on List here does NOT reliably resolve against
    // <refresh> as a parent (confirmed on device: the list's items rendered
    // shrink-wrapped to content width while <refresh> itself filled its box
    // correctly) — see feed-list.js's own comment on this. The fix measures
    // <refresh> via its own onlayoutchange and pushes real pixels instead.
    const root = mount(() =>
      m(FeedList, {
        items: ["a"],
        renderItem: (item: string) => m("text", {}, item),
        refreshOptions: true,
        style: { width: "100%", height: "260px" },
      }),
    );
    const refreshView = root.firstChild.firstChild;
    const list = refreshView.firstChild.nextSibling.firstChild;

    fire(refreshView, "layoutchange", { width: 344, height: 260 });

    // __SetInlineStyles merges directly onto the native handle's own style
    // (`Object.assign(e.style, styles)`, both on device and in this test
    // env — `list.style` itself is a separate, unrelated LynxStyleProxy used
    // by mithril's own generic view rendering, not by wrapElement()'s direct
    // PAPI calls). So the handle's own live style is the right thing to
    // assert on — not "the last logged call", which can legitimately include
    // a harmless empty {} from onupdate's hook running twice per redraw (see
    // list.js's own comment on this).
    expect(list._handle.style.width).toBe("344px");
    expect(list._handle.style.height).toBe("260px");
  });

  it("bindstartrefresh/bindheaderoffset/bindrefreshstatechange forward to the matching callback", () => {
    const events: unknown[] = [];
    const root = mount(() =>
      m(FeedList, {
        items: ["a"],
        renderItem: (item: string) => m("text", {}, item),
        refreshOptions: {
          enableRefresh: true,
          onStartRefresh: (e: unknown) => events.push(["start", e]),
          onRefreshOffsetChange: (e: unknown) => events.push(["offset", e]),
          onRefreshStateChange: (e: unknown) => events.push(["state", e]),
        },
      }),
    );
    const refreshView = root.firstChild.firstChild;

    fire(refreshView, "startrefresh", { isManual: true });
    fire(refreshView, "headeroffset", { offsetPercent: 0.5, isDragging: true });
    fire(refreshView, "refreshstatechange", { state: 2 });

    expect(events).toEqual([
      ["start", { triggeredBy: "drag" }],
      ["offset", { offset: 0, headerSize: 0, isDragging: true }], // headerHeight unmeasured yet — 0 until refresh-header's onlayoutchange fires
      ["state", { state: 2 }],
    ]);
  });

  it("listRef.startRefresh/finishRefresh invoke the matching native UI method on the <refresh> node", () => {
    const listRef: { startRefresh?: () => Promise<unknown>; finishRefresh?: () => Promise<unknown> } = {};
    const root = mount(() =>
      m(FeedList, { items: ["a"], renderItem: (item: string) => m("text", {}, item), refreshOptions: true, listRef }),
    );
    const refreshView = root.firstChild.firstChild;

    void listRef.startRefresh!();
    let invokeCall = lastCallOf("__InvokeUIMethod");
    expect(invokeCall?.args[0]).toBe(refreshView._handle);
    expect(invokeCall?.args[1]).toBe("autoStartRefresh");

    void listRef.finishRefresh!();
    invokeCall = lastCallOf("__InvokeUIMethod");
    expect(invokeCall?.args[0]).toBe(refreshView._handle);
    expect(invokeCall?.args[1]).toBe("finishRefresh");
  });

  it("listRef.scrollTo forwards to the underlying List's own scrollTo", () => {
    const listRef: { scrollTo?: (index: number) => Promise<unknown> } = {};
    const root = mount(() => m(FeedList, { items: ["a", "b"], renderItem: (item: string) => m("text", {}, item), listRef }));
    const list = root.firstChild.firstChild;

    void listRef.scrollTo!(1);

    const invokeCall = lastCallOf("__InvokeUIMethod");
    expect(invokeCall?.args[0]).toBe(list._handle);
    expect(invokeCall?.args[1]).toBe("scrollToPosition");
  });

  it("renders a load-more footer as the list's last item, and fires onLoadMore exactly once when it appears", () => {
    let loadMoreCount = 0;
    const items = ["a", "b"];
    const root = mount(() =>
      m(FeedList, {
        items,
        renderItem: (item: string) => m("text", {}, item),
        onLoadMore: () => { loadMoreCount += 1; },
        loadMoreFooter: () => m("text", {}, "Cargando..."),
      }),
    );
    const list = root.firstChild.firstChild;

    requestCell(list, 2); // synthetic footer index === items.length
    // list.firstChild is native's own "list-item" wrapper (see list.js's
    // createList()); the footer view combinedRenderItem actually returned is
    // one level in.
    const footer = list.firstChild.firstChild;
    expect(footer.textContent).toBe("Cargando...");

    fire(footer, "uiappear");
    fire(footer, "uiappear"); // a second appear before any status change must not double-fire
    expect(loadMoreCount).toBe(1);
  });

  it("renders real content again if native re-requests the SAME footer cell a second time (recycling)", () => {
    // Regression test: loadMoreFooter/noMoreDataFooter are FUNCTIONS, called
    // fresh per request — passing a single static vnode straight through
    // rendered BLANK on the second componentAtIndex call for the same
    // index, since Mithril treats a vnode object it already mounted once as
    // an in-place update rather than fresh content for the new wrapper.
    const items = ["a"];
    const root = mount(() =>
      m(FeedList, {
        items,
        renderItem: (item: string) => m("text", {}, item),
        onLoadMore: () => {},
        loadMoreFooter: () => m("text", {}, "Cargando..."),
      }),
    );
    const list = root.firstChild.firstChild;

    requestCell(list, 1);
    requestCell(list, 1, 2); // same index, different opId — native re-requesting (e.g. recycle) it
    const secondFooter = list.firstChild.nextSibling.firstChild;

    expect(secondFooter.textContent).toBe("Cargando...");
  });

  it("changeHasMoreStatus(false) swaps in noMoreDataFooter and stops further onLoadMore calls", () => {
    let loadMoreCount = 0;
    const listRef: { changeHasMoreStatus?: (hasMore: boolean) => void } = {};
    const items = ["a"];
    const root = mount(() =>
      m(FeedList, {
        items,
        renderItem: (item: string) => m("text", {}, item),
        onLoadMore: () => { loadMoreCount += 1; },
        loadMoreFooter: () => m("text", {}, "Cargando..."),
        noMoreDataFooter: () => m("text", {}, "No hay más"),
        listRef,
      }),
    );
    const list = root.firstChild.firstChild;
    requestCell(list, 1);

    listRef.changeHasMoreStatus!(false);
    shimModule.redraw();
    requestCell(list, 1, 2);
    // Nothing was recycled (enqueueComponent, native's own signal that a cell
    // scrolled out, never ran), so this second request binds a brand-new
    // "list-item" wrapper APPENDED after the still-attached first one rather
    // than replacing it — the freshly-bound content is the second sibling.
    const footer = list.firstChild.nextSibling.firstChild;
    expect(footer.textContent).toBe("No hay más");

    fire(footer, "uiappear");
    expect(loadMoreCount).toBe(0);
  });

  it("uidisappear on the footer allows onLoadMore to fire again on a later uiappear", () => {
    let loadMoreCount = 0;
    const items = ["a"];
    const root = mount(() =>
      m(FeedList, {
        items,
        renderItem: (item: string) => m("text", {}, item),
        onLoadMore: () => { loadMoreCount += 1; },
        loadMoreFooter: () => m("text", {}, "Cargando..."),
      }),
    );
    const list = root.firstChild.firstChild;
    requestCell(list, 1);
    const footer = list.firstChild.firstChild;

    fire(footer, "uiappear");
    fire(footer, "uidisappear");
    fire(footer, "uiappear");

    expect(loadMoreCount).toBe(2);
  });
});
