import { describe, expect, it } from "@rstest/core";
import m from "mithril";
import shim from "mithril-lynx";
import { FormField, FormRoot, FormSubmitButton, useForm } from "../form.js";
import { Radio } from "../radio-group.js";

// FormField delegates entirely to the already-tested Input/Checkbox/Switch/
// RadioGroup — button.test.ts, choice.test.ts and input.test.ts already
// cover THEIR own behavior in depth, so these tests focus on what form.js
// itself adds: the name -> value aggregation, uncontrolled wiring
// (defaultValue/defaultChecked, set once), the mounted-suppression on
// onChanged, and unregistering on removal.

const shimModule = ((shim as any).default ?? shim) as {
  renderToPage(pageElement: unknown, vnode: unknown): unknown;
  redraw(): void;
};

function mount(view: () => unknown): any {
  lynxTestingEnv.switchToMainThread();
  const page = __CreatePage("0", 0);
  return shimModule.renderToPage(page, m({ view })) as any;
}

function fire(node: any, type: string, detail: Record<string, unknown> = {}) {
  node._listeners[type]?.wrapped({ type, detail });
}

/**
 * `.toThrow(regex)` misbehaved specifically when several such assertions ran
 * in sequence within this one file (confirmed NOT a form.js bug: an
 * isolated single-test reproduction of each case throws the right message
 * every time) — a rstest/expect quirk this project hasn't chased further.
 * Sidestepped with a plain try/catch instead, which is reliable.
 */
function messageOfThrow(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return String(e instanceof Error ? e.message : e);
  }
  return "<did not throw>";
}

describe("form.js", () => {
  it("a FormField as=Checkbox toggling reports the field name and value, not on initial mount", () => {
    const changes: Record<string, unknown>[] = [];
    const root = mount(() =>
      m(FormRoot, { onChanged: (v: Record<string, unknown>) => changes.push(v) }, m(FormField, { as: "Checkbox", name: "terms", className: "ui-checkbox" })),
    );

    expect(changes).toEqual([]); // initial registration must not count as a change

    fire(root.firstChild, "tap");
    shimModule.redraw();

    expect(changes).toEqual([{ terms: true }]);
  });

  it("initialValues seeds the uncontrolled field's starting value", () => {
    const root = mount(() => m(FormRoot, { initialValues: { terms: true } }, m(FormField, { as: "Checkbox", name: "terms", className: "ui-checkbox" })));

    const papiCalls = (): { fn: string; args: unknown[] }[] => (globalThis as any).__papiCalls;
    const classOf = (node: any) => (papiCalls().filter((c) => c.fn === "__SetClasses" && c.args[0] === node._handle).at(-1)?.args[1] as string) ?? "";

    expect(classOf(root.firstChild)).toContain("ui-checked");
  });

  it("a FormField as=Input reports typed values under its own name", () => {
    const changes: Record<string, unknown>[] = [];
    const root = mount(() => m(FormRoot, { onChanged: (v: Record<string, unknown>) => changes.push(v) }, m(FormField, { as: "Input", name: "nombre", className: "ui-input" })));

    fire(root.firstChild, "input", { value: "Ada", selectionStart: 3, selectionEnd: 3, isComposing: false });
    shimModule.redraw();

    expect(changes).toEqual([{ nombre: "Ada" }]);
  });

  it("multiple fields accumulate into one formData object", () => {
    const changes: Record<string, unknown>[] = [];
    const root = mount(() =>
      m(FormRoot, { onChanged: (v: Record<string, unknown>) => changes.push(v) }, [
        m(FormField, { as: "Checkbox", name: "a", className: "ui-checkbox" }),
        m(FormField, { as: "Checkbox", name: "b", className: "ui-checkbox" }),
      ]),
    );

    fire(root.firstChild, "tap");
    shimModule.redraw();
    fire(root.firstChild.nextSibling, "tap");
    shimModule.redraw();

    expect(changes.at(-1)).toEqual({ a: true, b: true });
  });

  it("FormSubmitButton calls onSubmit with the full form data, after the form's own submit", () => {
    const submitted: Record<string, unknown>[] = [];
    const buttonSubmits: Record<string, unknown>[] = [];
    const root = mount(() =>
      m(FormRoot, { initialValues: { terms: false }, onSubmit: (v: Record<string, unknown>) => submitted.push(v) }, [
        m(FormField, { as: "Checkbox", name: "terms", className: "ui-checkbox" }),
        m(FormSubmitButton, { className: "ui-button", onSubmit: (v: Record<string, unknown>) => buttonSubmits.push(v) }, m("text", {}, "Enviar")),
      ]),
    );

    fire(root.firstChild.nextSibling, "tap"); // the submit button itself

    expect(submitted).toEqual([{ terms: false }]);
    expect(buttonSubmits).toEqual([{ terms: false }]);
  });

  it("unregisters a field when it's removed, dropping it from later formData", async () => {
    let showField = true;
    const changes: Record<string, unknown>[] = [];
    const root = mount(() =>
      m(
        FormRoot,
        { initialValues: { a: true }, onChanged: (v: Record<string, unknown>) => changes.push(v) },
        showField ? m(FormField, { as: "Checkbox", name: "a", className: "ui-checkbox", key: "a" }) : null,
      ),
    );
    void root;

    showField = false;
    shimModule.redraw();
    // unregisterField's own notification is deferred a frame — see
    // form.js's header on why onremove can't redraw synchronously.
    await new Promise((r) => setTimeout(r, 50));

    expect(changes.at(-1)).toEqual({});
  });

  it("a FormField outside FormRoot fails loudly", () => {
    expect(messageOfThrow(() => mount(() => m(FormField, { as: "Checkbox", name: "x" })))).toMatch(/must be used inside a <FormRoot>/);
  });

  it("useForm() works from a plain component nested in FormRoot, and throws outside one", () => {
    const Summary = {
      view() {
        const api = useForm();
        return m("text", {}, JSON.stringify(api.getAllValues()));
      },
    };
    const root = mount(() => m(FormRoot, { initialValues: { a: 1 } }, m(Summary)));
    expect(root.firstChild.textContent).toBe('{"a":1}');

    expect(messageOfThrow(() => mount(() => m(Summary)))).toMatch(/useForm\(\) must be called/);
  });

  it("a RadioGroupRoot field defaults from initialValues and reports the picked value", () => {
    const changes: Record<string, unknown>[] = [];
    const root = mount(() =>
      m(FormRoot, { initialValues: { plan: "mensual" }, onChanged: (v: Record<string, unknown>) => changes.push(v) }, [
        m(FormField, { as: "RadioGroupRoot", name: "plan" }, [m(Radio, { className: "ui-radio", value: "mensual" }), m(Radio, { className: "ui-radio", value: "anual" })]),
      ]),
    );

    // FormRoot (Scope Provider) and FormField (a plain pass-through to
    // RadioGroup) both render no element of their own — root.firstChild is
    // directly the first Radio, same "transparent wrapper" navigation
    // established by choice.test.ts for RadioGroup itself.
    const anual = root.firstChild.nextSibling;
    fire(anual, "tap");
    shimModule.redraw();

    expect(changes).toEqual([{ plan: "anual" }]);
  });

  // This test — a component whose view() throws on its very first render —
  // is what surfaced a real mithril-lynx CORE bug: initComponent()'s
  // reentrancy lock lives on the component's own shared `view` function,
  // not per instance, and was only ever cleared on the success path. A
  // thrown view() left it stuck forever, silently no-oping every LATER
  // mount of that same component anywhere in the app (no render, no
  // error) — which is what made this test order-sensitive before the fix
  // (passed alone, failed after certain other tests in this file). Fixed
  // in mithril-lynx@0.0.5 (initComponent now always clears the lock via
  // try/finally); this project depends on ^0.0.5. No longer order-sensitive
  // — kept here rather than moved back up mainly so this note stays next
  // to the test that found it.
  it("FormField rejects an unsupported `as`", () => {
    expect(messageOfThrow(() => mount(() => m(FormRoot, {}, m(FormField, { as: "Bogus" as any, name: "x" }))))).toMatch(/does not support as="Bogus"/);
  });
});
