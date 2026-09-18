import { describe, expect, it } from "@rstest/core";
import m from "mithril-runtime";
import { InputOTP, InputOTPSlot, useInputOTPContext } from "../src/input-otp/input-otp.js";
import { mount, fire, textOf, type Mounted, type TestNode } from "./harness.js";

function attrsOf(app: Mounted, node: TestNode): Record<string, unknown> {
	const handle = app.applier.getHandle(node._id);
	const out: Record<string, unknown> = {};
	for (const call of (globalThis as any).__papiCalls as { fn: string; args: unknown[] }[]) {
		if (call.fn === "__SetAttribute" && call.args[0] === handle) out[call.args[1] as string] = call.args[2];
	}
	return out;
}

function invocations(app: Mounted, node: TestNode) {
	const handle = app.applier.getHandle(node._id);
	const calls = (globalThis as any).__nodesRefInvokeCalls as { element: unknown; method: string; params: unknown }[];
	return calls.filter((c) => c.element === handle).map((c) => ({ method: c.method, params: c.params }));
}

function messageOfThrow(fn: () => unknown): string {
	try {
		fn();
	} catch (e) {
		return String(e instanceof Error ? e.message : e);
	}
	return "<did not throw>";
}

const settle = () => new Promise((r) => setTimeout(r, 0));
const frames = (n: number) => new Promise((r) => setTimeout(r, 16 * n + 40));
// mount-redraw's own scheduling margin (~50ms, empirical, not a guarantee —
// see docs/native-papi/papi-01-imperative-refs.md) plus the same +60ms
// safety margin presence.test.ts/dialog.test.ts already established.
const redrawSettle = () => new Promise((r) => setTimeout(r, 110));

function otpDemo(attrs: Record<string, unknown> = {}, length = 4) {
	return m(InputOTP, attrs, [...Array.from({ length }, (_, i) => m(InputOTPSlot, { index: i, className: "slot" }))]);
}

/** InputOTP's own root: `app.root` is the scope-Provider's fragment child (the outer view itself, no marker in between — see form.js/dialog.js's own "transparent wrapper" tests for the same pattern). */
function otpRoot(view: () => unknown): { app: Mounted; wrapper: TestNode } {
	const app = mount(view);
	return { app, wrapper: app.root };
}

/** The Nth slot (0-based) inside the OTP's outer view. */
function slotAt(wrapper: TestNode, index: number): TestNode {
	let node = wrapper.firstChild!;
	for (let i = 0; i < index; i++) node = node.nextSibling!;
	return node;
}

/** The hidden native <input>, which sits right after the last slot. */
function inputOf(wrapper: TestNode, slotCount: number): TestNode {
	let node = wrapper.firstChild!;
	for (let i = 0; i < slotCount; i++) node = node.nextSibling!;
	return node;
}

describe("input-otp.js", () => {
	it("renders one slot per index plus the hidden native input", () => {
		const { wrapper } = otpRoot(() => otpDemo({}, 4));
		let node = wrapper.firstChild!;
		for (let i = 0; i < 4; i++) {
			expect(node.className).toContain("slot");
			node = node.nextSibling!;
		}
		expect(node.tag).toBe("input");
	});

	it("uncontrolled: typing fills slots and reports onChange, only calling onComplete once full", () => {
		const changes: string[] = [];
		const completed: string[] = [];
		const { wrapper } = otpRoot(() =>
			otpDemo({ length: 4, onChange: (v: string) => changes.push(v), onComplete: (v: string) => completed.push(v) }),
		);
		const input = inputOf(wrapper, 4);

		fire(input, "input", { detail: { value: "1" } });
		fire(input, "input", { detail: { value: "12" } });
		fire(input, "input", { detail: { value: "123" } });
		expect(completed).toEqual([]);

		fire(input, "input", { detail: { value: "1234" } });
		expect(changes).toEqual(["1", "12", "123", "1234"]);
		expect(completed).toEqual(["1234"]);

		expect(textOf(slotAt(wrapper, 0))).toBe("1");
	});

	it("numeric inputType strips non-digit characters", () => {
		const changes: string[] = [];
		const { wrapper } = otpRoot(() => otpDemo({ length: 4, onChange: (v: string) => changes.push(v) }));
		const input = inputOf(wrapper, 4);

		fire(input, "input", { detail: { value: "1a2b" } });

		expect(changes).toEqual(["12"]);
	});

	it("controlled: value prop drives the display, typing still reports onChange", () => {
		const changes: string[] = [];
		const { wrapper } = otpRoot(() => otpDemo({ length: 4, value: "12", onChange: (v: string) => changes.push(v) }));
		const input = inputOf(wrapper, 4);

		expect(textOf(slotAt(wrapper, 0))).toBe("1");

		fire(input, "input", { detail: { value: "129" } });
		expect(changes).toEqual(["129"]);
		// Controlled — the app never updated `value`, so the slots don't move.
		expect(textOf(slotAt(wrapper, 0))).toBe("1");
	});

	it("shows the fake caret only on the next-empty slot, only while focused", () => {
		const { app, wrapper } = otpRoot(() => otpDemo({ length: 4, value: "12" }));
		const input = inputOf(wrapper, 4);
		const slot2 = slotAt(wrapper, 2);

		expect(slot2.className).not.toContain("ui-focused");

		fire(input, "focus");
		app.redraw();

		expect(slot2.className).toContain("ui-focused");
		expect(slotAt(wrapper, 0).className).not.toContain("ui-focused"); // filled, not the caret slot
	});

	it("tapping the root focuses the hidden input, unless disabled", async () => {
		const { app, wrapper } = otpRoot(() => otpDemo({ length: 4 }));
		const input = inputOf(wrapper, 4);

		fire(wrapper, "tap");
		await settle();
		expect(invocations(app, input).map((i) => i.method)).toContain("focus");
	});

	it("disabled InputOTP does not focus on tap and marks the native input disabled", async () => {
		const { app, wrapper } = otpRoot(() => otpDemo({ length: 4, disabled: true }));
		const input = inputOf(wrapper, 4);

		fire(wrapper, "tap");
		await settle();
		expect(invocations(app, input).map((i) => i.method)).not.toContain("focus");
		expect(attrsOf(app, input).disabled).toBe("true");
		expect(wrapper.className).toContain("ui-disabled");
	});

	it("imperative ref: setValue/clear/getValue", async () => {
		const changes: string[] = [];
		const ref: { setValue?: (v: string) => Promise<void>; clear?: () => Promise<void>; getValue?: () => string } = {};
		mount(() => otpDemo({ length: 4, inputRef: ref, onChange: (v: string) => changes.push(v) }));

		// setValue() calls mithril-lynx's mount-redraw redraw(), which
		// schedules the actual re-render ~50ms out (not synchronous) — the
		// new closure ref.getValue() reads from only exists after that
		// redraw runs. See docs/native-papi/papi-01-imperative-refs.md.
		await ref.setValue!("42");
		await redrawSettle();
		expect(changes).toEqual(["42"]);
		expect(ref.getValue!()).toBe("42");

		await ref.clear!();
		await redrawSettle();
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
		const { wrapper } = otpRoot(() => m(InputOTP, { length: 5 }, m(Custom)));
		expect(textOf(wrapper.firstChild)).toBe("5 slots");

		expect(messageOfThrow(() => mount(() => m(Custom)))).toMatch(/must be used inside an <InputOTP>/);
	});

	it("autoFocus focuses the hidden input once mounted", async () => {
		const { app, wrapper } = otpRoot(() => otpDemo({ length: 4, autoFocus: true }));
		const input = inputOf(wrapper, 4);

		await frames(5);

		expect(invocations(app, input).map((i) => i.method)).toContain("focus");
	});
});
