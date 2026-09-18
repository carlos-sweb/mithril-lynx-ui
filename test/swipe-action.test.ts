import { describe, expect, it } from "@rstest/core";
import m from "mithril";
import shim from "mithril-lynx-v1";
import { SwipeAction } from "../src/swipe-action/swipe-action.js";

// swipe-action.js registers a real native gesture (mithril-lynx/gesture's
// createGesture(), type "native") rather than plain on* touch listeners —
// see the component's own header for why. Native dispatches a gesture
// callback through globalThis.runWorklet(ctx, [event, controller]), the
// same mechanism mithril-lynx core's own test/gesture.test.ts exercises, so
// these tests extract the registered callback from the __SetGestureDetector
// call and drive it the same way.

const shimModule = ((shim as any).default ?? shim) as {
  renderToPage(pageElement: unknown, vnode: unknown): unknown;
  redraw(): void;
};

const DISPLAY_RECT = { left: 0, top: 0, width: 300, height: 60 };
const ACTION_RECT = { left: 300, top: 0, width: 80, height: 60 };

let invokeCallCount = 0;

function mount(attrs: Record<string, unknown> = {}): any {
  invokeCallCount = 0;
  lynxTestingEnv.switchToMainThread();
  (globalThis as any).__InvokeUIMethod = (_node: unknown, method: string, params: unknown, callback: (r: unknown) => void) => {
    if (method === "boundingClientRect") {
      // The two children are queried in a fixed order (display, then
      // action) — see oncreate()'s own s.displayEl/s.actionEl wiring.
      const rect = invokeCallCount % 2 === 0 ? DISPLAY_RECT : ACTION_RECT;
      invokeCallCount++;
      callback({ code: 0, data: rect });
    } else {
      callback({ code: 0, data: { method, params } });
    }
    return [];
  };
  const page = __CreatePage("0", 0);
  // Wrapped in an anonymous root (same as draggable.test.ts/slider.test.ts)
  // rather than mounting SwipeAction directly — mounting the SAME component
  // reference as the root across many `it()` blocks in this file confused
  // the shim's redraw bookkeeping (a later shimModule.redraw() call hit a
  // PRIOR test's already-removed root, whose vnode.attrs had been cleared,
  // throwing inside view()). A fresh anonymous component object per mount()
  // call gives each test its own root identity.
  return shimModule.renderToPage(page, m({ view: () => m(SwipeAction, attrs) })) as any;
}

const papiCalls = (): { fn: string; args: unknown[] }[] => (globalThis as any).__papiCalls;
const lastCallOf = (fn: string) => papiCalls().filter((c) => c.fn === fn).at(-1);

const transformOf = (node: any): string | undefined => {
  const call = papiCalls()
    .filter((c) => c.fn === "__SetInlineStyles" && c.args[0] === node._handle && (c.args[1] as Record<string, unknown>)?.transform !== undefined)
    .at(-1);
  return (call?.args[1] as Record<string, string> | undefined)?.transform;
};

function gestureCallback(name: string): (event: unknown, controller: unknown) => void {
  const args = lastCallOf("__SetGestureDetector")?.args as any[];
  const entry = (args[3].callbacks as { name: string; callback: unknown }[]).find((c) => c.name === name);
  if (entry == null) throw new Error(`no "${name}" gesture callback registered`);
  return (event, controller) => (globalThis as any).runWorklet(entry.callback, [event, controller]);
}

function touchEvent(clientX: number, clientY: number, timestamp: number) {
  return { params: { clientX, clientY, timestamp } };
}

function makeController() {
  const calls: { fn: string; args: unknown[] }[] = [];
  return {
    calls,
    controller: {
      __SetGestureState(...args: unknown[]) {
        calls.push({ fn: "__SetGestureState", args });
      },
      __ConsumeGesture(...args: unknown[]) {
        calls.push({ fn: "__ConsumeGesture", args });
      },
    },
  };
}

const settle = () => new Promise((r) => setTimeout(r, 0));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("swipe-action.js", () => {
  it("registers a native gesture on mount and claims it on touch down", async () => {
    mount({});
    await settle();

    expect(lastCallOf("__SetGestureDetector")).toBeDefined();

    const down = gestureCallback("onTouchesDown");
    const { controller, calls } = makeController();
    down(touchEvent(300, 100, 0), controller);

    expect(calls).toEqual([{ fn: "__ConsumeGesture", args: [expect.anything(), expect.any(Number), { consume: true, inner: false }] }]);
  });

  it("measures its two children and sizes itself to their combined width", async () => {
    mount({});
    await settle();
    await settle();
    shimModule.redraw();

    const call = papiCalls()
      .filter((c) => c.fn === "__SetInlineStyles" && (c.args[1] as any)?.width !== undefined)
      .at(-1);
    expect((call?.args[1] as any).width).toBe("380px"); // 300 (display) + 80 (action)
  });

  it("a horizontal drag moves the transform by the delta, clamped to the action area", async () => {
    const root = mount({});
    const node = root.firstChild.firstChild; // inner row — carries the transform (see swipe-action.js's header)
    await settle();

    const down = gestureCallback("onTouchesDown");
    const move = gestureCallback("onTouchesMove");
    const { controller } = makeController();

    down(touchEvent(300, 100, 0), controller);
    move(touchEvent(260, 100, 16), controller); // dx = -40 (horizontal)
    expect(transformOf(node)).toBe("translateX(-40px)");

    move(touchEvent(0, 100, 32), controller); // way past -actionAreaSize (80)
    expect(transformOf(node)).toBe("translateX(-80px)");
  });

  it("a vertical-first move fails the gesture instead of swiping", async () => {
    const root = mount({});
    const node = root.firstChild.firstChild; // inner row — carries the transform (see swipe-action.js's header)
    await settle();

    const down = gestureCallback("onTouchesDown");
    const move = gestureCallback("onTouchesMove");
    const { controller, calls } = makeController();

    down(touchEvent(300, 100, 0), controller);
    move(touchEvent(300, 140, 16), controller); // dy = 40, dx = 0 -> vertical

    // The initial render always writes translateX(0px) (same "render it so a
    // redraw can't clobber it" discipline draggable.js established) — a
    // vertical-first move mustn't add a SECOND write on top of that baseline.
    expect(transformOf(node)).toBe("translateX(0px)");
    expect(calls.some((c) => c.fn === "__ConsumeGesture" && (c.args[2] as any).consume === false)).toBe(true);
    expect(calls.some((c) => c.fn === "__SetGestureState" && c.args[2] === 2)).toBe(true); // fail
  });

  it("a fast release past a small drag still snaps fully open, driven by velocity not distance", async () => {
    const root = mount({});
    const node = root.firstChild.firstChild; // inner row — carries the transform (see swipe-action.js's header)
    await settle();

    const down = gestureCallback("onTouchesDown");
    const move = gestureCallback("onTouchesMove");
    const up = gestureCallback("onTouchesUp");
    const { controller } = makeController();

    // Velocity needs a delta between two consecutive move samples (matches
    // the original: lastTouchMoveGestureEvent starts empty on touch down),
    // so the first move only sets the baseline — the second is the fast one.
    down(touchEvent(300, 100, 0), controller);
    move(touchEvent(299, 100, 0), controller);
    move(touchEvent(280, 100, 4), controller); // dx = -19 over 4ms = fast
    up(touchEvent(280, 100, 4), controller);

    await wait(500);
    expect(transformOf(node)).toBe("translateX(-80px)"); // fully open
  });

  it("a slow release before the halfway point snaps back closed", async () => {
    const root = mount({});
    const node = root.firstChild.firstChild; // inner row — carries the transform (see swipe-action.js's header)
    await settle();

    const down = gestureCallback("onTouchesDown");
    const move = gestureCallback("onTouchesMove");
    const up = gestureCallback("onTouchesUp");
    const { controller } = makeController();

    down(touchEvent(300, 100, 0), controller);
    move(touchEvent(280, 100, 200), controller); // dx = -20, slow (0.1px/ms)
    up(touchEvent(280, 100, 200), controller);

    await wait(500);
    expect(transformOf(node)).toBe("translateX(0px)");
  });

  it("tapping the action area fires onAction and closes", async () => {
    const fired: string[] = [];
    const root = mount({ onAction: () => fired.push("action") });
    const actionNode = root.firstChild.firstChild.firstChild.nextSibling;
    await settle();

    actionNode._listeners.tap?.wrapped({ type: "tap" });

    expect(fired).toEqual(["action"]);
  });

  it("the imperative handle opens and closes the action area", async () => {
    const ref: Record<string, unknown> = {};
    const root = mount({ actionRef: ref });
    const node = root.firstChild.firstChild; // inner row — carries the transform (see swipe-action.js's header)
    await settle();

    (ref.showActionArea as (animated?: boolean) => void)(false);
    expect(transformOf(node)).toBe("translateX(-80px)");

    (ref.closeActionArea as (animated?: boolean) => void)(false);
    expect(transformOf(node)).toBe("translateX(0px)");
  });
});
