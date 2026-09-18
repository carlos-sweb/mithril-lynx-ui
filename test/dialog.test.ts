import { describe, expect, it } from "@rstest/core";
import m from "mithril-runtime";
import {
	DialogBackdrop,
	DialogClose,
	DialogContent,
	DialogRoot,
	DialogTrigger,
	DialogView,
} from "../src/dialog/dialog.js";
import { mount, fire, styleOf, type Mounted, type V2Node } from "./v2-harness.js";

// Dialog's whole animation lifecycle rides on Presence (see presence.test.ts
// for why: frame-driven, no Lynx frame pipeline in jsdom, so these tests
// either fire the native animation events or lean on the 24-frame watchdog
// rather than asserting on wall-clock timing.

const frames = (n: number) => new Promise((r) => setTimeout(r, 16 * n + 40));
// See presence.test.ts's own settle() comment: mount-redraw's own ~50ms
// scheduling debounce sits on top of Presence's frame delay on v2.
const settle = () => frames(2).then(() => new Promise((r) => setTimeout(r, 60)));
const MAX_WAIT = 24;
// Entering has an extra 8-frame layout delay before the 24-frame watchdog
// even starts (see presence.js's scheduleShow) — leaving doesn't, it goes
// straight to the watchdog. Comfortable margins for each, not tight ones.
const ENTER_SETTLE = 44;
const LEAVE_SETTLE = 44;

/**
 * Each scope-wrapped child (DialogBackdrop/DialogContent, each its own
 * Presence + scope.Provider) leaves a trailing invisible marker
 * (`<view style="display:none">`, see scope.js) as its OWN next sibling
 * before a real sibling is reached — including at DialogRoot's own top
 * level once DialogView stops rendering a real node (closed, unmounted).
 * "Nothing is here" therefore shows up as a marker, never as null. Style
 * has no readback on a fake-dom node itself (see v2-harness.ts's styleOf
 * doc) — this reads it off the real applied PAPI style, same as every
 * other style assertion in this migrated suite.
 */
function isMarker(app: Mounted, node: V2Node | null): boolean {
	return node != null && styleOf(app, node).display === "none";
}

/** The real next sibling, skipping exactly one trailing marker if present. */
function next(app: Mounted, node: V2Node): V2Node | null {
	const n = node.nextSibling;
	return isMarker(app, n) ? n!.nextSibling : n;
}

function messageOfThrow(fn: () => unknown): string {
	try {
		fn();
	} catch (e) {
		return String(e instanceof Error ? e.message : e);
	}
	return "<did not throw>";
}

describe("dialog.js", () => {
	it("uncontrolled: DialogTrigger opens it, DialogClose closes it", async () => {
		const app = mount(() =>
			m(DialogRoot, {}, [
				m(DialogTrigger, { className: "trigger" }, m("text", {}, "Abrir")),
				m(DialogView, {}, [
					m(DialogBackdrop, { className: "backdrop" }),
					m(DialogContent, { className: "content" }, [
						m(DialogClose, { className: "close" }, m("text", {}, "Cerrar")),
					]),
				]),
			]),
		);

		const trigger = app.root;
		expect(trigger.className).toContain("trigger");

		fire(trigger, "tap");
		await frames(ENTER_SETTLE);

		// DialogView is now mounted: its outer view is trigger's next sibling
		// (DialogRoot/Provider/PopMarker render no element of their own).
		const dialogView = trigger.nextSibling!;
		expect(isMarker(app, dialogView)).toBe(false);
		const backdrop = dialogView.firstChild!;
		expect(backdrop.className).toContain("backdrop");
		expect(backdrop.className).toContain("ui-open");

		const content = next(app, backdrop)!;
		expect(content.className).toContain("ui-open");
		const closeButton = content.firstChild!;

		fire(closeButton, "tap");
		await frames(LEAVE_SETTLE);

		expect(isMarker(app, trigger.nextSibling)).toBe(true);
	});

	it("controlled: show prop drives visibility, internal state never overrides it", async () => {
		let show = false;
		const shown: boolean[] = [];
		const app = mount(() =>
			m(DialogRoot, { show, onShowChange: (v: boolean) => shown.push(v) }, [
				m(DialogTrigger, { className: "trigger" }, m("text", {}, "Abrir")),
				m(DialogView, {}, m(DialogBackdrop, { className: "backdrop" })),
			]),
		);

		const trigger = app.root;
		fire(trigger, "tap");
		await settle();

		// A controlled DialogRoot never mounts DialogView on its own — only
		// onShowChange fired, reporting what the app should now set `show` to.
		expect(shown).toEqual([true]);
		expect(isMarker(app, trigger.nextSibling)).toBe(true);

		show = true;
		app.redraw();
		await frames(ENTER_SETTLE);

		expect(isMarker(app, trigger.nextSibling)).toBe(false);
	});

	it("DialogBackdrop click closes the dialog by default, and can be disabled", async () => {
		const app = mount(() =>
			m(DialogRoot, { defaultShow: true }, m(DialogView, {}, m(DialogBackdrop, { className: "backdrop" }))),
		);

		await frames(ENTER_SETTLE);
		const backdrop = app.root.firstChild!;
		fire(backdrop, "tap");
		await frames(LEAVE_SETTLE);

		expect(isMarker(app, app.root)).toBe(true);
	});

	it("clickToClose=false makes the backdrop inert", async () => {
		const app = mount(() =>
			m(
				DialogRoot,
				{ defaultShow: true },
				m(DialogView, {}, m(DialogBackdrop, { className: "backdrop", clickToClose: false })),
			),
		);

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
				DialogRoot,
				{ show, onOpen: () => opened.push(1), onClose: () => closed.push(1) },
				m(DialogView, {}, [
					m(DialogBackdrop, { className: "backdrop" }),
					m(DialogContent, { className: "content" }),
				]),
			),
		);

		await frames(10);
		const backdrop = app.root.firstChild!;
		const content = next(app, backdrop)!;

		fire(backdrop, "animationstart");
		fire(backdrop, "animationend");
		await settle();
		expect(opened).toEqual([]); // content hasn't finished entering yet

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
		expect(closed).toEqual([]); // content hasn't finished leaving yet

		fire(content, "animationstart");
		fire(content, "animationend");
		await settle();
		expect(closed).toEqual([1]);
	});

	it("forceMount keeps DialogView mounted (closed) even while show is false", async () => {
		const app = mount(() =>
			m(DialogRoot, { forceMount: true }, m(DialogView, {}, m(DialogBackdrop, { className: "backdrop" }))),
		);

		await settle();
		expect(app.root).not.toBe(null);
		expect(app.root.firstChild!.className).toContain("ui-closed");
	});

	it("DialogTrigger is disabled/busy while a transition is in flight", async () => {
		const app = mount(() =>
			m(DialogRoot, {}, [
				m(DialogTrigger, { className: "trigger" }, m("text", {}, "Abrir")),
				m(DialogView, {}, m(DialogBackdrop, { className: "backdrop" })),
			]),
		);

		const trigger = app.root;
		fire(trigger, "tap");
		await frames(10);

		expect(trigger.className).toContain("ui-busy");
	});

	it("a function child on DialogTrigger receives {busy, active, disabled}", () => {
		const seen: Record<string, unknown>[] = [];
		mount(() =>
			m(DialogRoot, {}, m(DialogTrigger, {}, (state: Record<string, unknown>) => {
				seen.push(state);
				return m("text", {}, "x");
			})),
		);

		expect(seen).toHaveLength(1);
		expect(seen[0]).toMatchObject({ busy: false, active: false, disabled: false });
	});

	it("DialogTrigger outside DialogRoot fails loudly", () => {
		expect(messageOfThrow(() => mount(() => m(DialogTrigger, {}, m("text", {}, "x"))))).toMatch(
			/must be used inside a <DialogRoot>/,
		);
	});

	it("DialogView outside DialogRoot fails loudly", () => {
		expect(messageOfThrow(() => mount(() => m(DialogView, {}, m("text", {}, "x"))))).toMatch(
			/must be used inside a <DialogRoot>/,
		);
	});

	it("DialogBackdrop outside DialogView fails loudly", () => {
		expect(messageOfThrow(() => mount(() => m(DialogRoot, {}, m(DialogBackdrop, {}))))).toMatch(
			/must be used inside a <DialogView>/,
		);
	});
});
