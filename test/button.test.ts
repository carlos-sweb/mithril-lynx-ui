import { describe, expect, it } from "@rstest/core";
import m from "mithril";
import shim from "mithril-lynx";
import { Button } from "../src/button/button.js";

// Asserts the behaviour contract ported from @lynx-js/lynx-ui-button: the
// exact state classes (that's what makes lynx-ui CSS render identically
// here), disabled semantics, and the children-as-function scoped slot.

const shimModule = ((shim as any).default ?? shim) as {
  renderToPage(pageElement: unknown, vnode: unknown): unknown;
  redraw(): void;
};

type Wrapper = { _tag: string; firstChild: any; textContent: string; _listeners: Record<string, any> };

function mount(view: () => unknown): Wrapper {
  lynxTestingEnv.switchToMainThread();
  const page = __CreatePage("0", 0);
  return shimModule.renderToPage(page, m({ view })) as Wrapper;
}

const papiCalls = (): { fn: string; args: unknown[] }[] => (globalThis as any).__papiCalls;
const lastClassOf = (): string =>
  (papiCalls().filter((c) => c.fn === "__SetClasses").at(-1)?.args[1] as string) ?? "";

/** Fires a native event on a node the same way the engine would. */
function fire(node: any, type: string) {
  node._listeners[type].wrapped({ type });
}

describe("button.js", () => {
  it("renders a <view> and keeps the caller's className when idle", () => {
    const root = mount(() => m(Button, { className: "ui-button" }, m("text", "Tap")));
    const button = root.firstChild;

    expect(button._tag).toBe("view");
    expect(button.textContent).toBe("Tap");
    expect(lastClassOf()).toBe("ui-button");
  });

  it("adds ui-active while pressed and drops it on touchend", () => {
    const root = mount(() => m(Button, { className: "ui-button" }, m("text", "Tap")));
    const button = root.firstChild;

    fire(button, "touchstart");
    expect(lastClassOf()).toBe("ui-button ui-active");

    fire(button, "touchend");
    expect(lastClassOf()).toBe("ui-button");
  });

  it("disabled: adds ui-disabled, never activates, never fires onClick", () => {
    let clicks = 0;
    const root = mount(() =>
      m(Button, { className: "ui-button", disabled: true, onClick: () => clicks++ }, m("text", "Tap")),
    );
    const button = root.firstChild;

    expect(lastClassOf()).toBe("ui-button ui-disabled");

    fire(button, "touchstart");
    expect(lastClassOf()).toBe("ui-button ui-disabled");

    fire(button, "tap");
    expect(clicks).toBe(0);
  });

  it("fires onClick on tap when enabled", () => {
    let clicks = 0;
    const root = mount(() => m(Button, { onClick: () => clicks++ }, m("text", "Tap")));

    fire(root.firstChild, "tap");
    expect(clicks).toBe(1);
  });

  it("children-as-function receives {active, disabled} (the scoped slot)", () => {
    const seen: { active: boolean; disabled: boolean }[] = [];
    const root = mount(() =>
      m(Button, { disabled: false }, (api: { active: boolean; disabled: boolean }) => {
        seen.push(api);
        return m("text", api.active ? "pressed" : "idle");
      }),
    );

    expect(root.firstChild.textContent).toBe("idle");
    expect(seen.at(-1)).toEqual({ active: false, disabled: false });

    fire(root.firstChild, "touchstart");
    expect(root.firstChild.textContent).toBe("pressed");
    expect(seen.at(-1)).toEqual({ active: true, disabled: false });
  });
});
