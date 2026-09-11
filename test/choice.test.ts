import { describe, expect, it } from "@rstest/core";
import m from "mithril";
import shim from "mithril-lynx";
import { Checkbox, CheckboxIndicator } from "../checkbox.js";
import { Radio, RadioGroup, RadioIndicator } from "../radio-group.js";

// Both components are built ON button.js, so these tests focus on what they
// add over it: checked/indeterminate semantics, group coordination, and the
// indicator mount rule — not press handling, which button.test.ts covers.

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

describe("checkbox.js", () => {
  it("uncontrolled: tapping toggles and reports the new value", () => {
    const changes: boolean[] = [];
    const root = mount(() =>
      m(Checkbox, { className: "ui-checkbox", onChange: (v: boolean) => changes.push(v) }),
    );
    const box = root.firstChild;

    expect(classOf(box)).not.toContain("ui-checked");

    fire(box, "tap");
    shimModule.redraw();

    expect(changes).toEqual([true]);
    expect(classOf(box)).toContain("ui-checked");
  });

  it("indeterminate resolves to checked on tap instead of toggling", () => {
    const changes: boolean[] = [];
    const root = mount(() =>
      m(Checkbox, {
        className: "ui-checkbox",
        indeterminate: true,
        defaultChecked: true,
        onChange: (v: boolean) => changes.push(v),
      }),
    );
    const box = root.firstChild;
    expect(classOf(box)).toContain("ui-indeterminate");

    // Already checked — a plain toggle would report false. Indeterminate wins.
    fire(box, "tap");
    expect(changes).toEqual([true]);
  });

  it("the indicator mounts children only when there is something to indicate", () => {
    let checked = false;
    const root = mount(() =>
      m(
        Checkbox,
        { className: "ui-checkbox", checked },
        m(CheckboxIndicator, { className: "ui-checkbox-indicator" }, m("text", "x")),
      ),
    );

    const indicator = () => root.firstChild.firstChild;
    expect(indicator().textContent).toBe("");

    checked = true;
    shimModule.redraw();
    expect(indicator().textContent).toBe("x");
    expect(classOf(indicator())).toContain("ui-checked");
  });

  it("forceMount keeps the children mounted while unchecked", () => {
    const root = mount(() =>
      m(
        Checkbox,
        { className: "ui-checkbox" },
        m(CheckboxIndicator, { className: "ui-checkbox-indicator", forceMount: true }, m("text", "x")),
      ),
    );

    expect(root.firstChild.firstChild.textContent).toBe("x");
  });
});

describe("radio-group.js", () => {
  it("selects by value, and only the selected Radio is ui-checked", () => {
    const picked: string[] = [];
    const root = mount(() =>
      m(RadioGroup, { defaultValue: "a", onValueChange: (v: string) => picked.push(v) }, [
        m(Radio, { className: "ui-radio", value: "a" }),
        m(Radio, { className: "ui-radio", value: "b" }),
      ]),
    );

    const [a, b] = [root.firstChild, root.firstChild.nextSibling];
    expect(classOf(a)).toContain("ui-checked");
    expect(classOf(b)).not.toContain("ui-checked");

    fire(b, "tap");
    shimModule.redraw();

    expect(picked).toEqual(["b"]);
    expect(classOf(a)).not.toContain("ui-checked");
    expect(classOf(b)).toContain("ui-checked");
  });

  it("re-tapping the already-selected Radio reports nothing", () => {
    const picked: string[] = [];
    const root = mount(() =>
      m(RadioGroup, { defaultValue: "a", onValueChange: (v: string) => picked.push(v) }, [
        m(Radio, { className: "ui-radio", value: "a" }),
      ]),
    );

    fire(root.firstChild, "tap");
    expect(picked).toEqual([]);
  });

  it("a disabled group disables every Radio in it", () => {
    const picked: string[] = [];
    const root = mount(() =>
      m(RadioGroup, { defaultValue: "a", disabled: true, onValueChange: (v: string) => picked.push(v) }, [
        m(Radio, { className: "ui-radio", value: "b" }),
      ]),
    );

    expect(classOf(root.firstChild)).toContain("ui-disabled");
    fire(root.firstChild, "tap");
    expect(picked).toEqual([]);
  });

  it("controlled: `value` wins until the owner updates it", () => {
    const picked: string[] = [];
    let value = "a";
    const root = mount(() =>
      m(RadioGroup, { value, onValueChange: (v: string) => picked.push(v) }, [
        m(Radio, { className: "ui-radio", value: "a" }),
        m(Radio, { className: "ui-radio", value: "b" }),
      ]),
    );
    const b = root.firstChild.nextSibling;

    fire(b, "tap");
    shimModule.redraw();
    expect(picked).toEqual(["b"]);
    expect(classOf(b)).not.toContain("ui-checked");

    value = "b";
    shimModule.redraw();
    expect(classOf(b)).toContain("ui-checked");
  });

  it("a Radio outside any RadioGroup fails loudly", () => {
    expect(() => mount(() => m(Radio, { value: "a" }))).toThrow(/must be used inside a <RadioGroup>/);
  });
});
