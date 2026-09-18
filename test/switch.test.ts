import { describe, expect, it } from "@rstest/core";
import m from "mithril-runtime";
import { Switch, SwitchThumb, SwitchTrack } from "../src/switch/switch.js";
import { mount, fire } from "./harness.js";

// Asserts the behaviour contract ported from @lynx-js/lynx-ui-switch:
// controlled vs uncontrolled, the ui-active/ui-checked/ui-disabled classes
// on the root AND on the compound parts, and that Track/Thumb pick the
// state up ambiently (via ./scope.js) rather than through props.

describe("switch.js", () => {
	it("uncontrolled: defaultChecked seeds it, tapping toggles and reports the new value", () => {
		const changes: boolean[] = [];
		const app = mount(() =>
			m(Switch, { className: "ui-switch", defaultChecked: true, onChange: (v: boolean) => changes.push(v) }, [
				m(SwitchTrack, { className: "ui-switch-track" }, m(SwitchThumb, { className: "ui-switch-thumb" })),
			]),
		);

		const sw = app.root;
		expect(sw.className).toContain("ui-checked");

		fire(sw, "tap");

		expect(changes).toEqual([false]);
		expect(sw.className).not.toContain("ui-checked");
	});

	it("controlled: `checked` wins, internal state never takes over", () => {
		const changes: boolean[] = [];
		let checked = false;
		const app = mount(() =>
			m(Switch, { className: "ui-switch", checked, defaultChecked: true, onChange: (v: boolean) => changes.push(v) }, [
				m(SwitchTrack, { className: "ui-switch-track" }),
			]),
		);

		const sw = app.root;
		// defaultChecked is ignored entirely while `checked` is supplied.
		expect(sw.className).not.toContain("ui-checked");

		fire(sw, "tap");

		// onChange fired, but nothing moved until the owner passed a new `checked`.
		expect(changes).toEqual([true]);
		expect(sw.className).not.toContain("ui-checked");

		checked = true;
		app.redraw();
		expect(sw.className).toContain("ui-checked");
	});

	it("Track/Thumb read the state ambiently, with no props threaded through", () => {
		const app = mount(() =>
			m(Switch, { className: "ui-switch", defaultChecked: true }, [
				m(SwitchTrack, { className: "ui-switch-track" }, m(SwitchThumb, { className: "ui-switch-thumb" })),
			]),
		);

		const track = app.root.firstChild!;
		const thumb = track.firstChild!;
		expect(track.className).toContain("ui-checked");
		expect(thumb.className).toContain("ui-checked");

		fire(app.root, "touchstart");
		expect(thumb.className).toContain("ui-active");
	});

	it("disabled: no toggle, no onChange, ui-disabled everywhere", () => {
		const changes: boolean[] = [];
		const app = mount(() =>
			m(Switch, { className: "ui-switch", disabled: true, onChange: (v: boolean) => changes.push(v) }, [
				m(SwitchTrack, { className: "ui-switch-track" }),
			]),
		);

		expect(app.root.className).toContain("ui-disabled");
		expect(app.root.firstChild!.className).toContain("ui-disabled");

		fire(app.root, "tap");
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
