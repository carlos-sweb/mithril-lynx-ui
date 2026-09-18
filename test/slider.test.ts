import { describe, expect, it } from "@rstest/core";
import m from "mithril-runtime";
import { SliderIndicator, SliderRoot, SliderThumb, SliderTrack } from "../src/slider/slider.js";
import { mount as harnessMount, fire, type Mounted, type TestNode } from "./harness.js";

// The default __nodesRefInvokeHandler-less path just echoes the call back
// (see docs/native-papi/papi-01-imperative-refs.md) rather than synthesizing
// a real boundingClientRect — reasonable, since it can't know what a layout
// would actually measure. Slider's whole interaction model depends on that
// measurement resolving, so these tests stub it with a fixed, believable
// rect: a 200px-wide track starting at x=0.
//
// Tree shape worth spelling out once, since every test navigates it:
// SliderRoot's own <view> (app.root) carries the drag handlers
// (ontouchstart/move/end/cancel) — NOT SliderTrack, which only listens for
// layout changes. Track's real node is app.root.firstChild (the
// Provider/fragment layer in between is transparent, same as switch.test.ts
// already established for Switch/SwitchTrack). Track then renders its own
// fill bar first, so Indicator and Thumb are its fill bar's siblings, not
// Track's — and each of those is itself a component wrapping ONE inner,
// class-bearing <view>, so the position style (left/width) lives one level
// up from the class.

const TRACK_RECT = { left: 0, top: 0, width: 200, height: 4 };

function mount(view: () => unknown): Mounted {
	(globalThis as any).__nodesRefInvokeHandler = (_element: unknown, method: string, params: unknown, callback: (res: { code: number; data?: unknown }) => void) => {
		if (method === "boundingClientRect") callback({ code: 0, data: TRACK_RECT });
		else callback({ code: 0, data: { method, params } });
	};
	return harnessMount(view);
}

/** Reads a style/prop value written via either path — see draggable.test.ts's
 * own transformOf for why both are checked (declarative style vs. an
 * imperative internal/native-ref.js write land in different places on the
 * same test element). */
function propOf(app: Mounted, node: TestNode, key: string): string | null {
	const handle = app.applier.getHandle(node._id) as Element & { style: Record<string, string> };
	return handle.getAttribute(key) ?? handle.style[key] ?? null;
}

/** Bounds resolve via a real Promise microtask chain (internal/native-ref.js's
 * per-id invoke queue is a couple of hops deep) — a macrotask flush is safer
 * than a bare microtask wait. */
const settle = () => new Promise((r) => setTimeout(r, 0));

function mountBasicSlider(attrs: Record<string, unknown> = {}) {
	const app = mount(() =>
		m(SliderRoot, attrs, [
			m(SliderTrack, { className: "ui-slider-track" }, [
				m(SliderIndicator, { className: "ui-slider-indicator" }),
				m(SliderThumb, { className: "ui-slider-thumb" }),
			]),
		]),
	);
	const rootView = app.root;
	const track = rootView.firstChild!;
	const indicatorOuter = track.firstChild!.nextSibling!;
	const thumbOuter = indicatorOuter.nextSibling!;
	return { app, rootView, track, indicatorOuter, thumbOuter };
}

describe("slider.js", () => {
	it("uncontrolled: dragging to the middle of the track reports ~0.5", async () => {
		const changes: unknown[] = [];
		const { rootView } = mountBasicSlider({ onValueChange: (v: unknown) => changes.push(v) });

		fire(rootView, "touchstart", { detail: { x: 0 } });
		await settle();
		fire(rootView, "touchmove", { detail: { x: 100 } }); // halfway across a 200px track

		expect(changes.at(-1)).toBeCloseTo(0.5, 2);
	});

	it("clamps to the track's edges", async () => {
		const { app, rootView, thumbOuter } = mountBasicSlider({});

		fire(rootView, "touchstart", { detail: { x: 0 } });
		await settle();
		fire(rootView, "touchmove", { detail: { x: 999 } });

		expect(propOf(app, thumbOuter, "left")).toBe("100%");
	});

	it("a move that arrives before the bounds resolve is queued and replayed", async () => {
		const changes: unknown[] = [];
		const { rootView } = mountBasicSlider({ onValueChange: (v: unknown) => changes.push(v) });

		fire(rootView, "touchstart", { detail: { x: 50 } });
		// No `await settle()` here — the move below fires while the
		// boundingClientRect promise is still pending.
		fire(rootView, "touchmove", { detail: { x: 150 } });
		expect(changes.length).toBe(0); // not yet — still queued

		await settle();
		expect(changes.at(-1)).toBeCloseTo(0.75, 2);
	});

	it("range mode: dragging near a thumb moves that thumb, never past the other", async () => {
		const changes: [number, number][] = [];
		const app = mount(() =>
			m(
				SliderRoot,
				{ defaultValue: [0.2, 0.6] as [number, number], onValueChange: (v: unknown) => changes.push(v as [number, number]) },
				[m(SliderTrack, {}, [m(SliderIndicator, {}), m(SliderThumb, { index: 0 }), m(SliderThumb, { index: 1 })])],
			),
		);
		const rootView = app.root;

		// Near the lower thumb (0.2 * 200 = 40px) — should move thumb 0, not 1.
		fire(rootView, "touchstart", { detail: { x: 40 } });
		await settle();
		fire(rootView, "touchmove", { detail: { x: 10 } });

		expect(changes.at(-1)?.[0]).toBeCloseTo(0.05, 2);
		expect(changes.at(-1)?.[1]).toBeCloseTo(0.6, 2);
	});

	it("controlled: external `value` wins, and calling the imperative handle throws", () => {
		const ref: Record<string, unknown> = {};
		mountBasicSlider({ value: 0.3, sliderRef: ref });

		expect(() => (ref.updateValue as (v: number) => void)(0.9)).toThrow(/must not be called in controlled mode/);
		expect(() => (ref.getValue as () => unknown)()).toThrow(/must not be called in controlled mode/);
	});

	it("uncontrolled: the imperative handle reads and writes the value", () => {
		const ref: Record<string, unknown> = {};
		mountBasicSlider({ defaultValue: 0.4, sliderRef: ref });

		expect((ref.getValue as () => unknown)()).toBe(0.4);
		(ref.updateValue as (v: number) => void)(0.8);
		expect((ref.getValue as () => unknown)()).toBe(0.8);
	});

	it("a Slider part outside SliderRoot fails loudly", () => {
		expect(() => mount(() => m(SliderTrack, {}))).toThrow(/must be used inside a <SliderRoot>/);
	});
});
