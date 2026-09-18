import { describe, expect, it } from "@rstest/core";
import m from "mithril";
import shim from "mithril-lynx";
import { Input, TextArea } from "../src/input/input.js";

// What's worth asserting here is the native contract: the attribute names and
// value shapes that reach the element, the event payload unwrapping (Lynx
// nests everything under `detail`), and that a controlled value is pushed
// through the element's own setValue rather than diffed on as an attribute.

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

const attrsOf = (node: any): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const call of papiCalls()) {
    if (call.fn === "__SetAttribute" && call.args[0] === node._handle) {
      out[call.args[1] as string] = call.args[2];
    }
  }
  return out;
};

const invocations = (node: any) =>
  papiCalls()
    .filter((c) => c.fn === "__InvokeUIMethod" && c.args[0] === node._handle)
    .map((c) => ({ method: c.args[1] as string, params: c.args[2] as Record<string, unknown> }));

function fire(node: any, type: string, detail: Record<string, unknown>) {
  node._listeners[type].wrapped({ type, detail });
}

describe("input.js", () => {
  it("renders a native <input> with the attribute names Lynx expects", () => {
    const root = mount(() =>
      m(Input, { className: "ui-input", placeholder: "Escribe", maxLength: 10, type: "number" }),
    );
    const input = root.firstChild;

    expect(input._tag).toBe("input");
    const attrs = attrsOf(input);
    expect(attrs.placeholder).toBe("Escribe");
    // Everything crosses as a string: the shim mirrors the DOM, where
    // setAttribute always stringifies. Native parses the numeric ones.
    expect(attrs.maxlength).toBe("10");
    expect(attrs.type).toBe("number");
    expect(attrs["confirm-type"]).toBe("send");
  });

  it("sends booleans as strings, since a native element reads \"\" as not-set", () => {
    const root = mount(() => m(Input, { readonly: true, showSoftInputOnFocus: false }));
    const attrs = attrsOf(root.firstChild);

    expect(attrs.readonly).toBe("true");
    expect(attrs["show-soft-input-on-focus"]).toBe("false");
  });

  it("unwraps event payloads out of `detail`", () => {
    const inputs: unknown[][] = [];
    const confirmed: string[] = [];
    const selections: number[][] = [];
    const root = mount(() =>
      m(Input, {
        onInput: (...args: unknown[]) => inputs.push(args),
        onConfirm: (v: string) => confirmed.push(v),
        onSelectionChange: (a: number, b: number) => selections.push([a, b]),
      }),
    );
    const input = root.firstChild;

    fire(input, "input", { value: "hola", selectionStart: 4, selectionEnd: 4, isComposing: false });
    expect(inputs.at(-1)).toEqual(["hola", 4, 4, false]);

    fire(input, "confirm", { value: "hola" });
    expect(confirmed).toEqual(["hola"]);

    fire(input, "selection", { selectionStart: 1, selectionEnd: 3 });
    expect(selections.at(-1)).toEqual([1, 3]);
  });

  it("pushes a controlled value through setValue, not as an attribute", () => {
    let value = "uno";
    const root = mount(() => m(Input, { value }));
    const input = root.firstChild;

    expect(invocations(input).at(-1)).toEqual({ method: "setValue", params: { value: "uno" } });
    expect(attrsOf(input).value).toBeUndefined();

    value = "dos";
    shimModule.redraw();
    expect(invocations(input).at(-1)).toEqual({ method: "setValue", params: { value: "dos" } });
  });

  it("doesn't re-push an unchanged controlled value on every redraw", () => {
    const root = mount(() => m(Input, { value: "quieto" }));
    const before = invocations(root.firstChild).length;

    shimModule.redraw();
    shimModule.redraw();

    expect(invocations(root.firstChild).length).toBe(before);
  });

  it("seeds an uncontrolled field from defaultValue and then leaves it alone", () => {
    const root = mount(() => m(Input, { defaultValue: "inicial" }));
    const input = root.firstChild;

    expect(invocations(input).at(-1)).toEqual({ method: "setValue", params: { value: "inicial" } });

    const before = invocations(input).length;
    shimModule.redraw();
    expect(invocations(input).length).toBe(before);
  });

  it("fills in the imperative handle on mount", async () => {
    const ref: Record<string, unknown> = {};
    const root = mount(() => m(Input, { inputRef: ref }));

    expect(typeof ref.focus).toBe("function");
    expect(typeof ref.getValue).toBe("function");

    await (ref.focus as () => Promise<unknown>)();
    expect(invocations(root.firstChild).some((i) => i.method === "focus")).toBe(true);
  });

  it("TextArea renders a <textarea> and carries maxlines", () => {
    const root = mount(() => m(TextArea, { className: "ui-textarea", maxLines: 4 }));

    expect(root.firstChild._tag).toBe("textarea");
    expect(attrsOf(root.firstChild).maxlines).toBe("4");
  });
});
