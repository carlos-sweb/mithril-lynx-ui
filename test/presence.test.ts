import { describe, expect, it } from "@rstest/core";
import m from "mithril";
import shim from "mithril-lynx";
import { Presence, PresenceContent, PresenceState, resolveAnimationStatus } from "../src/presence/presence.js";

// The state machine is frame-driven, and jsdom has no Lynx frame pipeline —
// internal/frames.js falls back to setTimeout there. So these tests drive the
// machine the way the device does (fire the native animation events, advance
// timers) rather than asserting on wall-clock timing.

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

function fire(node: any, type: string) {
  node._listeners[type].wrapped({ type });
}

/** Lets every pending delayFrames callback run (16ms per frame in the fallback). */
const frames = (n: number) => new Promise((r) => setTimeout(r, 16 * n + 40));

/**
 * Presence writes state immediately but defers its redraw by a frame — it has
 * to, since its effects run inside Mithril's render pass (see presence.js's
 * scheduleRedraw). So every assertion about the rendered tree waits a beat
 * rather than reading it synchronously after a state change.
 */
const settle = () => frames(2);

describe("resolveAnimationStatus", () => {
  it("maps each state onto the open/closed/animating flags", () => {
    expect(resolveAnimationStatus(PresenceState.Entering, false)).toMatchObject({
      entering: true,
      animating: true,
      open: true,
      closed: false,
    });
    expect(resolveAnimationStatus(PresenceState.Entered, false)).toMatchObject({
      entering: false,
      animating: false,
      open: true,
      closed: false,
    });
    expect(resolveAnimationStatus(PresenceState.Leaving, false)).toMatchObject({
      leaving: true,
      animating: true,
      open: false,
      closed: true,
    });
    expect(resolveAnimationStatus(PresenceState.Left, false)).toMatchObject({
      animating: false,
      open: false,
      closed: true,
    });
  });

  it("enableDelay treats plain Entering as still-closed (content laid out, not yet shown)", () => {
    expect(resolveAnimationStatus(PresenceState.Entering, true).closed).toBe(true);
    expect(resolveAnimationStatus(PresenceState.DelayedEntering, true).open).toBe(true);
  });

  it("grouped keeps a leaving member open so its own children don't vanish early", () => {
    expect(resolveAnimationStatus(PresenceState.Leaving, false, true).open).toBe(true);
    expect(resolveAnimationStatus(PresenceState.Leaving, false, true).closed).toBe(false);
    expect(resolveAnimationStatus(PresenceState.Left, false, true).closed).toBe(true);
  });
});

describe("presence.js", () => {
  it("starts unmounted when show is false", () => {
    const root = mount(() => m(Presence, { show: false }, m(PresenceContent, { className: "panel" })));
    expect(root.firstChild).toBe(null);
  });

  it("mounts on show, then reaches Entered once the enter animation ends", async () => {
    let show = false;
    const opened: number[] = [];
    const root = mount(() =>
      m(
        Presence,
        { show, onOpen: () => opened.push(1) },
        m(PresenceContent, { className: "panel" }),
      ),
    );

    show = true;
    shimModule.redraw();
    await settle();

    // Mounted first; the enter state is scheduled 8 frames out so the element
    // can lay out before its animation starts.
    expect(root.firstChild).not.toBe(null);
    await frames(10);
    expect(classOf(root.firstChild)).toContain("ui-entering");

    // The element reports its animation, then reports it finished.
    fire(root.firstChild, "animationstart");
    fire(root.firstChild, "animationend");
    await settle();

    expect(classOf(root.firstChild)).toContain("ui-open");
    expect(classOf(root.firstChild)).not.toContain("ui-animating");
    expect(opened).toEqual([1]);
  });

  it("stays mounted while leaving, and unmounts only once the leave animation ends", async () => {
    let show = true;
    const closed: number[] = [];
    const root = mount(() =>
      m(Presence, { show, onClose: () => closed.push(1) }, m(PresenceContent, { className: "panel" })),
    );

    await frames(10);
    fire(root.firstChild, "animationstart");
    fire(root.firstChild, "animationend");
    await settle();

    show = false;
    shimModule.redraw();
    await settle();

    // Still mounted — this is the whole point of Presence.
    expect(root.firstChild).not.toBe(null);
    expect(classOf(root.firstChild)).toContain("ui-leaving");

    fire(root.firstChild, "animationstart");
    fire(root.firstChild, "animationend");
    await settle();

    expect(root.firstChild).toBe(null);
    expect(closed).toEqual([1]);
  });

  it("unmounts anyway when no animation ever runs (the watchdog)", async () => {
    let show = true;
    const root = mount(() => m(Presence, { show }, m(PresenceContent, { className: "panel" })));

    await frames(10);
    // No animation events at all — the entering watchdog has to advance it.
    await frames(MAX_WAIT + 4);
    expect(classOf(root.firstChild)).toContain("ui-open");

    show = false;
    shimModule.redraw();
    await frames(MAX_WAIT + 4);
    await settle();

    expect(root.firstChild).toBe(null);
  });

  it("forceMount keeps content mounted while closed", () => {
    const root = mount(() =>
      m(Presence, { show: false, forceMount: true }, m(PresenceContent, { className: "panel" })),
    );

    expect(root.firstChild).not.toBe(null);
    expect(classOf(root.firstChild)).toContain("ui-closed");
  });

  it("PresenceContent outside a Presence fails loudly", () => {
    expect(() => mount(() => m(PresenceContent, { className: "panel" }))).toThrow(
      /must be used inside a <Presence>/,
    );
  });
});

const MAX_WAIT = 24;
