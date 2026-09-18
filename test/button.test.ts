import { describe, expect, it } from "@rstest/core";
import m from "mithril-runtime";
import { Button } from "../src/button/button.js";
import { mount, fire, textOf } from "./v2-harness.js";

// Asserts the behaviour contract ported from @lynx-js/lynx-ui-button: the
// exact state classes (that's what makes lynx-ui CSS render identically
// here), disabled semantics, and the children-as-function scoped slot.

describe("button.js", () => {
	it("renders a <view> and keeps the caller's className when idle", () => {
		const app = mount(() => m(Button, { className: "ui-button" }, m("text", "Tap")));
		const button = app.root;

		expect(button.tag).toBe("view");
		expect(textOf(button)).toBe("Tap");
		expect(button.className).toBe("ui-button");
	});

	it("adds ui-active while pressed and drops it on touchend", () => {
		const app = mount(() => m(Button, { className: "ui-button" }, m("text", "Tap")));
		const button = app.root;

		fire(button, "touchstart");
		expect(button.className).toBe("ui-button ui-active");

		fire(button, "touchend");
		expect(button.className).toBe("ui-button");
	});

	it("disabled: adds ui-disabled, never activates, never fires onClick", () => {
		let clicks = 0;
		const app = mount(() =>
			m(Button, { className: "ui-button", disabled: true, onClick: () => clicks++ }, m("text", "Tap")),
		);
		const button = app.root;

		expect(button.className).toBe("ui-button ui-disabled");

		fire(button, "touchstart");
		expect(button.className).toBe("ui-button ui-disabled");

		fire(button, "tap");
		expect(clicks).toBe(0);
	});

	it("fires onClick on tap when enabled", () => {
		let clicks = 0;
		const app = mount(() => m(Button, { onClick: () => clicks++ }, m("text", "Tap")));

		fire(app.root, "tap");
		expect(clicks).toBe(1);
	});

	it("children-as-function receives {active, disabled} (the scoped slot)", () => {
		const seen: { active: boolean; disabled: boolean }[] = [];
		const app = mount(() =>
			m(Button, { disabled: false }, (api: { active: boolean; disabled: boolean }) => {
				seen.push(api);
				return m("text", api.active ? "pressed" : "idle");
			}),
		);

		expect(textOf(app.root)).toBe("idle");
		expect(seen.at(-1)).toEqual({ active: false, disabled: false });

		fire(app.root, "touchstart");
		expect(textOf(app.root)).toBe("pressed");
		expect(seen.at(-1)).toEqual({ active: true, disabled: false });
	});
});
