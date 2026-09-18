import { describe, expect, it } from "@rstest/core";
import m from "mithril-runtime";
import {
	SheetBackdrop,
	SheetClose,
	SheetContent,
	SheetHandle,
	SheetRoot,
	SheetTrigger,
	SheetView,
} from "../src/sheet/sheet.js";
import { mount, fire, gestureCallbacksOf, makeGestureController, gestureTouch, type Mounted, type TestNode } from "./harness.js";

// Sheet's whole animation lifecycle rides on Presence, same as Dialog's —
// see dialog.test.ts/presence.test.ts for why these tests fire the native
// animation events / lean on the 24-frame watchdog rather than asserting on
// wall-clock timing.

function papiCalls(): { fn: string; args: unknown[] }[] {
	return (globalThis as any).__papiCalls;
}

/** See draggable.test.ts's own transformOf for why both places are checked
 * (a declarative style render vs. an imperative internal/native-ref.js
 * write land in different places on the same test element). */
function transformOf(app: Mounted, node: TestNode): string | null | undefined {
	const handle = app.applier.getHandle(node._id) as Element & { style: CSSStyleDeclaration };
	return handle.getAttribute("transform") ?? handle.style.transform ?? undefined;
}

const frames = (n: number) => new Promise((r) => setTimeout(r, 16 * n + 40));
const settle = () => frames(2);
// Entering has an extra 8-frame layout delay before the 24-frame watchdog
// even starts (see presence.js's scheduleShow) — leaving doesn't, it goes
// straight to the watchdog. Comfortable margins for each, not tight ones.
const ENTER_SETTLE = 44;
const LEAVE_SETTLE = 44;

/**
 * Each scope-wrapped child (SheetBackdrop/SheetContent, each its own
 * Presence + scope.Provider) leaves a trailing invisible marker
 * (`<view style="display:none">`, see scope.js) as its OWN next sibling
 * before a real sibling is reached — including at SheetRoot's own top
 * level once SheetView stops rendering a real node (closed, unmounted).
 * "Nothing is here" therefore shows up as a marker, never as null.
 */
function isMarker(app: Mounted, node: TestNode | null): boolean {
	if (node == null) return false;
	const handle = app.applier.getHandle(node._id) as any;
	return handle?.style?.display === "none";
}

/** The real next sibling, skipping exactly one trailing marker if present. */
function next(app: Mounted, node: TestNode): TestNode | null {
	const n = node.nextSibling;
	return n != null && isMarker(app, n) ? n.nextSibling : n;
}

function messageOfThrow(fn: () => unknown): string {
	try {
		fn();
	} catch (e) {
		return String(e instanceof Error ? e.message : e);
	}
	return "<did not throw>";
}

describe("sheet.js", () => {
	it("uncontrolled: SheetTrigger opens it, SheetClose closes it", async () => {
		const app = mount(() =>
			m(SheetRoot, {}, [
				m(SheetTrigger, { className: "trigger" }, m("text", {}, "Abrir")),
				m(SheetView, {}, [
					m(SheetBackdrop, { className: "backdrop" }),
					m(SheetContent, { className: "content" }, [m(SheetClose, { className: "close" }, m("text", {}, "Cerrar"))]),
				]),
			]),
		);

		const trigger = app.root;
		expect(trigger.className).toContain("trigger");

		fire(trigger, "tap");
		await frames(ENTER_SETTLE);

		const sheetView = trigger.nextSibling!;
		expect(isMarker(app, sheetView)).toBe(false);
		const backdrop = sheetView.firstChild!;
		expect(backdrop.className).toContain("backdrop");
		expect(backdrop.className).toContain("ui-open");

		const content = next(app, backdrop)!;
		expect(content.className).toContain("ui-open");
		// Default side is bottom — always present regardless of `transition`.
		expect(content.className).toContain("ui-sheet-side-bottom");

		// content.firstChild is SheetContent's own inner wrapping layer (the
		// node the drag gesture is registered on) — one level in from content.
		const closeButton = content.firstChild!.firstChild!;

		fire(closeButton, "tap");
		await frames(LEAVE_SETTLE);

		expect(isMarker(app, trigger.nextSibling)).toBe(true);
	});

	it("side resolves start/end against enableRTL", async () => {
		const app = mount(() => m(SheetRoot, { defaultShow: true, side: "start", enableRTL: true }, m(SheetView, {}, m(SheetContent, { className: "content" }))));
		await settle();
		expect(app.root.firstChild!.className).toContain("ui-sheet-side-right");
	});

	it("controlled: show prop drives visibility, internal state never overrides it", async () => {
		let show = false;
		const shown: boolean[] = [];
		const app = mount(() =>
			m(SheetRoot, { show, onShowChange: (v: boolean) => shown.push(v) }, [
				m(SheetTrigger, { className: "trigger" }, m("text", {}, "Abrir")),
				m(SheetView, {}, m(SheetBackdrop, { className: "backdrop" })),
			]),
		);

		const trigger = app.root;
		fire(trigger, "tap");
		await settle();

		expect(shown).toEqual([true]);
		expect(isMarker(app, trigger.nextSibling)).toBe(true);

		show = true;
		app.redraw();
		await frames(ENTER_SETTLE);

		expect(isMarker(app, trigger.nextSibling)).toBe(false);
	});

	it("SheetBackdrop click closes the sheet by default, and can be disabled", async () => {
		const app = mount(() => m(SheetRoot, { defaultShow: true }, m(SheetView, {}, m(SheetBackdrop, { className: "backdrop" }))));

		await frames(ENTER_SETTLE);
		const backdrop = app.root.firstChild!;
		fire(backdrop, "tap");
		await frames(LEAVE_SETTLE);

		expect(isMarker(app, app.root)).toBe(true);
	});

	it("clickToClose=false makes the backdrop inert", async () => {
		const app = mount(() => m(SheetRoot, { defaultShow: true }, m(SheetView, {}, m(SheetBackdrop, { className: "backdrop", clickToClose: false }))));

		await frames(ENTER_SETTLE);
		const backdrop = app.root.firstChild!;
		fire(backdrop, "tap");
		await settle();

		expect(isMarker(app, app.root)).toBe(false);
		expect(backdrop.className).toContain("ui-open");
	});

	it("onOpen/onClose fire once, only after BOTH backdrop and content finish their own transition", async () => {
		const opened: number[] = [];
		const closed: number[] = [];
		let show = true;
		const app = mount(() =>
			m(
				SheetRoot,
				{ show, onOpen: () => opened.push(1), onClose: () => closed.push(1) },
				m(SheetView, {}, [m(SheetBackdrop, { className: "backdrop" }), m(SheetContent, { className: "content" })]),
			),
		);

		await frames(10);
		const backdrop = app.root.firstChild!;
		const content = next(app, backdrop)!;

		fire(backdrop, "animationstart");
		fire(backdrop, "animationend");
		await settle();
		expect(opened).toEqual([]);

		fire(content, "animationstart");
		fire(content, "animationend");
		await settle();
		expect(opened).toEqual([1]);

		show = false;
		app.redraw();
		await settle();

		fire(backdrop, "animationstart");
		fire(backdrop, "animationend");
		await settle();
		expect(closed).toEqual([]);

		fire(content, "animationstart");
		fire(content, "animationend");
		await settle();
		expect(closed).toEqual([1]);
	});

	it("forceMount keeps SheetView mounted (closed) even while show is false", async () => {
		const app = mount(() => m(SheetRoot, { forceMount: true }, m(SheetView, {}, m(SheetBackdrop, { className: "backdrop" }))));

		await settle();
		expect(app.root).not.toBe(null);
		expect(app.root.firstChild!.className).toContain("ui-closed");
	});

	it("dragging the content past dismissThreshold closes it; short of it, it snaps back and stays open", async () => {
		let show = true;
		const shown: boolean[] = [];
		const app = mount(() =>
			m(
				SheetRoot,
				{
					show,
					onShowChange: (v: boolean) => {
						shown.push(v);
						show = v;
					},
					dismissThreshold: 50,
				},
				m(SheetView, {}, m(SheetContent, { className: "content" }, m("text", {}, "body"))),
			),
		);
		await frames(ENTER_SETTLE);

		// app.root is SheetView's own real wrapper (it renders one, unlike
		// SheetRoot's transparent Provider) — SheetContent's own outer node
		// is its child, and the gesture/ref-bearing inner node is one more
		// level in.
		const content = app.root.firstChild!;
		const inner = content.firstChild!;
		const callbacks = gestureCallbacksOf(app, inner);
		const controller = makeGestureController();

		// Short drag (bottom sheet closes by dragging DOWN): under threshold —
		// moves live with the drag, then snaps back on release without closing.
		callbacks.onTouchesDown(gestureTouch(0, 0), controller);
		callbacks.onTouchesMove(gestureTouch(0, 20), controller);
		expect(transformOf(app, inner)).toBe("translate(0px, 20px)");
		callbacks.onTouchesUp(gestureTouch(0, 20), controller);
		expect(shown).toEqual([]);
		expect(transformOf(app, inner)).toBe("translate(0px, 0px)");

		// Long drag past the 50px threshold — closes.
		callbacks.onTouchesDown(gestureTouch(0, 0), controller);
		callbacks.onTouchesMove(gestureTouch(0, 90), controller);
		callbacks.onTouchesUp(gestureTouch(0, 90), controller);
		expect(shown).toEqual([false]);
	});

	it("dragging toward the OPENING direction doesn't move the sheet at all", async () => {
		const app = mount(() => m(SheetRoot, { defaultShow: true }, m(SheetView, {}, m(SheetContent, { className: "content" }))));
		await frames(ENTER_SETTLE);

		const inner = app.root.firstChild!.firstChild!;
		const callbacks = gestureCallbacksOf(app, inner);
		const controller = makeGestureController();

		callbacks.onTouchesDown(gestureTouch(0, 0), controller);
		callbacks.onTouchesMove(gestureTouch(0, -40), controller); // bottom sheet: dragging UP is the opening direction

		expect(transformOf(app, inner)).toBe("translate(0px, 0px)");
	});

	it("enableDragToClose=false registers no gesture at all", async () => {
		const app = mount(() =>
			m(SheetRoot, { defaultShow: true, enableDragToClose: false }, m(SheetView, {}, m(SheetContent, { className: "content" }, m("text", {}, "body")))),
		);
		await frames(ENTER_SETTLE);

		const inner = app.root.firstChild!.firstChild!;
		const handle = app.applier.getHandle(inner._id) as any;
		expect(handle.gesture).toBeUndefined();
	});

	it("SheetHandle renders its own class alongside the caller's", () => {
		const app = mount(() => m(SheetHandle, { className: "grip" }));
		expect(app.root.className).toContain("grip");
		expect(app.root.className).toContain("ui-sheet-handle");
	});

	it("a function child on SheetTrigger receives {busy, active, disabled}", () => {
		const seen: Record<string, unknown>[] = [];
		mount(() =>
			m(SheetRoot, {}, m(SheetTrigger, {}, (state: Record<string, unknown>) => {
				seen.push(state);
				return m("text", {}, "x");
			})),
		);

		expect(seen).toHaveLength(1);
		expect(seen[0]).toMatchObject({ busy: false, active: false, disabled: false });
	});

	it("SheetTrigger outside SheetRoot fails loudly", () => {
		expect(messageOfThrow(() => mount(() => m(SheetTrigger, {}, m("text", {}, "x"))))).toMatch(/must be used inside a <SheetRoot>/);
	});

	it("SheetView outside SheetRoot fails loudly", () => {
		expect(messageOfThrow(() => mount(() => m(SheetView, {}, m("text", {}, "x"))))).toMatch(/must be used inside a <SheetRoot>/);
	});

	it("SheetBackdrop outside SheetView fails loudly", () => {
		expect(messageOfThrow(() => mount(() => m(SheetRoot, {}, m(SheetBackdrop, {}))))).toMatch(/must be used inside a <SheetView>/);
	});
});
