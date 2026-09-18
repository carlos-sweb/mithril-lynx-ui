import { describe, expect, it } from "@rstest/core";
import m from "mithril-runtime";
import {
	PopoverAnchor,
	PopoverArrow,
	PopoverBackdrop,
	PopoverContent,
	PopoverPositioner,
	PopoverRoot,
	PopoverTrigger,
} from "../src/popover/popover.js";
import { mount as harnessMount, fire, textOf, type Mounted, type TestNode } from "./harness.js";

// Popover's presence lifecycle is a single shared Presence (not Dialog's own
// N-child group), but rides the same frame-driven state machine — see
// presence.test.ts for why these tests wait real frames rather than
// asserting on synchronous timing. Positioning itself is computed from
// mocked boundingClientRect() results, via __nodesRefInvokeHandler — see
// docs/native-papi/papi-03-async-geometry-measurement.md.

const TRIGGER_RECT = { left: 100, top: 200, width: 50, height: 20 };
const CONTENT_RECT = { left: 0, top: 0, width: 80, height: 40 };

let invokeCallCount = 0;

function mount(view: () => unknown): Mounted {
	invokeCallCount = 0;
	(globalThis as any).__nodesRefInvokeHandler = (_element: unknown, method: string, _params: unknown, callback: (res: { code: number; data?: unknown }) => void) => {
		if (method === "boundingClientRect") {
			// maybeRecompute() calls Promise.all([measureRect(reference), measureRect(floating)]) —
			// reference (the trigger, or anchor) is always requested first.
			const rect = invokeCallCount % 2 === 0 ? TRIGGER_RECT : CONTENT_RECT;
			invokeCallCount++;
			callback({ code: 0, data: rect });
		} else {
			callback({ code: 0, data: {} });
		}
	};
	return harnessMount(view);
}

function styleOf(app: Mounted, node: TestNode): Record<string, unknown> {
	const handle = app.applier.getHandle(node._id);
	const out: Record<string, unknown> = {};
	for (const call of (globalThis as any).__papiCalls as { fn: string; args: unknown[] }[]) {
		if (call.fn === "__AddInlineStyle" && call.args[0] === handle) out[call.args[1] as string] = call.args[2];
	}
	return out;
}

const frames = (n: number) => new Promise((r) => setTimeout(r, 16 * n + 40));
// mount-redraw's redraw() (see internal/native-ref.js's own note, and
// docs/native-papi/papi-01-imperative-refs.md) schedules the actual
// re-render ~50ms out — NOT synchronous like the legacy shim.redraw() this
// file used before migrating. Every wait below needs this extra margin on
// top of the presence state machine's own timing, or a render that already
// has valid floatingCoords can still be read one tick too early. Same fix
// presence.test.ts/dialog.test.ts already needed for the identical reason.
const REDRAW_MARGIN = 70;
// DelayedEntering lands at presence.js's own 16-frame mark (enableDelay:true,
// which PopoverPositioner always passes) — enough for the position to be
// computed (maybeRecompute runs on reaching DelayedEntering), but NOT
// enough to reach the fully-open "Entered" state, since that also needs
// the 24-frame watchdog on top with no real CSS animation firing in tests.
// A click while still "busy" (Entering/DelayedEntering/Leaving) is a no-op
// by design (see resolveBusyState) — confirmed the hard way once already
// here: an 18-frame wait before clicking the backdrop again silently
// dropped the click, since the state machine hadn't reached Entered yet.
const settle = () => new Promise((r) => setTimeout(r, 16 * 18 + 40 + REDRAW_MARGIN));
// Comfortable margin past both delays PLUS the watchdog, matching
// dialog.test.ts's own identical constant for the identical state machine.
const ENTER_SETTLE_MS = 16 * 44 + 40 + REDRAW_MARGIN;
const LEAVE_SETTLE_MS = 16 * 44 + 40 + REDRAW_MARGIN;

function messageOfThrow(fn: () => unknown): string {
	try {
		fn();
	} catch (e) {
		return String(e instanceof Error ? e.message : e);
	}
	return "<did not throw>";
}

describe("popover.js", () => {
	function markerCheck(app: Mounted) {
		return (node: TestNode | null) => node != null && styleOf(app, node).display === "none";
	}

	it("uncontrolled: PopoverTrigger opens it, positions PopoverPositioner from the measured trigger rect", async () => {
		const app = mount(() =>
			m(PopoverRoot, {}, [
				m(PopoverTrigger, { className: "trigger" }, m("text", {}, "Abrir")),
				m(PopoverPositioner, { placement: "bottom", className: "positioner" }, m(PopoverContent, { className: "content" }, m("text", {}, "hola"))),
			]),
		);
		const isMarker = markerCheck(app);

		const trigger = app.root;
		fire(trigger, "tap");
		// This one starts fully closed (no defaultShow) — the tap's own
		// setUncontrolledShow() redraw (mount-redraw, ~50ms) has to land
		// BEFORE the presence state machine even starts, on top of settle()'s
		// own margin for the later measurement redraw.
		await settle();
		await new Promise((r) => setTimeout(r, REDRAW_MARGIN));

		const positioner = trigger.nextSibling!;
		expect(isMarker(positioner)).toBe(false);
		expect(positioner.className).toContain("positioner");
		// Regression check: PopoverPositioner's real content once destructured
		// `children` off vnode.ATTRS instead of reading vnode.children (the
		// exact same trap already hit in form.js/input-otp.js) — PopoverContent
		// silently never received any children at all, and the wrapper it sat
		// in (with nothing inside it) measured as zero-sized, which is what
		// this file's own earlier findings about position:fixed/measurement
		// turned out to actually be a symptom of. Confirmed fixed on device,
		// not just here — but this is what would have caught it in a test.
		expect(textOf(positioner)).toContain("hola");
		// bottom, centered: x = reference.left + reference.width/2 - floating.width/2 = 100+25-40 = 85; y = reference.top + reference.height = 220
		expect(styleOf(app, positioner).left).toBe("85px");
		expect(styleOf(app, positioner).top).toBe("220px");
		expect(Number(styleOf(app, positioner).opacity)).toBe(1);
	});

	it("placement=top-start positions above and left-aligned with the trigger", async () => {
		const app = mount(() =>
			m(PopoverRoot, { defaultShow: true }, [
				m(PopoverTrigger, { className: "trigger" }, m("text", {}, "Abrir")),
				m(PopoverPositioner, { placement: "top-start" }, m(PopoverContent, {}, m("text", {}, "hola"))),
			]),
		);
		await settle();

		const positioner = app.root.nextSibling!;
		// top: y = reference.top - floating.height = 200-40 = 160; start align: x = reference.left = 100
		expect(styleOf(app, positioner).left).toBe("100px");
		expect(styleOf(app, positioner).top).toBe("160px");
	});

	it("controlled: show prop drives visibility, internal state never overrides it", async () => {
		let show = false;
		const shown: boolean[] = [];
		const app = mount(() =>
			m(PopoverRoot, { show, onShowChange: (v: boolean) => shown.push(v) }, [
				m(PopoverTrigger, { className: "trigger" }, m("text", {}, "Abrir")),
				m(PopoverPositioner, {}, m(PopoverContent, {}, m("text", {}, "hola"))),
			]),
		);
		const isMarker = markerCheck(app);

		const trigger = app.root;
		fire(trigger, "tap");
		await frames(2);

		expect(shown).toEqual([true]);
		expect(isMarker(trigger.nextSibling)).toBe(true);

		show = true;
		app.redraw();
		await settle();

		expect(isMarker(trigger.nextSibling)).toBe(false);
	});

	it("PopoverBackdrop click closes it, and is not even mounted while closed (unlike upstream)", async () => {
		let show = true;
		const app = mount(() =>
			m(PopoverRoot, { show: undefined, defaultShow: true, onShowChange: (v: boolean) => { show = v; } }, [
				m(PopoverBackdrop, { className: "backdrop" }),
				m(PopoverPositioner, {}, m(PopoverContent, {}, m("text", {}, "hola"))),
			]),
		);
		const isMarker = markerCheck(app);
		await new Promise((r) => setTimeout(r, ENTER_SETTLE_MS));

		const backdrop = app.root;
		expect(isMarker(backdrop)).toBe(false);
		expect(backdrop.className).toContain("backdrop");

		fire(backdrop, "tap");
		await new Promise((r) => setTimeout(r, LEAVE_SETTLE_MS));

		expect(isMarker(app.root)).toBe(true);
	});

	it("forceMount keeps the positioner mounted (closed) even while show is false", async () => {
		const app = mount(() => m(PopoverRoot, { forceMount: true }, m(PopoverPositioner, {}, m(PopoverContent, { className: "content" }))));

		await frames(2);
		expect(app.root).not.toBe(null);
		expect(app.root.className).toContain("ui-closed");
	});

	it("onOpen/onClose fire once each, after the enter/leave animation actually finishes", async () => {
		const opened: number[] = [];
		const closed: number[] = [];
		let show = true;
		const app = mount(() =>
			m(PopoverRoot, { show, onOpen: () => opened.push(1), onClose: () => closed.push(1) }, m(PopoverPositioner, {}, m(PopoverContent, { className: "content" }))),
		);

		await frames(10);
		const positioner = app.root;
		fire(positioner, "animationstart");
		fire(positioner, "animationend");
		await frames(2);
		expect(opened).toEqual([1]);

		show = false;
		app.redraw();
		await frames(2);
		fire(positioner, "animationstart");
		fire(positioner, "animationend");
		await frames(2);
		expect(closed).toEqual([1]);
	});

	it("PopoverAnchor, when present, is measured instead of the trigger", async () => {
		const app = mount(() =>
			m(PopoverRoot, { defaultShow: true }, [
				m(PopoverTrigger, {}, m("text", {}, "Abrir")),
				m(PopoverAnchor, { className: "anchor" }, m("text", {}, "ancla")),
				m(PopoverPositioner, { placement: "bottom" }, m(PopoverContent, {}, m("text", {}, "hola"))),
			]),
		);
		await settle();

		// Both trigger and anchor report the SAME mocked rect here (the mock
		// doesn't distinguish nodes) — this just confirms hasAnchor routed the
		// measurement through the anchor's own el without throwing, and a
		// position was still computed successfully.
		const positioner = app.root.nextSibling!.nextSibling!;
		expect(Number(styleOf(app, positioner).opacity)).toBe(1);
	});

	it("PopoverArrow points toward the trigger side and needs no re-measurement", () => {
		const app = mount(() => m(PopoverRoot, {}, m(PopoverArrow, { className: "arrow", size: 10 })));
		const arrow = app.root;
		expect(arrow.className).toContain("arrow");
		// No placement context above it — falls back to "bottom" (the same
		// default PopoverPositioner itself uses).
		expect(styleOf(app, arrow).top).toBe("-10px");
	});

	it("PopoverTrigger outside PopoverRoot fails loudly", () => {
		expect(messageOfThrow(() => mount(() => m(PopoverTrigger, {}, m("text", {}, "x"))))).toMatch(
			/must be used inside a <PopoverRoot>/,
		);
	});

	it("PopoverPositioner outside PopoverRoot fails loudly", () => {
		expect(messageOfThrow(() => mount(() => m(PopoverPositioner, {}, m("text", {}, "x"))))).toMatch(
			/must be used inside a <PopoverRoot>/,
		);
	});

	it("PopoverContent outside PopoverPositioner fails loudly", () => {
		expect(messageOfThrow(() => mount(() => m(PopoverRoot, {}, m(PopoverContent, {}))))).toMatch(
			/must be used inside a <PopoverPositioner>/,
		);
	});
});
