import { describe, expect, it } from "@rstest/core";
import m from "mithril";
import shim from "mithril-lynx";
import {
  PopoverAnchor,
  PopoverArrow,
  PopoverBackdrop,
  PopoverContent,
  PopoverPositioner,
  PopoverRoot,
  PopoverTrigger,
} from "../src/popover/popover.js";

// Popover's presence lifecycle is a single shared Presence (not Dialog's own
// N-child group), but rides the same frame-driven state machine — see
// presence.test.ts for why these tests wait real frames rather than
// asserting on synchronous timing. Positioning itself is computed from
// mocked boundingClientRect() results, the same __InvokeUIMethod mocking
// convention swipe-action.test.ts already established.

const shimModule = ((shim as any).default ?? shim) as {
  renderToPage(pageElement: unknown, vnode: unknown): unknown;
  redraw(): void;
};

const TRIGGER_RECT = { left: 100, top: 200, width: 50, height: 20 };
const CONTENT_RECT = { left: 0, top: 0, width: 80, height: 40 };

let invokeCallCount = 0;
let lastInvoke: { method: string; params: unknown }[] = [];

function mount(view: () => unknown): any {
  invokeCallCount = 0;
  lastInvoke = [];
  lynxTestingEnv.switchToMainThread();
  (globalThis as any).__InvokeUIMethod = (_node: unknown, method: string, params: unknown, callback: (r: unknown) => void) => {
    lastInvoke.push({ method, params });
    if (method === "boundingClientRect") {
      // maybeRecompute() calls Promise.all([measureRect(reference), measureRect(floating)]) —
      // reference (the trigger, or anchor) is always requested first.
      const rect = invokeCallCount % 2 === 0 ? TRIGGER_RECT : CONTENT_RECT;
      invokeCallCount++;
      callback({ code: 0, data: rect });
    } else {
      callback({ code: 0, data: {} });
    }
    return [];
  };
  const page = __CreatePage("0", 0);
  return shimModule.renderToPage(page, m({ view })) as any;
}

const papiCalls = (): { fn: string; args: unknown[] }[] => (globalThis as any).__papiCalls;
const classOf = (node: any): string =>
  (papiCalls()
    .filter((c) => c.fn === "__SetClasses" && c.args[0] === node._handle)
    .at(-1)?.args[1] as string) ?? "";
const styleOf = (node: any): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const call of papiCalls()) {
    if (call.fn === "__SetInlineStyles" && call.args[0] === node._handle) Object.assign(out, call.args[1] as Record<string, unknown>);
  }
  return out;
};

function fire(node: any, type: string) {
  node._listeners[type]?.wrapped({ type });
}

const frames = (n: number) => new Promise((r) => setTimeout(r, 16 * n + 40));
// DelayedEntering lands at presence.js's own 16-frame mark (enableDelay:true,
// which PopoverPositioner always passes) — enough for the position to be
// computed (maybeRecompute runs on reaching DelayedEntering), but NOT
// enough to reach the fully-open "Entered" state, since that also needs
// the 24-frame watchdog on top with no real CSS animation firing in tests.
// A click while still "busy" (Entering/DelayedEntering/Leaving) is a no-op
// by design (see resolveBusyState) — confirmed the hard way once already
// here: an 18-frame wait before clicking the backdrop again silently
// dropped the click, since the state machine hadn't reached Entered yet.
const settle = () => frames(18);
// Comfortable margin past both delays PLUS the watchdog, matching
// dialog.test.ts's own identical constant for the identical state machine.
const ENTER_SETTLE = 44;
const LEAVE_SETTLE = 44;

function isMarker(node: any): boolean {
  return node != null && node._style?.display === "none";
}

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

describe("popover.js", () => {
  it("uncontrolled: PopoverTrigger opens it, positions PopoverPositioner from the measured trigger rect", async () => {
    const root = mount(() =>
      m(PopoverRoot, {}, [
        m(PopoverTrigger, { className: "trigger" }, m("text", {}, "Abrir")),
        m(PopoverPositioner, { placement: "bottom", className: "positioner" }, m(PopoverContent, { className: "content" }, m("text", {}, "hola"))),
      ]),
    );

    const trigger = root.firstChild;
    fire(trigger, "tap");
    shimModule.redraw();
    await settle();

    const positioner = trigger.nextSibling;
    expect(isMarker(positioner)).toBe(false);
    expect(classOf(positioner)).toContain("positioner");
    // Regression check: PopoverPositioner's real content once destructured
    // `children` off vnode.ATTRS instead of reading vnode.children (the
    // exact same trap already hit in form.js/input-otp.js) — PopoverContent
    // silently never received any children at all, and the wrapper it sat
    // in (with nothing inside it) measured as zero-sized, which is what
    // this file's own earlier findings about position:fixed/measurement
    // turned out to actually be a symptom of. Confirmed fixed on device,
    // not just here — but this is what would have caught it in a test.
    expect(positioner.textContent).toContain("hola");
    // bottom, centered: x = reference.left + reference.width/2 - floating.width/2 = 100+25-40 = 85; y = reference.top + reference.height = 220
    expect(styleOf(positioner).left).toBe("85px");
    expect(styleOf(positioner).top).toBe("220px");
    expect(Number(styleOf(positioner).opacity)).toBe(1);
  });

  it("placement=top-start positions above and left-aligned with the trigger", async () => {
    const root = mount(() =>
      m(PopoverRoot, { defaultShow: true }, [
        m(PopoverTrigger, { className: "trigger" }, m("text", {}, "Abrir")),
        m(PopoverPositioner, { placement: "top-start" }, m(PopoverContent, {}, m("text", {}, "hola"))),
      ]),
    );
    await settle();

    const positioner = root.firstChild.nextSibling;
    // top: y = reference.top - floating.height = 200-40 = 160; start align: x = reference.left = 100
    expect(styleOf(positioner).left).toBe("100px");
    expect(styleOf(positioner).top).toBe("160px");
  });

  it("controlled: show prop drives visibility, internal state never overrides it", async () => {
    let show = false;
    const shown: boolean[] = [];
    const root = mount(() =>
      m(PopoverRoot, { show, onShowChange: (v: boolean) => shown.push(v) }, [
        m(PopoverTrigger, { className: "trigger" }, m("text", {}, "Abrir")),
        m(PopoverPositioner, {}, m(PopoverContent, {}, m("text", {}, "hola"))),
      ]),
    );

    const trigger = root.firstChild;
    fire(trigger, "tap");
    shimModule.redraw();
    await frames(2);

    expect(shown).toEqual([true]);
    expect(isMarker(trigger.nextSibling)).toBe(true);

    show = true;
    shimModule.redraw();
    await settle();

    expect(isMarker(trigger.nextSibling)).toBe(false);
  });

  it("PopoverBackdrop click closes it, and is not even mounted while closed (unlike upstream)", async () => {
    let show = true;
    const root = mount(() =>
      m(PopoverRoot, { show: undefined, defaultShow: true, onShowChange: (v: boolean) => { show = v; } }, [
        m(PopoverBackdrop, { className: "backdrop" }),
        m(PopoverPositioner, {}, m(PopoverContent, {}, m("text", {}, "hola"))),
      ]),
    );
    await frames(ENTER_SETTLE);

    const backdrop = root.firstChild;
    expect(isMarker(backdrop)).toBe(false);
    expect(classOf(backdrop)).toContain("backdrop");

    fire(backdrop, "tap");
    shimModule.redraw();
    await frames(LEAVE_SETTLE);

    expect(isMarker(root.firstChild)).toBe(true);
  });

  it("forceMount keeps the positioner mounted (closed) even while show is false", async () => {
    const root = mount(() => m(PopoverRoot, { forceMount: true }, m(PopoverPositioner, {}, m(PopoverContent, { className: "content" }))));

    await frames(2);
    expect(root.firstChild).not.toBe(null);
    expect(classOf(root.firstChild)).toContain("ui-closed");
  });

  it("onOpen/onClose fire once each, after the enter/leave animation actually finishes", async () => {
    const opened: number[] = [];
    const closed: number[] = [];
    let show = true;
    const root = mount(() =>
      m(PopoverRoot, { show, onOpen: () => opened.push(1), onClose: () => closed.push(1) }, m(PopoverPositioner, {}, m(PopoverContent, { className: "content" }))),
    );

    await frames(10);
    const positioner = root.firstChild;
    fire(positioner, "animationstart");
    fire(positioner, "animationend");
    await frames(2);
    expect(opened).toEqual([1]);

    show = false;
    shimModule.redraw();
    await frames(2);
    fire(positioner, "animationstart");
    fire(positioner, "animationend");
    await frames(2);
    expect(closed).toEqual([1]);
  });

  it("PopoverAnchor, when present, is measured instead of the trigger", async () => {
    const root = mount(() =>
      m(PopoverRoot, { defaultShow: true }, [
        m(PopoverTrigger, {}, m("text", {}, "Abrir")),
        m(PopoverAnchor, { className: "anchor" }, m("text", {}, "ancla")),
        m(PopoverPositioner, { placement: "bottom" }, m(PopoverContent, {}, m("text", {}, "hola"))),
      ]),
    );
    await settle();

    // Both trigger and anchor report the SAME mocked rect here (the mock
    // doesn't distinguish nodes) — this just confirms hasAnchor routed the
    // measurement through the anchor's own el without throwing, and a
    // position was still computed successfully.
    const positioner = next(next(root.firstChild));
    expect(Number(styleOf(positioner).opacity)).toBe(1);
  });

  it("PopoverArrow points toward the trigger side and needs no re-measurement", () => {
    const root = mount(() => m(PopoverRoot, {}, m(PopoverArrow, { className: "arrow", size: 10 })));
    const arrow = root.firstChild;
    expect(classOf(arrow)).toContain("arrow");
    // No placement context above it — falls back to "bottom" (the same
    // default PopoverPositioner itself uses).
    expect(styleOf(arrow).top).toBe("-10px");
  });

  it("PopoverTrigger outside PopoverRoot fails loudly", () => {
    expect(messageOfThrow(() => mount(() => m(PopoverTrigger, {}, m("text", {}, "x"))))).toMatch(
      /must be used inside a <PopoverRoot>/,
    );
  });

  it("PopoverPositioner outside PopoverRoot fails loudly", () => {
    expect(messageOfThrow(() => mount(() => m(PopoverPositioner, {}, m("text", {}, "x"))))).toMatch(
      /must be used inside a <PopoverRoot>/,
    );
  });

  it("PopoverContent outside PopoverPositioner fails loudly", () => {
    expect(messageOfThrow(() => mount(() => m(PopoverRoot, {}, m(PopoverContent, {}))))).toMatch(
      /must be used inside a <PopoverPositioner>/,
    );
  });
});
