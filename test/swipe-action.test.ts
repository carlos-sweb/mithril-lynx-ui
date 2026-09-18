import { describe, expect, it } from "@rstest/core";
import m from "mithril-runtime";
import { SwipeAction } from "../src/swipe-action/swipe-action.js";
import { mount as harnessMount, fire, gestureCallbacksOf, makeGestureController, gestureTouch, type Mounted, type TestNode } from "./harness.js";

// swipe-action.js registers a real native gesture (internal/gesture.js's
// registerGesture()) rather than plain on* touch listeners — see the
// component's own header for why, and docs/native-papi/papi-05-native-gestures.md
// for the full design. Native dispatches a gesture callback through
// globalThis.runWorklet(ctx, [event, controller]), the same mechanism
// mithril-lynx core's own test/gesture.test.ts exercises, so these tests
// extract the registered callbacks and drive them the same way.

const DISPLAY_RECT = { left: 0, top: 0, width: 300, height: 60 };
const ACTION_RECT = { left: 300, top: 0, width: 80, height: 60 };

let invokeCallCount = 0;

function mount(attrs: Record<string, unknown> = {}): Mounted {
	invokeCallCount = 0;
	(globalThis as any).__nodesRefInvokeHandler = (_element: unknown, method: string, params: unknown, callback: (res: { code: number; data?: unknown }) => void) => {
		if (method === "boundingClientRect") {
			// The two children are queried in a fixed order (display, then
			// action) — see oncreate()'s own s.displayEl/s.actionEl wiring.
			const rect = invokeCallCount % 2 === 0 ? DISPLAY_RECT : ACTION_RECT;
			invokeCallCount++;
			callback({ code: 0, data: rect });
		} else {
			callback({ code: 0, data: { method, params } });
		}
	};
	return harnessMount(() => m(SwipeAction, attrs));
}

/** See draggable.test.ts's own transformOf for why both places are checked. */
function transformOf(app: Mounted, node: TestNode): string | null | undefined {
	const handle = app.applier.getHandle(node._id) as Element & { style: CSSStyleDeclaration };
	return handle.getAttribute("transform") ?? handle.style.transform ?? undefined;
}

function widthOf(app: Mounted, node: TestNode): string | null | undefined {
	const handle = app.applier.getHandle(node._id) as Element & { style: CSSStyleDeclaration };
	return handle.getAttribute("width") ?? handle.style.width ?? undefined;
}

const settle = () => new Promise((r) => setTimeout(r, 0));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("swipe-action.js", () => {
	it("registers a native gesture on mount and claims it on touch down", async () => {
		const app = mount({});
		await settle();

		const callbacks = gestureCallbacksOf(app, app.root);
		expect(callbacks.onTouchesDown).toBeDefined();

		const controller = makeGestureController();
		callbacks.onTouchesDown(gestureTouch(300, 100, 0), controller);

		expect(controller.calls).toEqual([{ fn: "__ConsumeGesture", args: [expect.anything(), expect.any(Number), { consume: true, inner: false }] }]);
	});

	it("measures its two children and sizes itself to their combined width", async () => {
		const app = mount({});
		await settle();
		await settle();
		app.redraw();

		const row = app.root.firstChild!; // inner row — carries the width (see swipe-action.js's header)
		expect(widthOf(app, row)).toBe("380px"); // 300 (display) + 80 (action)
	});

	it("a horizontal drag moves the transform by the delta, clamped to the action area", async () => {
		const app = mount({});
		const node = app.root.firstChild!; // inner row — carries the transform (see swipe-action.js's header)
		await settle();

		const callbacks = gestureCallbacksOf(app, app.root);
		const controller = makeGestureController();

		callbacks.onTouchesDown(gestureTouch(300, 100, 0), controller);
		callbacks.onTouchesMove(gestureTouch(260, 100, 16), controller); // dx = -40 (horizontal)
		expect(transformOf(app, node)).toBe("translateX(-40px)");

		callbacks.onTouchesMove(gestureTouch(0, 100, 32), controller); // way past -actionAreaSize (80)
		expect(transformOf(app, node)).toBe("translateX(-80px)");
	});

	it("a vertical-first move fails the gesture instead of swiping", async () => {
		const app = mount({});
		const node = app.root.firstChild!; // inner row — carries the transform (see swipe-action.js's header)
		await settle();

		const callbacks = gestureCallbacksOf(app, app.root);
		const controller = makeGestureController();

		callbacks.onTouchesDown(gestureTouch(300, 100, 0), controller);
		callbacks.onTouchesMove(gestureTouch(300, 140, 16), controller); // dy = 40, dx = 0 -> vertical

		// The initial render always writes translateX(0px) (same "render it so a
		// redraw can't clobber it" discipline draggable.js established) — a
		// vertical-first move mustn't add a SECOND write on top of that baseline.
		expect(transformOf(app, node)).toBe("translateX(0px)");
		expect(controller.calls.some((c) => c.fn === "__ConsumeGesture" && (c.args[2] as any).consume === false)).toBe(true);
		expect(controller.calls.some((c) => c.fn === "__SetGestureState" && c.args[2] === 2)).toBe(true); // fail
	});

	it("a fast release past a small drag still snaps fully open, driven by velocity not distance", async () => {
		const app = mount({});
		const node = app.root.firstChild!; // inner row — carries the transform (see swipe-action.js's header)
		await settle();

		const callbacks = gestureCallbacksOf(app, app.root);
		const controller = makeGestureController();

		// Velocity needs a delta between two consecutive move samples (matches
		// the original: lastTouchMoveGestureEvent starts empty on touch down),
		// so the first move only sets the baseline — the second is the fast one.
		callbacks.onTouchesDown(gestureTouch(300, 100, 0), controller);
		callbacks.onTouchesMove(gestureTouch(299, 100, 0), controller);
		callbacks.onTouchesMove(gestureTouch(280, 100, 4), controller); // dx = -19 over 4ms = fast
		callbacks.onTouchesUp(gestureTouch(280, 100, 4), controller);

		await wait(500);
		expect(transformOf(app, node)).toBe("translateX(-80px)"); // fully open
	});

	it("a slow release before the halfway point snaps back closed", async () => {
		const app = mount({});
		const node = app.root.firstChild!; // inner row — carries the transform (see swipe-action.js's header)
		await settle();

		const callbacks = gestureCallbacksOf(app, app.root);
		const controller = makeGestureController();

		callbacks.onTouchesDown(gestureTouch(300, 100, 0), controller);
		callbacks.onTouchesMove(gestureTouch(280, 100, 200), controller); // dx = -20, slow (0.1px/ms)
		callbacks.onTouchesUp(gestureTouch(280, 100, 200), controller);

		await wait(500);
		expect(transformOf(app, node)).toBe("translateX(0px)");
	});

	it("tapping the action area fires onAction and closes", async () => {
		const fired: string[] = [];
		const app = mount({ onAction: () => fired.push("action") });
		const actionNode = app.root.firstChild!.firstChild!.nextSibling!;
		await settle();

		fire(actionNode, "tap");

		expect(fired).toEqual(["action"]);
	});

	it("the imperative handle opens and closes the action area", async () => {
		const ref: Record<string, unknown> = {};
		const app = mount({ actionRef: ref });
		const node = app.root.firstChild!; // inner row — carries the transform (see swipe-action.js's header)
		await settle();

		(ref.showActionArea as (animated?: boolean) => void)(false);
		expect(transformOf(app, node)).toBe("translateX(-80px)");

		(ref.closeActionArea as (animated?: boolean) => void)(false);
		expect(transformOf(app, node)).toBe("translateX(0px)");
	});
});
