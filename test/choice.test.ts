import { describe, expect, it } from "@rstest/core";
import m from "mithril-runtime";
import { Checkbox, CheckboxIndicator } from "../src/checkbox/checkbox.js";
import { Radio, RadioGroup, RadioIndicator } from "../src/radio-group/radio-group.js";
import { mount, fire, textOf } from "./harness.js";

// Both components are built ON button.js, so these tests focus on what they
// add over it: checked/indeterminate semantics, group coordination, and the
// indicator mount rule — not press handling, which button.test.ts covers.

describe("checkbox.js", () => {
	it("uncontrolled: tapping toggles and reports the new value", () => {
		const changes: boolean[] = [];
		const app = mount(() => m(Checkbox, { className: "ui-checkbox", onChange: (v: boolean) => changes.push(v) }));
		const box = app.root;

		expect(box.className).not.toContain("ui-checked");

		fire(box, "tap");

		expect(changes).toEqual([true]);
		expect(box.className).toContain("ui-checked");
	});

	it("indeterminate resolves to checked on tap instead of toggling", () => {
		const changes: boolean[] = [];
		const app = mount(() =>
			m(Checkbox, {
				className: "ui-checkbox",
				indeterminate: true,
				defaultChecked: true,
				onChange: (v: boolean) => changes.push(v),
			}),
		);
		const box = app.root;
		expect(box.className).toContain("ui-indeterminate");

		// Already checked — a plain toggle would report false. Indeterminate wins.
		fire(box, "tap");
		expect(changes).toEqual([true]);
	});

	it("the indicator mounts children only when there is something to indicate", () => {
		let checked = false;
		const app = mount(() =>
			m(
				Checkbox,
				{ className: "ui-checkbox", checked },
				m(CheckboxIndicator, { className: "ui-checkbox-indicator" }, m("text", "x")),
			),
		);

		const indicator = () => app.root.firstChild!;
		expect(textOf(indicator())).toBe("");

		checked = true;
		app.redraw();
		expect(textOf(indicator())).toBe("x");
		expect(indicator().className).toContain("ui-checked");
	});

	it("forceMount keeps the children mounted while unchecked", () => {
		const app = mount(() =>
			m(
				Checkbox,
				{ className: "ui-checkbox" },
				m(CheckboxIndicator, { className: "ui-checkbox-indicator", forceMount: true }, m("text", "x")),
			),
		);

		expect(textOf(app.root.firstChild!)).toBe("x");
	});
});

describe("radio-group.js", () => {
	it("selects by value, and only the selected Radio is ui-checked", () => {
		const picked: string[] = [];
		const app = mount(() =>
			m(RadioGroup, { defaultValue: "a", onValueChange: (v: string) => picked.push(v) }, [
				m(Radio, { className: "ui-radio", value: "a" }),
				m(Radio, { className: "ui-radio", value: "b" }),
			]),
		);

		const [a, b] = [app.root, app.root.nextSibling!];
		expect(a.className).toContain("ui-checked");
		expect(b.className).not.toContain("ui-checked");

		fire(b, "tap");

		expect(picked).toEqual(["b"]);
		expect(a.className).not.toContain("ui-checked");
		expect(b.className).toContain("ui-checked");
	});

	it("re-tapping the already-selected Radio reports nothing", () => {
		const picked: string[] = [];
		const app = mount(() =>
			m(RadioGroup, { defaultValue: "a", onValueChange: (v: string) => picked.push(v) }, [
				m(Radio, { className: "ui-radio", value: "a" }),
			]),
		);

		fire(app.root, "tap");
		expect(picked).toEqual([]);
	});

	it("a disabled group disables every Radio in it", () => {
		const picked: string[] = [];
		const app = mount(() =>
			m(RadioGroup, { defaultValue: "a", disabled: true, onValueChange: (v: string) => picked.push(v) }, [
				m(Radio, { className: "ui-radio", value: "b" }),
			]),
		);

		expect(app.root.className).toContain("ui-disabled");
		fire(app.root, "tap");
		expect(picked).toEqual([]);
	});

	it("controlled: `value` wins until the owner updates it", () => {
		const picked: string[] = [];
		let value = "a";
		const app = mount(() =>
			m(RadioGroup, { value, onValueChange: (v: string) => picked.push(v) }, [
				m(Radio, { className: "ui-radio", value: "a" }),
				m(Radio, { className: "ui-radio", value: "b" }),
			]),
		);
		const b = app.root.nextSibling!;

		fire(b, "tap");
		expect(picked).toEqual(["b"]);
		expect(b.className).not.toContain("ui-checked");

		value = "b";
		app.redraw();
		expect(b.className).toContain("ui-checked");
	});

	it("a Radio outside any RadioGroup fails loudly", () => {
		expect(() => mount(() => m(Radio, { value: "a" }))).toThrow(/must be used inside a <RadioGroup>/);
	});
});
