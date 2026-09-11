import { describe, expect, it } from "@rstest/core";
import m from "mithril";
import shim from "mithril-lynx";
import { Draggable } from "../draggable.js";

// The drag position is written straight to the node rather than through a
// redraw (a diff per touchmove would be wasted work), so these assert on the
// inline style that actually reaches the element, not on rendered output.

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

/** The last transform written to a node, e.g. "translate(10px, 4px)". */
const transformOf = (node: any): string | undefined => {
  const call = papiCalls()
    .filter(
      (c) =>
        c.fn === "__SetInlineStyles" &&
        c.args[0] === node._handle &&
        (c.args[1] as Record<string, unknown>)?.transform !== undefined,
    )
    .at(-1);
  return (call?.args[1] as Record<string, string> | undefined)?.transform;
};

const touch = (x: number, y: number) => ({ touches: [{ pageX: x, pageY: y }] });

function fire(node: any, type: string, payload: Record<string, unknown> = {}) {
  node._listeners[type]?.wrapped({ type, ...payload });
}

describe("draggable.js", () => {
  it("moves by the delta from where the drag began", () => {
    const root = mount(() => m(Draggable, { trigger: "immediate" }));
    const node = root.firstChild;

    fire(node, "touchstart", touch(100, 200));
    fire(node, "touchmove", touch(130, 180));

    expect(transformOf(node)).toBe("translate(30px, -20px)");
  });

  it("accumulates across separate drags instead of restarting from zero", () => {
    const root = mount(() => m(Draggable, { trigger: "immediate" }));
    const node = root.firstChild;

    fire(node, "touchstart", touch(0, 0));
    fire(node, "touchmove", touch(10, 0));
    fire(node, "touchend", {});

    fire(node, "touchstart", touch(50, 50));
    fire(node, "touchmove", touch(55, 50));

    expect(transformOf(node)).toBe("translate(15px, 0px)");
  });

  it("clamps to explicit bounds", () => {
    const root = mount(() =>
      m(Draggable, { trigger: "immediate", minTranslateX: -10, maxTranslateX: 10 }),
    );
    const node = root.firstChild;

    fire(node, "touchstart", touch(0, 0));
    fire(node, "touchmove", touch(999, 0));
    expect(transformOf(node)).toBe("translate(10px, 0px)");

    fire(node, "touchmove", touch(-999, 0));
    expect(transformOf(node)).toBe("translate(-10px, 0px)");
  });

  it("allowedDirection pins the axis it excludes", () => {
    const root = mount(() => m(Draggable, { trigger: "immediate", allowedDirection: "right" }));
    const node = root.firstChild;

    fire(node, "touchstart", touch(0, 0));
    fire(node, "touchmove", touch(40, 40));

    // Right is allowed; left, up and down all clamp to 0.
    expect(transformOf(node)).toBe("translate(40px, 0px)");

    fire(node, "touchmove", touch(-40, 0));
    expect(transformOf(node)).toBe("translate(0px, 0px)");
  });

  it("resetOnEnd snaps back", () => {
    const root = mount(() => m(Draggable, { trigger: "immediate", resetOnEnd: true }));
    const node = root.firstChild;

    fire(node, "touchstart", touch(0, 0));
    fire(node, "touchmove", touch(25, 25));
    expect(transformOf(node)).toBe("translate(25px, 25px)");

    fire(node, "touchend", {});
    expect(transformOf(node)).toBe("translate(0px, 0px)");
  });

  it("reports start, move and end to the app", () => {
    const events: string[] = [];
    const root = mount(() =>
      m(Draggable, {
        trigger: "immediate",
        onDragStart: () => events.push("start"),
        onDragging: (t: { x: number }) => events.push(`move:${t.x}`),
        onDragEnd: (t: { x: number }) => events.push(`end:${t.x}`),
      }),
    );
    const node = root.firstChild;

    fire(node, "touchstart", touch(0, 0));
    fire(node, "touchmove", touch(7, 0));
    fire(node, "touchend", {});

    expect(events).toEqual(["start", "move:7", "end:7"]);
  });

  it("keeps its position across a redraw", () => {
    // Regression: an app mirroring onDragging into state redraws mid-drag,
    // and Mithril's style diff was removing the imperatively-written
    // transform because the rendered attrs didn't carry it. On device the
    // reported offset kept climbing while the element sat still.
    const root = mount(() => m(Draggable, { trigger: "immediate" }));
    const node = root.firstChild;

    fire(node, "touchstart", touch(0, 0));
    fire(node, "touchmove", touch(60, 0));
    expect(transformOf(node)).toBe("translate(60px, 0px)");

    shimModule.redraw();
    expect(transformOf(node)).toBe("translate(60px, 0px)");
  });

  it("ignores movement that never started with a press", () => {
    // transform is always rendered now (see the redraw regression above), so
    // the baseline is "translate(0px, 0px)" from the very first render, not
    // absent — the thing under test is that stray movement doesn't change it.
    const root = mount(() => m(Draggable, { trigger: "immediate" }));
    const node = root.firstChild;
    const baseline = transformOf(node);

    fire(node, "touchmove", touch(50, 50));
    expect(transformOf(node)).toBe(baseline);
    expect(transformOf(node)).toBe("translate(0px, 0px)");
  });

  it("defaults to longpress, and attaches nothing when disabled", () => {
    const byLongPress = mount(() => m(Draggable, {})).firstChild;
    expect(byLongPress._listeners.longpress).toBeDefined();
    expect(byLongPress._listeners.touchstart).toBeUndefined();

    const disabled = mount(() => m(Draggable, { enableDragging: false })).firstChild;
    expect(disabled._listeners.longpress).toBeUndefined();
    expect(disabled._listeners.touchmove).toBeUndefined();
  });
});
