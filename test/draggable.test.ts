import { describe, expect, it } from "@rstest/core";
import m from "mithril-runtime";
import { Draggable } from "../src/draggable/draggable.js";
import { mount, fire, type Mounted, type TestNode } from "./harness.js";

// The drag position is written straight to the node rather than through a
// redraw (a diff per touchmove would be wasted work), via
// internal/native-ref.js's createRef().setStyleProperty() — see
// docs/native-papi/papi-02-direct-style-writes.md. These assert on the
// inline style that actually reaches the element, not on rendered output.

/**
 * The last transform written to a node, e.g. "translate(10px, 4px)".
 *
 * Two genuinely DIFFERENT write paths land on two different places on the
 * same real jsdom element, confirmed empirically here: the DECLARATIVE
 * initial render (style: {transform: ...} in view(), applied through
 * apply-patch.js's normal Op.SetStyleProperty -> __AddInlineStyle ->
 * `element.style[key] = value`) sets the real CSS style property. The
 * IMPERATIVE write (createRef().setStyleProperty(), which goes through
 * NodesRef.setNativeProps() — see docs/native-papi/papi-02-direct-style-writes.md)
 * sets a plain DOM ATTRIBUTE instead (`element.setAttributeNS(null, key,
 * value)`), which `.style.transform` never sees. Reads whichever is
 * populated, preferring the attribute (the more recent write, once any
 * imperative write has happened).
 */
function transformOf(app: Mounted, node: TestNode): string | null | undefined {
	const handle = app.applier.getHandle(node._id) as Element & { style: CSSStyleDeclaration };
	return handle.getAttribute("transform") ?? handle.style.transform ?? undefined;
}

const touch = (x: number, y: number) => ({ touches: [{ pageX: x, pageY: y }] });

describe("draggable.js", () => {
	it("moves by the delta from where the drag began", () => {
		const app = mount(() => m(Draggable, { trigger: "immediate" }));
		const node = app.root;

		fire(node, "touchstart", touch(100, 200));
		fire(node, "touchmove", touch(130, 180));

		expect(transformOf(app, node)).toBe("translate(30px, -20px)");
	});

	it("accumulates across separate drags instead of restarting from zero", () => {
		const app = mount(() => m(Draggable, { trigger: "immediate" }));
		const node = app.root;

		fire(node, "touchstart", touch(0, 0));
		fire(node, "touchmove", touch(10, 0));
		fire(node, "touchend", {});

		fire(node, "touchstart", touch(50, 50));
		fire(node, "touchmove", touch(55, 50));

		expect(transformOf(app, node)).toBe("translate(15px, 0px)");
	});

	it("clamps to explicit bounds", () => {
		const app = mount(() => m(Draggable, { trigger: "immediate", minTranslateX: -10, maxTranslateX: 10 }));
		const node = app.root;

		fire(node, "touchstart", touch(0, 0));
		fire(node, "touchmove", touch(999, 0));
		expect(transformOf(app, node)).toBe("translate(10px, 0px)");

		fire(node, "touchmove", touch(-999, 0));
		expect(transformOf(app, node)).toBe("translate(-10px, 0px)");
	});

	it("allowedDirection pins the axis it excludes", () => {
		const app = mount(() => m(Draggable, { trigger: "immediate", allowedDirection: "right" }));
		const node = app.root;

		fire(node, "touchstart", touch(0, 0));
		fire(node, "touchmove", touch(40, 40));

		// Right is allowed; left, up and down all clamp to 0.
		expect(transformOf(app, node)).toBe("translate(40px, 0px)");

		fire(node, "touchmove", touch(-40, 0));
		expect(transformOf(app, node)).toBe("translate(0px, 0px)");
	});

	it("resetOnEnd snaps back", () => {
		const app = mount(() => m(Draggable, { trigger: "immediate", resetOnEnd: true }));
		const node = app.root;

		fire(node, "touchstart", touch(0, 0));
		fire(node, "touchmove", touch(25, 25));
		expect(transformOf(app, node)).toBe("translate(25px, 25px)");

		fire(node, "touchend", {});
		expect(transformOf(app, node)).toBe("translate(0px, 0px)");
	});

	it("reports start, move and end to the app", () => {
		const events: string[] = [];
		const app = mount(() =>
			m(Draggable, {
				trigger: "immediate",
				onDragStart: () => events.push("start"),
				onDragging: (t: { x: number }) => events.push(`move:${t.x}`),
				onDragEnd: (t: { x: number }) => events.push(`end:${t.x}`),
			}),
		);
		const node = app.root;

		fire(node, "touchstart", touch(0, 0));
		fire(node, "touchmove", touch(7, 0));
		fire(node, "touchend", {});

		expect(events).toEqual(["start", "move:7", "end:7"]);
	});

	it("keeps its position across a redraw", () => {
		// Regression: an app mirroring onDragging into state redraws mid-drag,
		// and Mithril's style diff was removing the imperatively-written
		// transform because the rendered attrs didn't carry it. On device the
		// reported offset kept climbing while the element sat still.
		const app = mount(() => m(Draggable, { trigger: "immediate" }));
		const node = app.root;

		fire(node, "touchstart", touch(0, 0));
		fire(node, "touchmove", touch(60, 0));
		expect(transformOf(app, node)).toBe("translate(60px, 0px)");

		app.redraw();
		expect(transformOf(app, node)).toBe("translate(60px, 0px)");
	});

	it("ignores movement that never started with a press", () => {
		// transform is always rendered now (see the redraw regression above), so
		// the baseline is "translate(0px, 0px)" from the very first render, not
		// absent — the thing under test is that stray movement doesn't change it.
		const app = mount(() => m(Draggable, { trigger: "immediate" }));
		const node = app.root;
		const baseline = transformOf(app, node);

		fire(node, "touchmove", touch(50, 50));
		expect(transformOf(app, node)).toBe(baseline);
		expect(transformOf(app, node)).toBe("translate(0px, 0px)");
	});

	it("defaults to longpress, and attaches nothing when disabled", () => {
		const byLongPress = mount(() => m(Draggable, {})).root;
		expect(byLongPress.dispatchEvent).toBeDefined();

		// No direct listener introspection in the current fake-dom (unlike
		// legacy's `_listeners`) — assert on effect instead: longpress moves
		// it, a plain touchstart alone (no longpress) does not.
		const appA = mount(() => m(Draggable, {}));
		fire(appA.root, "touchstart", touch(0, 0));
		fire(appA.root, "touchmove", touch(20, 0));
		expect(transformOf(appA, appA.root)).toBe("translate(0px, 0px)");

		fire(appA.root, "longpress", touch(0, 0));
		fire(appA.root, "touchmove", touch(20, 0));
		expect(transformOf(appA, appA.root)).toBe("translate(20px, 0px)");

		const appDisabled = mount(() => m(Draggable, { enableDragging: false }));
		fire(appDisabled.root, "longpress", touch(0, 0));
		fire(appDisabled.root, "touchmove", touch(20, 0));
		expect(transformOf(appDisabled, appDisabled.root)).toBe("translate(0px, 0px)");
	});
});
