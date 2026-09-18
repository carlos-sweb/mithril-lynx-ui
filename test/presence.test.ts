import { describe, expect, it } from "@rstest/core";
import m from "mithril-runtime";
import { Presence, PresenceContent, PresenceState, resolveAnimationStatus } from "../src/presence/presence-v2.js";
import { mount, fire } from "./v2-harness.js";

// The state machine is frame-driven, and jsdom has no Lynx frame pipeline —
// internal/frames.js falls back to setTimeout there. So these tests drive the
// machine the way the device does (fire the native animation events, advance
// timers) rather than asserting on wall-clock timing.

/** Lets every pending delayFrames callback run (16ms per frame in the fallback). */
const frames = (n: number) => new Promise((r) => setTimeout(r, 16 * n + 40));

/**
 * Presence writes state immediately but defers its redraw by a frame — it has
 * to, since its effects run inside Mithril's render pass (see presence.js's
 * scheduleRedraw). So every assertion about the rendered tree waits a beat
 * rather than reading it synchronously after a state change. On v2,
 * presence.js's own frame delay is followed by mithril-lynx/mount-redraw's
 * OWN internal ~50ms scheduling debounce (see that module's header — a
 * synchronous redraw there would race the caller's own state write), so
 * this needs more margin than v1 ever did for the exact same wait.
 */
const settle = () => frames(2).then(() => new Promise((r) => setTimeout(r, 60)));

describe("resolveAnimationStatus", () => {
	it("maps each state onto the open/closed/animating flags", () => {
		expect(resolveAnimationStatus(PresenceState.Entering, false)).toMatchObject({
			entering: true,
			animating: true,
			open: true,
			closed: false,
		});
		expect(resolveAnimationStatus(PresenceState.Entered, false)).toMatchObject({
			entering: false,
			animating: false,
			open: true,
			closed: false,
		});
		expect(resolveAnimationStatus(PresenceState.Leaving, false)).toMatchObject({
			leaving: true,
			animating: true,
			open: false,
			closed: true,
		});
		expect(resolveAnimationStatus(PresenceState.Left, false)).toMatchObject({
			animating: false,
			open: false,
			closed: true,
		});
	});

	it("enableDelay treats plain Entering as still-closed (content laid out, not yet shown)", () => {
		expect(resolveAnimationStatus(PresenceState.Entering, true).closed).toBe(true);
		expect(resolveAnimationStatus(PresenceState.DelayedEntering, true).open).toBe(true);
	});

	it("grouped keeps a leaving member open so its own children don't vanish early", () => {
		expect(resolveAnimationStatus(PresenceState.Leaving, false, true).open).toBe(true);
		expect(resolveAnimationStatus(PresenceState.Leaving, false, true).closed).toBe(false);
		expect(resolveAnimationStatus(PresenceState.Left, false, true).closed).toBe(true);
	});
});

describe("presence.js", () => {
	it("starts unmounted when show is false", () => {
		const app = mount(() => m(Presence, { show: false }, m(PresenceContent, { className: "panel" })));
		expect(app.root).toBe(null);
	});

	it("mounts on show, then reaches Entered once the enter animation ends", async () => {
		let show = false;
		const opened: number[] = [];
		const app = mount(() =>
			m(
				Presence,
				{ show, onOpen: () => opened.push(1) },
				m(PresenceContent, { className: "panel" }),
			),
		);

		show = true;
		app.redraw();
		await settle();

		// Mounted first; the enter state is scheduled 8 frames out so the element
		// can lay out before its animation starts.
		expect(app.root).not.toBe(null);
		await frames(10);
		expect(app.root.className).toContain("ui-entering");

		// The element reports its animation, then reports it finished.
		fire(app.root, "animationstart");
		fire(app.root, "animationend");
		await settle();

		expect(app.root.className).toContain("ui-open");
		expect(app.root.className).not.toContain("ui-animating");
		expect(opened).toEqual([1]);
	});

	it("stays mounted while leaving, and unmounts only once the leave animation ends", async () => {
		let show = true;
		const closed: number[] = [];
		const app = mount(() =>
			m(Presence, { show, onClose: () => closed.push(1) }, m(PresenceContent, { className: "panel" })),
		);

		await frames(10);
		fire(app.root, "animationstart");
		fire(app.root, "animationend");
		await settle();

		show = false;
		app.redraw();
		await settle();

		// Still mounted — this is the whole point of Presence.
		expect(app.root).not.toBe(null);
		expect(app.root.className).toContain("ui-leaving");

		fire(app.root, "animationstart");
		fire(app.root, "animationend");
		await settle();

		expect(app.root).toBe(null);
		expect(closed).toEqual([1]);
	});

	it("unmounts anyway when no animation ever runs (the watchdog)", async () => {
		let show = true;
		const app = mount(() => m(Presence, { show }, m(PresenceContent, { className: "panel" })));

		await frames(10);
		// No animation events at all — the entering watchdog has to advance it.
		await frames(MAX_WAIT + 4);
		expect(app.root.className).toContain("ui-open");

		show = false;
		app.redraw();
		await frames(MAX_WAIT + 4);
		await settle();

		expect(app.root).toBe(null);
	});

	it("forceMount keeps content mounted while closed", () => {
		const app = mount(() =>
			m(Presence, { show: false, forceMount: true }, m(PresenceContent, { className: "panel" })),
		);

		expect(app.root).not.toBe(null);
		expect(app.root.className).toContain("ui-closed");
	});

	it("PresenceContent outside a Presence fails loudly", () => {
		expect(() => mount(() => m(PresenceContent, { className: "panel" }))).toThrow(
			/must be used inside a <Presence>/,
		);
	});
});

const MAX_WAIT = 24;
