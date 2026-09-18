import { describe, expect, it } from "@rstest/core";
import m from "mithril";
import shim from "mithril-lynx";
import { LazyComponent } from "../src/lazy-component/lazy-component.js";

// LazyComponent's real mechanism is a native exposure-tracking system,
// delivered here as ordinary per-node bind events (onuiappear/onuidisappear)
// rather than the original's background-thread-only global event bus — see
// lazy-component.js's own header for why. These tests drive that the same
// way every other native event in this project is driven: fire it directly
// on the node.

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
const styleOf = (node: any): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const call of papiCalls()) {
    if (call.fn === "__SetInlineStyles" && call.args[0] === node._handle) Object.assign(out, call.args[1] as Record<string, unknown>);
  }
  return out;
};
const attrOf = (node: any, name: string): unknown =>
  papiCalls()
    .filter((c) => c.fn === "__SetAttribute" && c.args[0] === node._handle && c.args[1] === name)
    .at(-1)?.args[2];

describe("lazy-component.js", () => {
  it("renders the placeholder, sized from estimatedStyle, before appearing", () => {
    const root = mount(() => m(LazyComponent, { pid: "p1", scene: "s1", estimatedStyle: { width: "100px", height: "40px" } }, m("text", {}, "real content")));
    const node = root.firstChild;

    expect(node.textContent ?? "").not.toContain("real content");
    expect(styleOf(node).width).toBe("100px");
    expect(styleOf(node).height).toBe("40px");
    expect(attrOf(node, "exposure-id")).toBe("p1");
    expect(attrOf(node, "exposure-scene")).toBe("s1");
    expect(attrOf(node, "exposure-screen-margin-top")).toBe("10px"); // default
  });

  it("swaps in the real children on uiappear, with no wrapper left once shown (default: stays loaded)", () => {
    const root = mount(() => m(LazyComponent, { pid: "p1", scene: "s1", estimatedStyle: {} }, m("text", {}, "real content")));
    const placeholder = root.firstChild;

    fire(placeholder, "uiappear");
    shimModule.redraw();

    expect(root.firstChild.textContent).toBe("real content");
  });

  it("without unmountOnExit, a later uidisappear does not re-show the placeholder", () => {
    const root = mount(() => m(LazyComponent, { pid: "p1", scene: "s1", estimatedStyle: {} }, m("text", {}, "real content")));
    fire(root.firstChild, "uiappear");
    shimModule.redraw();

    fire(root.firstChild, "uidisappear");
    shimModule.redraw();

    expect(root.firstChild.textContent).toBe("real content");
  });

  it("with unmountOnExit, a uidisappear unmounts the children again and keeps the exposure wrapper", () => {
    const root = mount(() => m(LazyComponent, { pid: "p1", scene: "s1", estimatedStyle: { width: "100px", height: "40px" }, unmountOnExit: true }, m("text", {}, "real content")));
    const placeholder = root.firstChild;

    fire(placeholder, "uiappear");
    shimModule.redraw();
    expect(root.firstChild.textContent).toBe("real content");

    fire(root.firstChild, "uidisappear");
    shimModule.redraw();
    expect(root.firstChild.textContent ?? "").not.toContain("real content");
    expect(attrOf(root.firstChild, "exposure-id")).toBe("p1"); // still tracked, so it can re-appear later
  });

  it("with unmountOnExit, the cached real size (not the estimate) is used once it's known", () => {
    const root = mount(() => m(LazyComponent, { pid: "p1", scene: "s1", estimatedStyle: { width: "100px", height: "40px" }, unmountOnExit: true }, m("text", {}, "real content")));
    const placeholder = root.firstChild;

    fire(placeholder, "uiappear");
    shimModule.redraw();
    fire(root.firstChild, "layoutchange", { width: 240, height: 90 });
    fire(root.firstChild, "uidisappear");
    shimModule.redraw();

    expect(styleOf(root.firstChild).width).toBe("240px");
    expect(styleOf(root.firstChild).height).toBe("90px");
  });

  it("onAppear/onDisappear fire for observability", () => {
    // unmountOnExit: true, deliberately — without it, the wrapper carrying
    // the exposure attrs disappears from the tree entirely once shown once
    // (same as the original), so there's nothing left to fire a LATER
    // onDisappear from. See lazy-component.d.ts's own note on this tradeoff.
    const events: string[] = [];
    const root = mount(() =>
      m(
        LazyComponent,
        { pid: "p1", scene: "s1", estimatedStyle: {}, unmountOnExit: true, onAppear: () => events.push("appear"), onDisappear: () => events.push("disappear") },
        m("text", {}, "real content"),
      ),
    );
    fire(root.firstChild, "uiappear");
    shimModule.redraw();
    fire(root.firstChild, "uidisappear");

    expect(events).toEqual(["appear", "disappear"]);
  });

  it("supports the deprecated unloadable prop as an alias for unmountOnExit", () => {
    const root = mount(() => m(LazyComponent, { pid: "p1", scene: "s1", estimatedStyle: {}, unloadable: true }, m("text", {}, "real content")));
    fire(root.firstChild, "uiappear");
    shimModule.redraw();
    fire(root.firstChild, "uidisappear");
    shimModule.redraw();

    expect(root.firstChild.textContent ?? "").not.toContain("real content");
  });
});
