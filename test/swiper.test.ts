import { describe, expect, it } from "@rstest/core";
import m from "mithril";
import shim from "mithril-lynx-v1";
import { Swiper } from "../src/swiper/swiper.js";

// swiper.js registers a real native gesture (mithril-lynx/gesture's
// createGesture(), type "native") rather than plain on* touch listeners —
// see the component's own header for why. Native dispatches a gesture
// callback through globalThis.runWorklet(ctx, [event, controller]) — same
// mechanism swipe-action.test.ts already established this project's own
// convention for; reused verbatim here.

const shimModule = ((shim as any).default ?? shim) as {
  renderToPage(pageElement: unknown, vnode: unknown): unknown;
  redraw(): void;
};

function mount(attrs: Record<string, unknown>): any {
  lynxTestingEnv.switchToMainThread();
  const page = __CreatePage("0", 0);
  // Anonymous root per mount() — same reasoning as swipe-action.test.ts's
  // own mount(): reusing the same component reference as the root across
  // many it() blocks confuses the shim's redraw bookkeeping.
  return shimModule.renderToPage(page, m({ view: () => m(Swiper, attrs) })) as any;
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

function touchEvent(clientX: number, clientY: number) {
  return { params: { clientX, clientY } };
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

const ITEMS = ["a", "b", "c"];
const baseAttrs = () => ({
  items: ITEMS,
  renderItem: (item: string) => m("text", {}, item),
  itemWidth: 100,
  itemHeight: 50,
});

describe("swiper.js", () => {
  it("registers a native gesture on mount and claims it on touch down", async () => {
    const root = mount(baseAttrs());
    await settle();

    expect(lastCallOf("__SetGestureDetector")).toBeDefined();

    const down = gestureCallback("onTouchesDown");
    const { controller, calls } = makeController();
    down(touchEvent(50, 50), controller);

    expect(calls).toEqual([{ fn: "__ConsumeGesture", args: [expect.anything(), expect.any(Number), { consume: true, inner: false }] }]);
    void root;
  });

  it("renders one item per entry, sized to itemWidth/itemHeight, starting at translateX(0)", async () => {
    const root = mount(baseAttrs());
    const track = root.firstChild.firstChild;
    await settle();

    let count = 0;
    for (let node = track.firstChild; node != null; node = node.nextSibling) count++;
    expect(count).toBe(3);
    expect(transformOf(track)).toBe("translateX(0px)");
  });

  it("a horizontal drag moves the track by the delta, clamped at both ends", async () => {
    const root = mount(baseAttrs());
    const track = root.firstChild.firstChild;
    await settle();

    const down = gestureCallback("onTouchesDown");
    const move = gestureCallback("onTouchesMove");
    const { controller } = makeController();

    down(touchEvent(200, 100), controller);
    move(touchEvent(200, 100), controller); // seeds start, no delta yet
    move(touchEvent(150, 100), controller); // dx = -50
    expect(transformOf(track)).toBe("translateX(-50px)");

    move(touchEvent(-900, 100), controller); // way past the last item
    expect(transformOf(track)).toBe("translateX(-200px)"); // clamped: -(3-1)*100
  });

  it("a vertical-first move releases the gesture instead of swiping", async () => {
    const root = mount(baseAttrs());
    const track = root.firstChild.firstChild;
    await settle();

    const down = gestureCallback("onTouchesDown");
    const move = gestureCallback("onTouchesMove");
    const { controller, calls } = makeController();

    down(touchEvent(200, 100), controller);
    move(touchEvent(200, 100), controller); // seeds start
    move(touchEvent(200, 160), controller); // dy = 60, dx = 0 -> vertical

    expect(transformOf(track)).toBe("translateX(0px)");
    expect(calls.some((c) => c.fn === "__ConsumeGesture" && (c.args[2] as any).consume === false)).toBe(true);
    expect(calls.some((c) => c.fn === "__SetGestureState" && c.args[2] === 2)).toBe(true); // fail
  });

  it("releasing past the swipeThreshold advances one item and fires onChange", async () => {
    const changed: number[] = [];
    const root = mount(Object.assign(baseAttrs(), { onChange: (i: number) => changed.push(i) }));
    const track = root.firstChild.firstChild;
    await settle();

    const down = gestureCallback("onTouchesDown");
    const move = gestureCallback("onTouchesMove");
    const up = gestureCallback("onTouchesUp");
    const { controller } = makeController();

    down(touchEvent(200, 100), controller);
    move(touchEvent(200, 100), controller);
    move(touchEvent(160, 100), controller); // dx = -40, past 0.2*100=20 threshold
    up(touchEvent(160, 100), controller);

    expect(changed).toEqual([1]);
    expect(transformOf(track)).toBe("translateX(-100px)");
  });

  it("releasing short of the threshold snaps back to the current index", async () => {
    const changed: number[] = [];
    const root = mount(Object.assign(baseAttrs(), { onChange: (i: number) => changed.push(i) }));
    const track = root.firstChild.firstChild;
    await settle();

    const down = gestureCallback("onTouchesDown");
    const move = gestureCallback("onTouchesMove");
    const up = gestureCallback("onTouchesUp");
    const { controller } = makeController();

    down(touchEvent(200, 100), controller);
    move(touchEvent(200, 100), controller);
    move(touchEvent(190, 100), controller); // dx = -10, short of the 20px threshold
    up(touchEvent(190, 100), controller);

    expect(changed).toEqual([]);
    expect(transformOf(track)).toBe("translateX(0px)");
  });

  it("dragging past the first item toward opening (positive) does not go below index 0", async () => {
    const root = mount(baseAttrs());
    const track = root.firstChild.firstChild;
    await settle();

    const down = gestureCallback("onTouchesDown");
    const move = gestureCallback("onTouchesMove");
    const up = gestureCallback("onTouchesUp");
    const { controller } = makeController();

    down(touchEvent(200, 100), controller);
    move(touchEvent(200, 100), controller);
    move(touchEvent(400, 100), controller); // dx = +200, clamped at 0 (no previous item)
    expect(transformOf(track)).toBe("translateX(0px)");
    up(touchEvent(400, 100), controller);
    expect(transformOf(track)).toBe("translateX(0px)");
  });

  it("initialIndex starts the track already offset", async () => {
    const root = mount(Object.assign(baseAttrs(), { initialIndex: 2 }));
    const track = root.firstChild.firstChild;
    await settle();

    expect(transformOf(track)).toBe("translateX(-200px)");
  });

  it("the imperative ref exposes swipeNext/swipePrev/swipeTo", async () => {
    const changed: number[] = [];
    const ref: Record<string, unknown> = {};
    const root = mount(Object.assign(baseAttrs(), { swiperRef: ref, onChange: (i: number) => changed.push(i) }));
    const track = root.firstChild.firstChild;
    await settle();

    (ref.swipeNext as () => void)();
    expect(transformOf(track)).toBe("translateX(-100px)");

    (ref.swipeTo as (i: number) => void)(2);
    expect(transformOf(track)).toBe("translateX(-200px)");

    (ref.swipePrev as () => void)();
    expect(transformOf(track)).toBe("translateX(-100px)");

    expect(changed).toEqual([1, 2, 1]);
  });

  it("swipeNext/swipeTo clamp to the item range and do not fire onChange when the index is unchanged", async () => {
    const changed: number[] = [];
    const ref: Record<string, unknown> = {};
    mount(Object.assign(baseAttrs(), { swiperRef: ref, initialIndex: 2, onChange: (i: number) => changed.push(i) }));
    await settle();

    (ref.swipeNext as () => void)(); // already at the last item
    expect(changed).toEqual([]);
  });

  it("autoPlay advances on an interval and pauses while dragging", async () => {
    const changed: number[] = [];
    mount(Object.assign(baseAttrs(), { autoPlay: true, autoPlayInterval: 15, onChange: (i: number) => changed.push(i) }));
    await settle();

    await wait(25); // one tick has definitely fired by now, and not e.g. a runaway loop
    expect(changed.length).toBeGreaterThanOrEqual(1);
    expect(changed[0]).toBe(1);

    const down = gestureCallback("onTouchesDown");
    const { controller } = makeController();
    down(touchEvent(200, 100), controller); // stops autoplay's timer
    const countAtDragStart = changed.length;

    await wait(60);
    expect(changed.length).toBe(countAtDragStart); // no further advance while the timer is stopped
  });
});
