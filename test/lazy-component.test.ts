import { describe, expect, it } from "@rstest/core";
import m from "mithril-runtime";
import { LazyComponent } from "../src/lazy-component/lazy-component.js";
import { mount, fire, textOf, styleOf, attrOf } from "./harness.js";

// LazyComponent's real mechanism is a native exposure-tracking system,
// delivered here as ordinary per-node bind events (onuiappear/onuidisappear)
// rather than the original's background-thread-only global event bus — see
// lazy-component.js's own header for why. These tests drive that the same
// way every other native event in this project is driven: fire it directly
// on the node.

describe("lazy-component.js", () => {
	it("renders the placeholder, sized from estimatedStyle, before appearing", () => {
		const app = mount(() => m(LazyComponent, { pid: "p1", scene: "s1", estimatedStyle: { width: "100px", height: "40px" } }, m("text", {}, "real content")));
		const node = app.root;

		expect(textOf(node)).not.toContain("real content");
		expect(styleOf(app, node).width).toBe("100px");
		expect(styleOf(app, node).height).toBe("40px");
		expect(attrOf(app, node, "exposure-id")).toBe("p1");
		expect(attrOf(app, node, "exposure-scene")).toBe("s1");
		expect(attrOf(app, node, "exposure-screen-margin-top")).toBe("10px"); // default
	});

	it("swaps in the real children on uiappear, with no wrapper left once shown (default: stays loaded)", () => {
		const app = mount(() => m(LazyComponent, { pid: "p1", scene: "s1", estimatedStyle: {} }, m("text", {}, "real content")));

		fire(app.root, "uiappear");

		expect(textOf(app.root)).toBe("real content");
	});

	it("without unmountOnExit, a later uidisappear does not re-show the placeholder", () => {
		const app = mount(() => m(LazyComponent, { pid: "p1", scene: "s1", estimatedStyle: {} }, m("text", {}, "real content")));
		fire(app.root, "uiappear");

		fire(app.root, "uidisappear");

		expect(textOf(app.root)).toBe("real content");
	});

	it("with unmountOnExit, a uidisappear unmounts the children again and keeps the exposure wrapper", () => {
		const app = mount(() => m(LazyComponent, { pid: "p1", scene: "s1", estimatedStyle: { width: "100px", height: "40px" }, unmountOnExit: true }, m("text", {}, "real content")));

		fire(app.root, "uiappear");
		expect(textOf(app.root)).toBe("real content");

		fire(app.root, "uidisappear");
		expect(textOf(app.root)).not.toContain("real content");
		expect(attrOf(app, app.root, "exposure-id")).toBe("p1"); // still tracked, so it can re-appear later
	});

	it("with unmountOnExit, the cached real size (not the estimate) is used once it's known", () => {
		const app = mount(() => m(LazyComponent, { pid: "p1", scene: "s1", estimatedStyle: { width: "100px", height: "40px" }, unmountOnExit: true }, m("text", {}, "real content")));

		fire(app.root, "uiappear");
		fire(app.root, "layoutchange", { detail: { width: 240, height: 90 } });
		fire(app.root, "uidisappear");

		expect(styleOf(app, app.root).width).toBe("240px");
		expect(styleOf(app, app.root).height).toBe("90px");
	});

	it("onAppear/onDisappear fire for observability", () => {
		// unmountOnExit: true, deliberately — without it, the wrapper carrying
		// the exposure attrs disappears from the tree entirely once shown once
		// (same as the original), so there's nothing left to fire a LATER
		// onDisappear from. See lazy-component.d.ts's own note on this tradeoff.
		const events: string[] = [];
		const app = mount(() =>
			m(
				LazyComponent,
				{ pid: "p1", scene: "s1", estimatedStyle: {}, unmountOnExit: true, onAppear: () => events.push("appear"), onDisappear: () => events.push("disappear") },
				m("text", {}, "real content"),
			),
		);
		fire(app.root, "uiappear");
		fire(app.root, "uidisappear");

		expect(events).toEqual(["appear", "disappear"]);
	});

	it("supports the deprecated unloadable prop as an alias for unmountOnExit", () => {
		const app = mount(() => m(LazyComponent, { pid: "p1", scene: "s1", estimatedStyle: {}, unloadable: true }, m("text", {}, "real content")));
		fire(app.root, "uiappear");
		fire(app.root, "uidisappear");

		expect(textOf(app.root)).not.toContain("real content");
	});
});
