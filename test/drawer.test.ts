import { describe, expect, it } from "@rstest/core";
import m from "mithril-runtime";
import { DrawerBackdrop, DrawerClose, DrawerContent, DrawerRoot, DrawerTrigger, DrawerView } from "../src/drawer/drawer.js";
import { mount, fire, type Mounted, type TestNode } from "./harness.js";

// drawer.js is a thin wrapper over sheet.js's own components (see its own
// header) — sheet.test.ts already covers the shared engine (presence
// timing, drag-to-dismiss, controlled/uncontrolled show, forceMount,
// group onOpen/onClose, the three "used outside its ancestor" errors) in
// full, so re-testing all of that here would just re-verify sheet.js
// through an extra layer of indirection with no new coverage. These tests
// only exercise what drawer.js's OWN wrapping logic actually does: the
// side default/override, and the additive "ui-drawer-*" class contract.
// Markup shape (DrawerBackdrop/DrawerContent as DrawerView's own children,
// each becoming its own Presence) mirrors sheet.test.ts's own — DrawerView
// IS SheetView, unwrapped, so it has the exact same nesting contract.

function isMarker(app: Mounted, node: TestNode | null): boolean {
	if (node == null) return false;
	const handle = app.applier.getHandle(node._id) as any;
	return handle?.style?.display === "none";
}

/** The real next sibling, skipping exactly one trailing marker if present — same convention as sheet.test.ts's own next(). */
function next(app: Mounted, node: TestNode): TestNode | null {
	const n = node.nextSibling;
	return n != null && isMarker(app, n) ? n.nextSibling : n;
}

const frames = (n: number) => new Promise((r) => setTimeout(r, 16 * n + 40));
const ENTER_SETTLE = 44; // matches sheet.test.ts's own constant for the same presence state machine
const LEAVE_SETTLE = 44;

function messageOfThrow(fn: () => unknown): string {
	try {
		fn();
	} catch (e) {
		return String(e instanceof Error ? e.message : e);
	}
	return "<did not throw>";
}

describe("drawer.js", () => {
	it("defaults side to left (not sheet.js's own 'bottom' default)", async () => {
		const app = mount(() => m(DrawerRoot, { defaultShow: true }, m(DrawerView, {}, m(DrawerContent, { className: "content" }, m("text", {}, "hola")))));
		await frames(ENTER_SETTLE);

		// app.root is DrawerView (= SheetView, its own real wrapper) — see
		// sheet.test.ts's own navigation note for why this isn't transparent.
		const content = app.root.firstChild!;
		expect(content.className).toContain("ui-sheet-side-left");
	});

	it("side is overridable", async () => {
		const app = mount(() =>
			m(DrawerRoot, { defaultShow: true, side: "right" }, m(DrawerView, {}, m(DrawerContent, { className: "content" }, m("text", {}, "hola")))),
		);
		await frames(ENTER_SETTLE);

		const content = app.root.firstChild!;
		expect(content.className).toContain("ui-sheet-side-right");
		expect(content.className).not.toContain("ui-sheet-side-left");
	});

	it("DrawerContent/DrawerBackdrop add their own additive class alongside sheet.js's own state classes", async () => {
		const app = mount(() =>
			m(
				DrawerRoot,
				{ defaultShow: true },
				m(DrawerView, {}, [m(DrawerBackdrop, { className: "my-backdrop" }), m(DrawerContent, { className: "my-content" }, m("text", {}, "hola"))]),
			),
		);
		await frames(ENTER_SETTLE);

		const drawerView = app.root;
		const backdrop = drawerView.firstChild!;
		const content = next(app, backdrop)!;

		expect(backdrop.className).toContain("my-backdrop");
		expect(backdrop.className).toContain("ui-drawer-backdrop");
		expect(content.className).toContain("my-content");
		expect(content.className).toContain("ui-drawer-content");
		expect(content.className).toContain("ui-sheet-side-left");
	});

	it("uncontrolled: DrawerTrigger opens it, DrawerClose closes it", async () => {
		const app = mount(() =>
			m(DrawerRoot, {}, [
				m(DrawerTrigger, { className: "trigger" }, m("text", {}, "Abrir")),
				m(DrawerView, {}, m(DrawerContent, { className: "content" }, m(DrawerClose, { className: "close" }, m("text", {}, "Cerrar")))),
			]),
		);

		const trigger = app.root;
		fire(trigger, "tap");
		await frames(ENTER_SETTLE);

		const drawerView = trigger.nextSibling!;
		expect(isMarker(app, drawerView)).toBe(false);

		// content.firstChild is DrawerContent's own inner wrapping layer (the
		// node the drag gesture is registered on) — one level in from content.
		const content = drawerView.firstChild!;
		const closeButton = content.firstChild!.firstChild!;
		fire(closeButton, "tap");
		await frames(LEAVE_SETTLE);

		expect(isMarker(app, trigger.nextSibling)).toBe(true);
	});

	it("DrawerTrigger outside a DrawerRoot fails loudly, same as sheet.js's own error", () => {
		expect(messageOfThrow(() => mount(() => m(DrawerTrigger, {}, m("text", {}, "x"))))).toMatch(/must be used inside a <SheetRoot>/);
	});
});
