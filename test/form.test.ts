import { describe, expect, it } from "@rstest/core";
import m from "mithril-runtime";
import { FormField, FormRoot, FormSubmitButton, useForm } from "../src/form/form.js";
import { Radio } from "../src/radio-group/radio-group.js";
import { mount, fire, textOf } from "./harness.js";

// FormField delegates entirely to the already-tested Input/Checkbox/Switch/
// RadioGroup — button.test.ts, choice.test.ts and input.test.ts already
// cover THEIR own behavior in depth, so these tests focus on what form.js
// itself adds: the name -> value aggregation, uncontrolled wiring
// (defaultValue/defaultChecked, set once), the mounted-suppression on
// onChanged, and unregistering on removal.

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
		const app = mount(() =>
			m(FormRoot, { onChanged: (v: Record<string, unknown>) => changes.push(v) }, m(FormField, { as: "Checkbox", name: "terms", className: "ui-checkbox" })),
		);

		expect(changes).toEqual([]); // initial registration must not count as a change

		fire(app.root, "tap");

		expect(changes).toEqual([{ terms: true }]);
	});

	it("initialValues seeds the uncontrolled field's starting value", () => {
		const app = mount(() => m(FormRoot, { initialValues: { terms: true } }, m(FormField, { as: "Checkbox", name: "terms", className: "ui-checkbox" })));

		expect(app.root.className).toContain("ui-checked");
	});

	it("a FormField as=Input reports typed values under its own name", () => {
		const changes: Record<string, unknown>[] = [];
		const app = mount(() => m(FormRoot, { onChanged: (v: Record<string, unknown>) => changes.push(v) }, m(FormField, { as: "Input", name: "nombre", className: "ui-input" })));

		fire(app.root, "input", { detail: { value: "Ada", selectionStart: 3, selectionEnd: 3, isComposing: false } });

		expect(changes).toEqual([{ nombre: "Ada" }]);
	});

	it("multiple fields accumulate into one formData object", () => {
		const changes: Record<string, unknown>[] = [];
		const app = mount(() =>
			m(FormRoot, { onChanged: (v: Record<string, unknown>) => changes.push(v) }, [
				m(FormField, { as: "Checkbox", name: "a", className: "ui-checkbox" }),
				m(FormField, { as: "Checkbox", name: "b", className: "ui-checkbox" }),
			]),
		);

		fire(app.root, "tap");
		fire(app.root.nextSibling!, "tap");

		expect(changes.at(-1)).toEqual({ a: true, b: true });
	});

	it("FormSubmitButton calls onSubmit with the full form data, after the form's own submit", () => {
		const submitted: Record<string, unknown>[] = [];
		const buttonSubmits: Record<string, unknown>[] = [];
		const app = mount(() =>
			m(FormRoot, { initialValues: { terms: false }, onSubmit: (v: Record<string, unknown>) => submitted.push(v) }, [
				m(FormField, { as: "Checkbox", name: "terms", className: "ui-checkbox" }),
				m(FormSubmitButton, { className: "ui-button", onSubmit: (v: Record<string, unknown>) => buttonSubmits.push(v) }, m("text", {}, "Enviar")),
			]),
		);

		fire(app.root.nextSibling!, "tap"); // the submit button itself

		expect(submitted).toEqual([{ terms: false }]);
		expect(buttonSubmits).toEqual([{ terms: false }]);
	});

	it("unregisters a field when it's removed, dropping it from later formData", async () => {
		let showField = true;
		const changes: Record<string, unknown>[] = [];
		const app = mount(() =>
			m(
				FormRoot,
				{ initialValues: { a: true }, onChanged: (v: Record<string, unknown>) => changes.push(v) },
				showField ? m(FormField, { as: "Checkbox", name: "a", className: "ui-checkbox", key: "a" }) : null,
			),
		);

		showField = false;
		app.redraw();
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
		const app = mount(() => m(FormRoot, { initialValues: { a: 1 } }, m(Summary)));
		expect(textOf(app.root)).toBe('{"a":1}');

		expect(messageOfThrow(() => mount(() => m(Summary)))).toMatch(/useForm\(\) must be called/);
	});

	it("a RadioGroupRoot field defaults from initialValues and reports the picked value", () => {
		const changes: Record<string, unknown>[] = [];
		const app = mount(() =>
			m(FormRoot, { initialValues: { plan: "mensual" }, onChanged: (v: Record<string, unknown>) => changes.push(v) }, [
				m(FormField, { as: "RadioGroupRoot", name: "plan" }, [m(Radio, { className: "ui-radio", value: "mensual" }), m(Radio, { className: "ui-radio", value: "anual" })]),
			]),
		);

		// FormRoot (Scope Provider) and FormField (a plain pass-through to
		// RadioGroup) both render no element of their own — app.root is
		// directly the first Radio, same "transparent wrapper" navigation
		// established by choice.test.ts for RadioGroup itself.
		const anual = app.root.nextSibling!;
		fire(anual, "tap");

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
	// to the test that found it. (That fix was in the legacy dependency,
	// npm-aliased as mithril-lynx-v1 — unrelated to the current mithril-lynx
	// this file now mounts through.)
	it("FormField rejects an unsupported `as`", () => {
		expect(messageOfThrow(() => mount(() => m(FormRoot, {}, m(FormField, { as: "Bogus" as any, name: "x" }))))).toMatch(/does not support as="Bogus"/);
	});
});
