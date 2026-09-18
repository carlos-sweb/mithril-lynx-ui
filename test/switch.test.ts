import { describe, expect, it } from "@rstest/core";
import m from "mithril";
import shim from "mithril-lynx";
import { Switch, SwitchThumb, SwitchTrack } from "../src/switch/switch.js";

// Asserts the behaviour contract ported from @lynx-js/lynx-ui-switch:
// controlled vs uncontrolled, the ui-active/ui-checked/ui-disabled classes
// on the root AND on the compound parts, and that Track/Thumb pick the
// state up ambiently (via ./scope.js) rather than through props.

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

/**
 * The class string currently set on one specific node — the last
 * __SetClasses call aimed at that node's handle. Filtering by handle rather
 * than by substring matters: going from "ui-switch ui-checked" back to
 * "ui-switch" is exactly the transition under test, and a substring filter
 * would silently keep matching the older, stale entry.
 */
const classOf = (node: any): string =>
  (papiCalls()
    .filter((c) => c.fn === "__SetClasses" && c.args[0] === node._handle)
    .at(-1)?.args[1] as string) ?? "";

function fire(node: any, type: string) {
  node._listeners[type].wrapped({ type });
}

describe("switch.js", () => {
  it("uncontrolled: defaultChecked seeds it, tapping toggles and reports the new value", () => {
    const changes: boolean[] = [];
    const root = mount(() =>
      m(Switch, { className: "ui-switch", defaultChecked: true, onChange: (v: boolean) => changes.push(v) }, [
        m(SwitchTrack, { className: "ui-switch-track" }, m(SwitchThumb, { className: "ui-switch-thumb" })),
      ]),
    );

    const sw = root.firstChild;
    expect(classOf(sw)).toContain("ui-checked");

    fire(sw, "tap");
    shimModule.redraw();

    expect(changes).toEqual([false]);
    expect(classOf(sw)).not.toContain("ui-checked");
  });

  it("controlled: `checked` wins, internal state never takes over", () => {
    const changes: boolean[] = [];
    let checked = false;
    const root = mount(() =>
      m(Switch, { className: "ui-switch", checked, defaultChecked: true, onChange: (v: boolean) => changes.push(v) }, [
        m(SwitchTrack, { className: "ui-switch-track" }),
      ]),
    );

    const sw = root.firstChild;
    // defaultChecked is ignored entirely while `checked` is supplied.
    expect(classOf(sw)).not.toContain("ui-checked");

    fire(sw, "tap");
    shimModule.redraw();

    // onChange fired, but nothing moved until the owner passed a new `checked`.
    expect(changes).toEqual([true]);
    expect(classOf(sw)).not.toContain("ui-checked");

    checked = true;
    shimModule.redraw();
    expect(classOf(sw)).toContain("ui-checked");
  });

  it("Track/Thumb read the state ambiently, with no props threaded through", () => {
    const root = mount(() =>
      m(Switch, { className: "ui-switch", defaultChecked: true }, [
        m(SwitchTrack, { className: "ui-switch-track" }, m(SwitchThumb, { className: "ui-switch-thumb" })),
      ]),
    );

    const track = root.firstChild.firstChild;
    const thumb = track.firstChild;
    expect(classOf(track)).toContain("ui-checked");
    expect(classOf(thumb)).toContain("ui-checked");

    fire(root.firstChild, "touchstart");
    expect(classOf(thumb)).toContain("ui-active");
  });

  it("disabled: no toggle, no onChange, ui-disabled everywhere", () => {
    const changes: boolean[] = [];
    const root = mount(() =>
      m(Switch, { className: "ui-switch", disabled: true, onChange: (v: boolean) => changes.push(v) }, [
        m(SwitchTrack, { className: "ui-switch-track" }),
      ]),
    );

    expect(classOf(root.firstChild)).toContain("ui-disabled");
    expect(classOf(root.firstChild.firstChild)).toContain("ui-disabled");

    fire(root.firstChild, "tap");
    shimModule.redraw();
    expect(changes).toEqual([]);
  });

  it("children-as-function receives {checked, active, disabled}", () => {
    const seen: any[] = [];
    mount(() =>
      m(Switch, { defaultChecked: false }, (api: any) => {
        seen.push({ ...api });
        return m("text", api.checked ? "on" : "off");
      }),
    );

    expect(seen.at(-1)).toEqual({ checked: false, active: false, disabled: false });
  });
});
