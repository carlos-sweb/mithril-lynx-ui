import { describe, expect, it } from "@rstest/core";
import m from "mithril";
import shim from "mithril-lynx";
import { InputOTP, InputOTPSlot, useInputOTPContext } from "../src/input-otp/input-otp.js";

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
    if (call.fn === "__SetAttribute" && call.args[0] === node._handle) out[call.args[1] as string] = call.args[2];
  }
  return out;
};

const classOf = (node: any): string =>
  (papiCalls().filter((c) => c.fn === "__SetClasses" && c.args[0] === node._handle).at(-1)?.args[1] as string) ?? "";

const invocations = (node: any) =>
  papiCalls()
    .filter((c) => c.fn === "__InvokeUIMethod" && c.args[0] === node._handle)
    .map((c) => ({ method: c.args[1] as string, params: c.args[2] as Record<string, unknown> }));

function fire(node: any, type: string, detail: Record<string, unknown> = {}) {
  node._listeners[type].wrapped({ type, detail });
}

function messageOfThrow(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return String(e instanceof Error ? e.message : e);
  }
  return "<did not throw>";
}

const frames = (n: number) => new Promise((r) => setTimeout(r, 16 * n + 40));

function otpDemo(attrs: Record<string, unknown> = {}, length = 4) {
  return m(InputOTP, attrs, [
    ...Array.from({ length }, (_, i) => m(InputOTPSlot, { index: i, className: "slot" })),
  ]);
}

/** InputOTP's own root: `root.firstChild` is the scope-Provider's fragment child (the outer view itself, no marker in between — see form.js/dialog.js's own "transparent wrapper" tests for the same pattern). */
function otpRoot(view: () => unknown) {
  return mount(view).firstChild;
}

/** The Nth slot (0-based) inside the OTP's outer view. */
function slotAt(wrapper: any, index: number): any {
  let node = wrapper.firstChild;
  for (let i = 0; i < index; i++) node = node.nextSibling;
  return node;
}

/** The hidden native <input>, which sits right after the last slot. */
function inputOf(wrapper: any, slotCount: number): any {
  let node = wrapper.firstChild;
  for (let i = 0; i < slotCount; i++) node = node.nextSibling;
  return node;
}

describe("input-otp.js", () => {
  it("renders one slot per index plus the hidden native input", () => {
    const wrapper = otpRoot(() => otpDemo({}, 4));
    let node = wrapper.firstChild;
    for (let i = 0; i < 4; i++) {
      expect(classOf(node)).toContain("slot");
      node = node.nextSibling;
    }
    expect(node._tag).toBe("input");
  });

  it("uncontrolled: typing fills slots and reports onChange, only calling onComplete once full", () => {
    const changes: string[] = [];
    const completed: string[] = [];
    const wrapper = otpRoot(() =>
      otpDemo({ length: 4, onChange: (v: string) => changes.push(v), onComplete: (v: string) => completed.push(v) }),
    );
    const input = inputOf(wrapper, 4);

    fire(input, "input", { value: "1" });
    fire(input, "input", { value: "12" });
    fire(input, "input", { value: "123" });
    expect(completed).toEqual([]);

    fire(input, "input", { value: "1234" });
    expect(changes).toEqual(["1", "12", "123", "1234"]);
    expect(completed).toEqual(["1234"]);

    expect(slotAt(wrapper, 0).textContent).toBe("1");
  });

  it("numeric inputType strips non-digit characters", () => {
    const changes: string[] = [];
    const wrapper = otpRoot(() => otpDemo({ length: 4, onChange: (v: string) => changes.push(v) }));
    const input = inputOf(wrapper, 4);

    fire(input, "input", { value: "1a2b" });

    expect(changes).toEqual(["12"]);
  });

  it("controlled: value prop drives the display, typing still reports onChange", () => {
    const changes: string[] = [];
    const wrapper = otpRoot(() => otpDemo({ length: 4, value: "12", onChange: (v: string) => changes.push(v) }));
    const input = inputOf(wrapper, 4);

    expect(slotAt(wrapper, 0).textContent).toBe("1");

    fire(input, "input", { value: "129" });
    expect(changes).toEqual(["129"]);
    // Controlled — the app never updated `value`, so the slots don't move.
    expect(slotAt(wrapper, 0).textContent).toBe("1");
  });

  it("shows the fake caret only on the next-empty slot, only while focused", () => {
    const wrapper = otpRoot(() => otpDemo({ length: 4, value: "12" }));
    const input = inputOf(wrapper, 4);
    const slot2 = slotAt(wrapper, 2);

    expect(classOf(slot2)).not.toContain("ui-focused");

    fire(input, "focus");
    shimModule.redraw();

    expect(classOf(slot2)).toContain("ui-focused");
    expect(classOf(slotAt(wrapper, 0))).not.toContain("ui-focused"); // filled, not the caret slot
  });

  it("tapping the root focuses the hidden input, unless disabled", () => {
    const wrapper = otpRoot(() => otpDemo({ length: 4 }));
    const input = inputOf(wrapper, 4);

    fire(wrapper, "tap");
    expect(invocations(input).map((i) => i.method)).toContain("focus");
  });

  it("disabled InputOTP does not focus on tap and marks the native input disabled", () => {
    const wrapper = otpRoot(() => otpDemo({ length: 4, disabled: true }));
    const input = inputOf(wrapper, 4);

    fire(wrapper, "tap");
    expect(invocations(input).map((i) => i.method)).not.toContain("focus");
    expect(attrsOf(input).disabled).toBe("true");
    expect(classOf(wrapper)).toContain("ui-disabled");
  });

  it("imperative ref: setValue/clear/getValue", async () => {
    const changes: string[] = [];
    const ref: { setValue?: (v: string) => Promise<void>; clear?: () => Promise<void>; getValue?: () => string } = {};
    mount(() => otpDemo({ length: 4, inputRef: ref, onChange: (v: string) => changes.push(v) }));

    await ref.setValue!("42");
    expect(changes).toEqual(["42"]);
    expect(ref.getValue!()).toBe("42");

    await ref.clear!();
    expect(changes).toEqual(["42", ""]);
    expect(ref.getValue!()).toBe("");
  });

  it("useInputOTPContext() works from a custom node nested in InputOTP, and throws outside one", () => {
    const Custom = {
      view() {
        const ctx = useInputOTPContext();
        return m("text", {}, ctx.length + " slots");
      },
    };
    const wrapper = otpRoot(() => m(InputOTP, { length: 5 }, m(Custom)));
    expect(wrapper.firstChild.textContent).toBe("5 slots");

    expect(messageOfThrow(() => mount(() => m(Custom)))).toMatch(/must be used inside an <InputOTP>/);
  });

  it("autoFocus focuses the hidden input once mounted", async () => {
    const wrapper = otpRoot(() => otpDemo({ length: 4, autoFocus: true }));
    const input = inputOf(wrapper, 4);

    await frames(5);

    expect(invocations(input).map((i) => i.method)).toContain("focus");
  });
});
