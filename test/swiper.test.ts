import { describe, expect, it } from "@rstest/core";
import m from "mithril-runtime";
import { Swiper } from "../src/swiper/swiper.js";
import { mount as harnessMount, gestureCallbacksOf, makeGestureController, gestureTouch, type Mounted, type TestNode } from "./harness.js";

// swiper.js registers a real native gesture (internal/gesture.js's
// registerGesture()) rather than plain on* touch listeners — see the
// component's own header for why, and docs/native-papi/papi-05-native-gestures.md
// for the full design. Native dispatches a gesture callback through
// globalThis.runWorklet(ctx, [event, controller]) — same mechanism
// swipe-action.test.ts already established this project's own convention
// for; reused verbatim here.

function mount(attrs: Record<string, unknown>): Mounted {
	return harnessMount(() => m(Swiper, attrs));
}

/** See draggable.test.ts's own transformOf for why both places are checked. */
function transformOf(app: Mounted, node: TestNode): string | null | undefined {
	const handle = app.applier.getHandle(node._id) as Element & { style: CSSStyleDeclaration };
	return handle.getAttribute("transform") ?? handle.style.transform ?? undefined;
}

const settle = () => new Promise((r) => setTimeout(r, 0));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ITEMS = ["a", "b", "c"];
const baseAttrs = () => ({
	items: ITEMS,
	renderItem: (item: string) => m("text", {}, item),
	itemWidth: 100,
	itemHeight: 50,
});

describe("swiper.js", () => {
	it("registers a native gesture on mount and claims it on touch down", async () => {
		const app = mount(baseAttrs());
		await settle();

		const callbacks = gestureCallbacksOf(app, app.root);
		const controller = makeGestureController();
		callbacks.onTouchesDown(gestureTouch(50, 50), controller);

		expect(controller.calls).toEqual([{ fn: "__ConsumeGesture", args: [expect.anything(), expect.any(Number), { consume: true, inner: false }] }]);
	});

	it("renders one item per entry, sized to itemWidth/itemHeight, starting at translateX(0)", async () => {
		const app = mount(baseAttrs());
		const track = app.root.firstChild!;
		await settle();

		let count = 0;
		for (let node = track.firstChild; node != null; node = node.nextSibling) count++;
		expect(count).toBe(3);
		expect(transformOf(app, track)).toBe("translateX(0px)");
	});

	it("a horizontal drag moves the track by the delta, clamped at both ends", async () => {
		const app = mount(baseAttrs());
		const track = app.root.firstChild!;
		await settle();

		const callbacks = gestureCallbacksOf(app, app.root);
		const controller = makeGestureController();

		callbacks.onTouchesDown(gestureTouch(200, 100), controller);
		callbacks.onTouchesMove(gestureTouch(200, 100), controller); // seeds start, no delta yet
		callbacks.onTouchesMove(gestureTouch(150, 100), controller); // dx = -50
		expect(transformOf(app, track)).toBe("translateX(-50px)");

		callbacks.onTouchesMove(gestureTouch(-900, 100), controller); // way past the last item
		expect(transformOf(app, track)).toBe("translateX(-200px)"); // clamped: -(3-1)*100
	});

	it("a vertical-first move releases the gesture instead of swiping", async () => {
		const app = mount(baseAttrs());
		const track = app.root.firstChild!;
		await settle();

		const callbacks = gestureCallbacksOf(app, app.root);
		const controller = makeGestureController();

		callbacks.onTouchesDown(gestureTouch(200, 100), controller);
		callbacks.onTouchesMove(gestureTouch(200, 100), controller); // seeds start
		callbacks.onTouchesMove(gestureTouch(200, 160), controller); // dy = 60, dx = 0 -> vertical

		expect(transformOf(app, track)).toBe("translateX(0px)");
		expect(controller.calls.some((c) => c.fn === "__ConsumeGesture" && (c.args[2] as any).consume === false)).toBe(true);
		expect(controller.calls.some((c) => c.fn === "__SetGestureState" && c.args[2] === 2)).toBe(true); // fail
	});

	it("releasing past the swipeThreshold advances one item and fires onChange", async () => {
		const changed: number[] = [];
		const app = mount(Object.assign(baseAttrs(), { onChange: (i: number) => changed.push(i) }));
		const track = app.root.firstChild!;
		await settle();

		const callbacks = gestureCallbacksOf(app, app.root);
		const controller = makeGestureController();

		callbacks.onTouchesDown(gestureTouch(200, 100), controller);
		callbacks.onTouchesMove(gestureTouch(200, 100), controller);
		callbacks.onTouchesMove(gestureTouch(160, 100), controller); // dx = -40, past 0.2*100=20 threshold
		callbacks.onTouchesUp(gestureTouch(160, 100), controller);

		expect(changed).toEqual([1]);
		expect(transformOf(app, track)).toBe("translateX(-100px)");
	});

	it("releasing short of the threshold snaps back to the current index", async () => {
		const changed: number[] = [];
		const app = mount(Object.assign(baseAttrs(), { onChange: (i: number) => changed.push(i) }));
		const track = app.root.firstChild!;
		await settle();

		const callbacks = gestureCallbacksOf(app, app.root);
		const controller = makeGestureController();

		callbacks.onTouchesDown(gestureTouch(200, 100), controller);
		callbacks.onTouchesMove(gestureTouch(200, 100), controller);
		callbacks.onTouchesMove(gestureTouch(190, 100), controller); // dx = -10, short of the 20px threshold
		callbacks.onTouchesUp(gestureTouch(190, 100), controller);

		expect(changed).toEqual([]);
		expect(transformOf(app, track)).toBe("translateX(0px)");
	});

	it("dragging past the first item toward opening (positive) does not go below index 0", async () => {
		const app = mount(baseAttrs());
		const track = app.root.firstChild!;
		await settle();

		const callbacks = gestureCallbacksOf(app, app.root);
		const controller = makeGestureController();

		callbacks.onTouchesDown(gestureTouch(200, 100), controller);
		callbacks.onTouchesMove(gestureTouch(200, 100), controller);
		callbacks.onTouchesMove(gestureTouch(400, 100), controller); // dx = +200, clamped at 0 (no previous item)
		expect(transformOf(app, track)).toBe("translateX(0px)");
		callbacks.onTouchesUp(gestureTouch(400, 100), controller);
		expect(transformOf(app, track)).toBe("translateX(0px)");
	});

	it("initialIndex starts the track already offset", async () => {
		const app = mount(Object.assign(baseAttrs(), { initialIndex: 2 }));
		const track = app.root.firstChild!;
		await settle();

		expect(transformOf(app, track)).toBe("translateX(-200px)");
	});

	it("the imperative ref exposes swipeNext/swipePrev/swipeTo", async () => {
		const changed: number[] = [];
		const ref: Record<string, unknown> = {};
		const app = mount(Object.assign(baseAttrs(), { swiperRef: ref, onChange: (i: number) => changed.push(i) }));
		const track = app.root.firstChild!;
		await settle();

		(ref.swipeNext as () => void)();
		expect(transformOf(app, track)).toBe("translateX(-100px)");

		(ref.swipeTo as (i: number) => void)(2);
		expect(transformOf(app, track)).toBe("translateX(-200px)");

		(ref.swipePrev as () => void)();
		expect(transformOf(app, track)).toBe("translateX(-100px)");

		expect(changed).toEqual([1, 2, 1]);
	});

	it("swipeNext/swipeTo clamp to the item range and do not fire onChange when the index is unchanged", async () => {
		const changed: number[] = [];
		const ref: Record<string, unknown> = {};
		mount(Object.assign(baseAttrs(), { swiperRef: ref, initialIndex: 2, onChange: (i: number) => changed.push(i) }));
		await settle();

		(ref.swipeNext as () => void)(); // already at the last item
		expect(changed).toEqual([]);
	});

	it("autoPlay advances on an interval and pauses while dragging", async () => {
		const changed: number[] = [];
		const app = mount(Object.assign(baseAttrs(), { autoPlay: true, autoPlayInterval: 15, onChange: (i: number) => changed.push(i) }));
		await settle();

		await wait(25); // one tick has definitely fired by now, and not e.g. a runaway loop
		expect(changed.length).toBeGreaterThanOrEqual(1);
		expect(changed[0]).toBe(1);

		const callbacks = gestureCallbacksOf(app, app.root);
		const controller = makeGestureController();
		callbacks.onTouchesDown(gestureTouch(200, 100), controller); // stops autoplay's timer
		const countAtDragStart = changed.length;

		await wait(60);
		expect(changed.length).toBe(countAtDragStart); // no further advance while the timer is stopped
	});
});
