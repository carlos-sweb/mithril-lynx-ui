import { describe, expect, it } from "@rstest/core";
import m from "mithril-runtime";
import { Input, TextArea } from "../src/input/input.js";
import { mount, fire, type Mounted, type TestNode } from "./harness.js";

// What's worth asserting here is the native contract: the attribute names and
// value shapes that reach the element, the event payload unwrapping (Lynx
// nests everything under `detail`), and that a controlled value is pushed
// through the element's own setValue (via the native-ref.js bridge — see
// docs/native-papi/papi-01-imperative-refs.md) rather than diffed on as an
// attribute.

const papiCalls = (): { fn: string; args: unknown[] }[] => (globalThis as any).__papiCalls;

function attrsOf(app: Mounted, node: TestNode): Record<string, unknown> {
	const handle = app.applier.getHandle(node._id);
	const out: Record<string, unknown> = {};
	for (const call of papiCalls()) {
		if (call.fn === "__SetAttribute" && call.args[0] === handle) out[call.args[1] as string] = call.args[2];
	}
	return out;
}

function invocations(app: Mounted, node: TestNode) {
	const handle = app.applier.getHandle(node._id);
	const calls = (globalThis as any).__nodesRefInvokeCalls as { element: unknown; method: string; params: unknown }[];
	return calls.filter((c) => c.element === handle).map((c) => ({ method: c.method, params: c.params }));
}

// invoke() crosses internal/native-ref.js's per-id queue (see
// docs/native-papi/papi-01-imperative-refs.md), which is at least two
// microtask hops deep — a single `await Promise.resolve()` isn't always
// enough to observe its effect. A macrotask flush is.
const settle = () => new Promise((r) => setTimeout(r, 0));

describe("input.js", () => {
	it("renders a native <input> with the attribute names Lynx expects", () => {
		const app = mount(() => m(Input, { className: "ui-input", placeholder: "Escribe", maxLength: 10, type: "number" }));
		const input = app.root;

		expect(input.tag).toBe("input");
		const attrs = attrsOf(app, input);
		expect(attrs.placeholder).toBe("Escribe");
		expect(attrs.maxlength).toBe("10");
		expect(attrs.type).toBe("number");
		expect(attrs["confirm-type"]).toBe("send");
	});

	it('sends booleans as strings, since a native element reads "" as not-set', () => {
		const app = mount(() => m(Input, { readonly: true, showSoftInputOnFocus: false }));
		const attrs = attrsOf(app, app.root);

		expect(attrs.readonly).toBe("true");
		expect(attrs["show-soft-input-on-focus"]).toBe("false");
	});

	it("unwraps event payloads out of `detail`", () => {
		const inputs: unknown[][] = [];
		const confirmed: string[] = [];
		const selections: number[][] = [];
		const app = mount(() =>
			m(Input, {
				onInput: (...args: unknown[]) => inputs.push(args),
				onConfirm: (v: string) => confirmed.push(v),
				onSelectionChange: (a: number, b: number) => selections.push([a, b]),
			}),
		);
		const input = app.root;

		fire(input, "input", { detail: { value: "hola", selectionStart: 4, selectionEnd: 4, isComposing: false } });
		expect(inputs.at(-1)).toEqual(["hola", 4, 4, false]);

		fire(input, "confirm", { detail: { value: "hola" } });
		expect(confirmed).toEqual(["hola"]);

		fire(input, "selection", { detail: { selectionStart: 1, selectionEnd: 3 } });
		expect(selections.at(-1)).toEqual([1, 3]);
	});

	it("pushes a controlled value through setValue, not as an attribute", async () => {
		let value = "uno";
		const app = mount(() => m(Input, { value }));
		const input = app.root;

		await settle(); // let the queued invoke() from oncreate settle
		expect(invocations(app, input).at(-1)).toEqual({ method: "setValue", params: { value: "uno" } });
		expect(attrsOf(app, input).value).toBeUndefined();

		value = "dos";
		app.redraw();
		await settle();
		expect(invocations(app, input).at(-1)).toEqual({ method: "setValue", params: { value: "dos" } });
	});

	it("doesn't re-push an unchanged controlled value on every redraw", async () => {
		const app = mount(() => m(Input, { value: "quieto" }));
		await settle();
		const before = invocations(app, app.root).length;

		app.redraw();
		app.redraw();
		await settle();

		expect(invocations(app, app.root).length).toBe(before);
	});

	it("seeds an uncontrolled field from defaultValue and then leaves it alone", async () => {
		const app = mount(() => m(Input, { defaultValue: "inicial" }));
		const input = app.root;
		await settle();

		expect(invocations(app, input).at(-1)).toEqual({ method: "setValue", params: { value: "inicial" } });

		const before = invocations(app, input).length;
		app.redraw();
		await settle();
		expect(invocations(app, input).length).toBe(before);
	});

	it("fills in the imperative handle on mount", async () => {
		const ref: Record<string, unknown> = {};
		const app = mount(() => m(Input, { inputRef: ref }));

		expect(typeof ref.focus).toBe("function");
		expect(typeof ref.getValue).toBe("function");

		await (ref.focus as () => Promise<unknown>)();
		expect(invocations(app, app.root).some((i) => i.method === "focus")).toBe(true);
	});

	it("TextArea renders a <textarea> and carries maxlines", () => {
		const app = mount(() => m(TextArea, { className: "ui-textarea", maxLines: 4 }));

		expect(app.root.tag).toBe("textarea");
		expect(attrsOf(app, app.root).maxlines).toBe("4");
	});
});
