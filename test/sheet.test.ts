import { describe, expect, it } from "@rstest/core";
import m from "mithril";
import shim from "mithril-lynx";
import {
  SheetBackdrop,
  SheetClose,
  SheetContent,
  SheetHandle,
  SheetRoot,
  SheetTrigger,
  SheetView,
} from "../sheet.js";

// Sheet's whole animation lifecycle rides on Presence, same as Dialog's —
// see dialog.test.ts/presence.test.ts for why these tests fire the native
// animation events / lean on the 24-frame watchdog rather than asserting on
// wall-clock timing.

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
const classOf = (node: any): string =>
  (papiCalls()
    .filter((c) => c.fn === "__SetClasses" && c.args[0] === node._handle)
    .at(-1)?.args[1] as string) ?? "";

function fire(node: any, type: string, detail: Record<string, unknown> = {}) {
  node._listeners[type]?.wrapped({ type, detail });
}

const lastCallOf = (fn: string) => papiCalls().filter((c) => c.fn === fn).at(-1);

// SheetContent's drag-to-close registers a REAL native gesture
// (mithril-lynx/gesture's createGesture(), type "native") rather than plain
// on*touch listeners — see sheet.js's own header for why (the first attempt,
// built on ./draggable.js, lost the gesture-arena contest to the page's own
// ancestor <scroll-view> on device). Driven the same way
// swipe-action.test.ts already established: extract the registered callback
// from the __SetGestureDetector call and invoke it through runWorklet.
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
  return {
    __SetGestureState() {},
    __ConsumeGesture() {},
  };
}

const frames = (n: number) => new Promise((r) => setTimeout(r, 16 * n + 40));
const settle = () => frames(2);
// Entering has an extra 8-frame layout delay before the 24-frame watchdog
// even starts (see presence.js's scheduleShow) — leaving doesn't, it goes
// straight to the watchdog. Comfortable margins for each, not tight ones.
const ENTER_SETTLE = 44;
const LEAVE_SETTLE = 44;

/**
 * Each scope-wrapped child (SheetBackdrop/SheetContent, each its own
 * Presence + scope.Provider) leaves a trailing invisible marker
 * (`<view style="display:none">`, see scope.js) as its OWN next sibling
 * before a real sibling is reached — including at SheetRoot's own top
 * level once SheetView stops rendering a real node (closed, unmounted).
 * "Nothing is here" therefore shows up as a marker, never as null.
 */
function isMarker(node: any): boolean {
  return node != null && node._style?.display === "none";
}

/** The real next sibling, skipping exactly one trailing marker if present. */
function next(node: any): any {
  const n = node.nextSibling;
  return isMarker(n) ? n.nextSibling : n;
}

function messageOfThrow(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return String(e instanceof Error ? e.message : e);
  }
  return "<did not throw>";
}

describe("sheet.js", () => {
  it("uncontrolled: SheetTrigger opens it, SheetClose closes it", async () => {
    const root = mount(() =>
      m(SheetRoot, {}, [
        m(SheetTrigger, { className: "trigger" }, m("text", {}, "Abrir")),
        m(SheetView, {}, [
          m(SheetBackdrop, { className: "backdrop" }),
          m(SheetContent, { className: "content" }, [
            m(SheetClose, { className: "close" }, m("text", {}, "Cerrar")),
          ]),
        ]),
      ]),
    );

    const trigger = root.firstChild;
    expect(classOf(trigger)).toContain("trigger");

    fire(trigger, "tap");
    shimModule.redraw();
    await frames(ENTER_SETTLE);

    const sheetView = trigger.nextSibling;
    expect(isMarker(sheetView)).toBe(false);
    const backdrop = sheetView.firstChild;
    expect(classOf(backdrop)).toContain("backdrop");
    expect(classOf(backdrop)).toContain("ui-open");

    const content = next(backdrop);
    expect(classOf(content)).toContain("ui-open");
    // Default side is bottom — always present regardless of `transition`.
    expect(classOf(content)).toContain("ui-sheet-side-bottom");

    // content.firstChild is SheetContent's own inner wrapping layer (the
    // node the drag gesture is registered on) — one level in from content.
    const closeButton = content.firstChild.firstChild;

    fire(closeButton, "tap");
    shimModule.redraw();
    await frames(LEAVE_SETTLE);

    expect(isMarker(trigger.nextSibling)).toBe(true);
  });

  it("side resolves start/end against enableRTL", async () => {
    const root = mount(() =>
      m(SheetRoot, { defaultShow: true, side: "start", enableRTL: true }, m(SheetView, {}, m(SheetContent, { className: "content" }))),
    );
    await settle();
    expect(classOf(root.firstChild.firstChild)).toContain("ui-sheet-side-right");
  });

  it("controlled: show prop drives visibility, internal state never overrides it", async () => {
    let show = false;
    const shown: boolean[] = [];
    const root = mount(() =>
      m(SheetRoot, { show, onShowChange: (v: boolean) => shown.push(v) }, [
        m(SheetTrigger, { className: "trigger" }, m("text", {}, "Abrir")),
        m(SheetView, {}, m(SheetBackdrop, { className: "backdrop" })),
      ]),
    );

    const trigger = root.firstChild;
    fire(trigger, "tap");
    shimModule.redraw();
    await settle();

    expect(shown).toEqual([true]);
    expect(isMarker(trigger.nextSibling)).toBe(true);

    show = true;
    shimModule.redraw();
    await frames(ENTER_SETTLE);

    expect(isMarker(trigger.nextSibling)).toBe(false);
  });

  it("SheetBackdrop click closes the sheet by default, and can be disabled", async () => {
    const root = mount(() =>
      m(SheetRoot, { defaultShow: true }, m(SheetView, {}, m(SheetBackdrop, { className: "backdrop" }))),
    );

    await frames(ENTER_SETTLE);
    const backdrop = root.firstChild.firstChild;
    fire(backdrop, "tap");
    shimModule.redraw();
    await frames(LEAVE_SETTLE);

    expect(isMarker(root.firstChild)).toBe(true);
  });

  it("clickToClose=false makes the backdrop inert", async () => {
    const root = mount(() =>
      m(SheetRoot, { defaultShow: true }, m(SheetView, {}, m(SheetBackdrop, { className: "backdrop", clickToClose: false }))),
    );

    await frames(ENTER_SETTLE);
    const backdrop = root.firstChild.firstChild;
    fire(backdrop, "tap");
    shimModule.redraw();
    await settle();

    expect(isMarker(root.firstChild)).toBe(false);
    expect(classOf(backdrop)).toContain("ui-open");
  });

  it("onOpen/onClose fire once, only after BOTH backdrop and content finish their own transition", async () => {
    const opened: number[] = [];
    const closed: number[] = [];
    let show = true;
    const root = mount(() =>
      m(
        SheetRoot,
        { show, onOpen: () => opened.push(1), onClose: () => closed.push(1) },
        m(SheetView, {}, [
          m(SheetBackdrop, { className: "backdrop" }),
          m(SheetContent, { className: "content" }),
        ]),
      ),
    );

    await frames(10);
    const backdrop = root.firstChild.firstChild;
    const content = next(backdrop);

    fire(backdrop, "animationstart");
    fire(backdrop, "animationend");
    await settle();
    expect(opened).toEqual([]);

    fire(content, "animationstart");
    fire(content, "animationend");
    await settle();
    expect(opened).toEqual([1]);

    show = false;
    shimModule.redraw();
    await settle();

    fire(backdrop, "animationstart");
    fire(backdrop, "animationend");
    await settle();
    expect(closed).toEqual([]);

    fire(content, "animationstart");
    fire(content, "animationend");
    await settle();
    expect(closed).toEqual([1]);
  });

  it("forceMount keeps SheetView mounted (closed) even while show is false", async () => {
    const root = mount(() =>
      m(SheetRoot, { forceMount: true }, m(SheetView, {}, m(SheetBackdrop, { className: "backdrop" }))),
    );

    await settle();
    expect(root.firstChild).not.toBe(null);
    expect(classOf(root.firstChild.firstChild)).toContain("ui-closed");
  });

  it("dragging the content past dismissThreshold closes it; short of it, it snaps back and stays open", async () => {
    let show = true;
    const shown: boolean[] = [];
    mount(() =>
      m(
        SheetRoot,
        { show, onShowChange: (v: boolean) => { shown.push(v); show = v; }, dismissThreshold: 50 },
        m(SheetView, {}, m(SheetContent, { className: "content" }, m("text", {}, "body"))),
      ),
    );
    await frames(ENTER_SETTLE);

    const down = gestureCallback("onTouchesDown");
    const move = gestureCallback("onTouchesMove");
    const up = gestureCallback("onTouchesUp");
    const controller = makeController();
    const transformOf = () =>
      (papiCalls()
        .filter((c) => c.fn === "__SetInlineStyles" && (c.args[1] as any)?.transform !== undefined)
        .at(-1)?.args[1] as any)?.transform;

    // Short drag (bottom sheet closes by dragging DOWN): under threshold —
    // moves live with the drag, then snaps back on release without closing.
    down(touchEvent(0, 0), controller);
    move(touchEvent(0, 20), controller);
    expect(transformOf()).toBe("translate(0px, 20px)");
    up(touchEvent(0, 20), controller);
    expect(shown).toEqual([]);
    expect(transformOf()).toBe("translate(0px, 0px)");

    // Long drag past the 50px threshold — closes.
    down(touchEvent(0, 0), controller);
    move(touchEvent(0, 90), controller);
    up(touchEvent(0, 90), controller);
    expect(shown).toEqual([false]);
  });

  it("dragging toward the OPENING direction doesn't move the sheet at all", async () => {
    mount(() => m(SheetRoot, { defaultShow: true }, m(SheetView, {}, m(SheetContent, { className: "content" }))));
    await frames(ENTER_SETTLE);

    const down = gestureCallback("onTouchesDown");
    const move = gestureCallback("onTouchesMove");
    const controller = makeController();

    down(touchEvent(0, 0), controller);
    move(touchEvent(0, -40), controller); // bottom sheet: dragging UP is the opening direction
    const transformCall = papiCalls()
      .filter((c) => c.fn === "__SetInlineStyles" && (c.args[1] as any)?.transform !== undefined)
      .at(-1);
    expect((transformCall?.args[1] as any).transform).toBe("translate(0px, 0px)");
  });

  it("enableDragToClose=false registers no gesture at all", async () => {
    // __papiCalls is a module-global log, not reset per test — filter to
    // calls made AFTER this test's own mount, or an earlier test's gesture
    // registration (dragging past dismissThreshold, above) would false-pass
    // this as "found one".
    const before = papiCalls().length;
    mount(() =>
      m(
        SheetRoot,
        { defaultShow: true, enableDragToClose: false },
        m(SheetView, {}, m(SheetContent, { className: "content" }, m("text", {}, "body"))),
      ),
    );
    await frames(ENTER_SETTLE);

    expect(papiCalls().slice(before).find((c) => c.fn === "__SetGestureDetector")).toBeUndefined();
  });

  it("SheetHandle renders its own class alongside the caller's", () => {
    const root = mount(() => m(SheetHandle, { className: "grip" }));
    expect(classOf(root.firstChild)).toContain("grip");
    expect(classOf(root.firstChild)).toContain("ui-sheet-handle");
  });

  it("a function child on SheetTrigger receives {busy, active, disabled}", () => {
    const seen: Record<string, unknown>[] = [];
    mount(() =>
      m(SheetRoot, {}, m(SheetTrigger, {}, (state: Record<string, unknown>) => {
        seen.push(state);
        return m("text", {}, "x");
      })),
    );

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ busy: false, active: false, disabled: false });
  });

  it("SheetTrigger outside SheetRoot fails loudly", () => {
    expect(messageOfThrow(() => mount(() => m(SheetTrigger, {}, m("text", {}, "x"))))).toMatch(
      /must be used inside a <SheetRoot>/,
    );
  });

  it("SheetView outside SheetRoot fails loudly", () => {
    expect(messageOfThrow(() => mount(() => m(SheetView, {}, m("text", {}, "x"))))).toMatch(
      /must be used inside a <SheetRoot>/,
    );
  });

  it("SheetBackdrop outside SheetView fails loudly", () => {
    expect(messageOfThrow(() => mount(() => m(SheetRoot, {}, m(SheetBackdrop, {}))))).toMatch(
      /must be used inside a <SheetView>/,
    );
  });
});
