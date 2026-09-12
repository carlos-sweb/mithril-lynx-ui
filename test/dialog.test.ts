import { describe, expect, it } from "@rstest/core";
import m from "mithril";
import shim from "mithril-lynx";
import {
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogRoot,
  DialogTrigger,
  DialogView,
} from "../dialog.js";

// Dialog's whole animation lifecycle rides on Presence (see presence.test.ts
// for why: frame-driven, no Lynx frame pipeline in jsdom, so these tests
// either fire the native animation events or lean on the 24-frame watchdog
// rather than asserting on wall-clock timing.

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
  node._listeners[type]?.wrapped({ type });
}

const frames = (n: number) => new Promise((r) => setTimeout(r, 16 * n + 40));
const settle = () => frames(2);
const MAX_WAIT = 24;
// Entering has an extra 8-frame layout delay before the 24-frame watchdog
// even starts (see presence.js's scheduleShow) — leaving doesn't, it goes
// straight to the watchdog. Comfortable margins for each, not tight ones.
const ENTER_SETTLE = 44;
const LEAVE_SETTLE = 44;

/**
 * Each scope-wrapped child (DialogBackdrop/DialogContent, each its own
 * Presence + scope.Provider) leaves a trailing invisible marker
 * (`<view style="display:none">`, see scope.js) as its OWN next sibling
 * before a real sibling is reached — including at DialogRoot's own top
 * level once DialogView stops rendering a real node (closed, unmounted).
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

describe("dialog.js", () => {
  it("uncontrolled: DialogTrigger opens it, DialogClose closes it", async () => {
    const root = mount(() =>
      m(DialogRoot, {}, [
        m(DialogTrigger, { className: "trigger" }, m("text", {}, "Abrir")),
        m(DialogView, {}, [
          m(DialogBackdrop, { className: "backdrop" }),
          m(DialogContent, { className: "content" }, [
            m(DialogClose, { className: "close" }, m("text", {}, "Cerrar")),
          ]),
        ]),
      ]),
    );

    const trigger = root.firstChild;
    expect(classOf(trigger)).toContain("trigger");

    fire(trigger, "tap");
    shimModule.redraw();
    await frames(ENTER_SETTLE);

    // DialogView is now mounted: its outer view is trigger's next sibling
    // (DialogRoot/Provider/PopMarker render no element of their own).
    const dialogView = trigger.nextSibling;
    expect(isMarker(dialogView)).toBe(false);
    const backdrop = dialogView.firstChild;
    expect(classOf(backdrop)).toContain("backdrop");
    expect(classOf(backdrop)).toContain("ui-open");

    const content = next(backdrop);
    expect(classOf(content)).toContain("ui-open");
    const closeButton = content.firstChild;

    fire(closeButton, "tap");
    shimModule.redraw();
    await frames(LEAVE_SETTLE);

    expect(isMarker(trigger.nextSibling)).toBe(true);
  });

  it("controlled: show prop drives visibility, internal state never overrides it", async () => {
    let show = false;
    const shown: boolean[] = [];
    const root = mount(() =>
      m(DialogRoot, { show, onShowChange: (v: boolean) => shown.push(v) }, [
        m(DialogTrigger, { className: "trigger" }, m("text", {}, "Abrir")),
        m(DialogView, {}, m(DialogBackdrop, { className: "backdrop" })),
      ]),
    );

    const trigger = root.firstChild;
    fire(trigger, "tap");
    shimModule.redraw();
    await settle();

    // A controlled DialogRoot never mounts DialogView on its own — only
    // onShowChange fired, reporting what the app should now set `show` to.
    expect(shown).toEqual([true]);
    expect(isMarker(trigger.nextSibling)).toBe(true);

    show = true;
    shimModule.redraw();
    await frames(ENTER_SETTLE);

    expect(isMarker(trigger.nextSibling)).toBe(false);
  });

  it("DialogBackdrop click closes the dialog by default, and can be disabled", async () => {
    const root = mount(() =>
      m(DialogRoot, { defaultShow: true }, m(DialogView, {}, m(DialogBackdrop, { className: "backdrop" }))),
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
      m(
        DialogRoot,
        { defaultShow: true },
        m(DialogView, {}, m(DialogBackdrop, { className: "backdrop", clickToClose: false })),
      ),
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
        DialogRoot,
        { show, onOpen: () => opened.push(1), onClose: () => closed.push(1) },
        m(DialogView, {}, [
          m(DialogBackdrop, { className: "backdrop" }),
          m(DialogContent, { className: "content" }),
        ]),
      ),
    );

    await frames(10);
    const backdrop = root.firstChild.firstChild;
    const content = next(backdrop);

    fire(backdrop, "animationstart");
    fire(backdrop, "animationend");
    await settle();
    expect(opened).toEqual([]); // content hasn't finished entering yet

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
    expect(closed).toEqual([]); // content hasn't finished leaving yet

    fire(content, "animationstart");
    fire(content, "animationend");
    await settle();
    expect(closed).toEqual([1]);
  });

  it("forceMount keeps DialogView mounted (closed) even while show is false", async () => {
    const root = mount(() =>
      m(DialogRoot, { forceMount: true }, m(DialogView, {}, m(DialogBackdrop, { className: "backdrop" }))),
    );

    await settle();
    expect(root.firstChild).not.toBe(null);
    expect(classOf(root.firstChild.firstChild)).toContain("ui-closed");
  });

  it("DialogTrigger is disabled/busy while a transition is in flight", async () => {
    const root = mount(() =>
      m(DialogRoot, {}, [
        m(DialogTrigger, { className: "trigger" }, m("text", {}, "Abrir")),
        m(DialogView, {}, m(DialogBackdrop, { className: "backdrop" })),
      ]),
    );

    const trigger = root.firstChild;
    fire(trigger, "tap");
    shimModule.redraw();
    await frames(10);

    expect(classOf(trigger)).toContain("ui-busy");
  });

  it("a function child on DialogTrigger receives {busy, active, disabled}", () => {
    const seen: Record<string, unknown>[] = [];
    mount(() =>
      m(DialogRoot, {}, m(DialogTrigger, {}, (state: Record<string, unknown>) => {
        seen.push(state);
        return m("text", {}, "x");
      })),
    );

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ busy: false, active: false, disabled: false });
  });

  it("DialogTrigger outside DialogRoot fails loudly", () => {
    expect(messageOfThrow(() => mount(() => m(DialogTrigger, {}, m("text", {}, "x"))))).toMatch(
      /must be used inside a <DialogRoot>/,
    );
  });

  it("DialogView outside DialogRoot fails loudly", () => {
    expect(messageOfThrow(() => mount(() => m(DialogView, {}, m("text", {}, "x"))))).toMatch(
      /must be used inside a <DialogRoot>/,
    );
  });

  it("DialogBackdrop outside DialogView fails loudly", () => {
    expect(messageOfThrow(() => mount(() => m(DialogRoot, {}, m(DialogBackdrop, {}))))).toMatch(
      /must be used inside a <DialogView>/,
    );
  });
});
