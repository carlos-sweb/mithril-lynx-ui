// swipe-action.js
//
// Mithril port of @lynx-js/lynx-ui-swipe-action (Apache-2.0 — see ./NOTICE):
// a horizontal swipe-to-reveal-an-action row, the classic "swipe left to
// delete" list-item pattern.
//
// The original carries the project's heaviest MTS usage yet — twelve
// `'main thread'` functions doing the touch math, the cubic-bezier
// snap-back animation, AND registering a native gesture (via
// @lynx-js/gesture-runtime's NativeGesture) so a horizontal swipe can
// properly compete with an ancestor <scroll-view>'s vertical scroll at the
// native gesture-arena level — not just "listen for touch events", but
// actually claim or release the gesture before the scroll-view acts on it.
//
// Same bet as draggable.js and slider.js: in mithril-lynx's main-thread-
// owned mode there's no thread hop to avoid, so the math ports as plain
// code (internal/easing.js's cubic-bezier sampler, ported verbatim). The
// one genuinely new piece is the gesture-arena registration itself —
// @lynx-js/gesture-runtime is a SEPARATE package from mithril-lynx core's
// own gesture.js, but both turned out to be thin JS layers over the exact
// same native primitives (__SetGestureDetector/__SetGestureState/
// __ConsumeGesture — confirmed by reading gesture-runtime's real,
// published source: its StateManager.fail()/interceptGesture() call
// __SetGestureState/__ConsumeGesture with the identical (handle, id, ...)
// shape core's own createGesture().setState() already uses). So this is
// built directly on mithril-lynx/gesture's createGesture() with
// type: "native" — no new external dependency, no unproven capability.
// See internal/gesture-controls.js for the fail()/interceptGesture()
// wrapper that makes the callback bodies below read close to the original.
//
// Third departure, forced rather than chosen: the snap-back animation loop
// below calls internal/frames.js's requestFrame()/cancelFrame() — i.e.
// lynx.requestAnimationFrame — NOT the bare global requestAnimationFrame the
// original's MTS code uses. mithril-lynx's shim has already claimed that bare
// name for its own microtask-based mount-redraw scheduling (see
// lynx-mithril-shim.js's header); calling it here would drain the whole
// animation across a burst of microtasks instead of real device frames,
// making a "350ms" snap-back visually snap instantly. See frames.js's own
// header for the same reasoning, first written for Presence.
//
// Three more departures:
// - No `swipeActionId`/DOM-id contract (the original requires the CALLER to
//   pass a unique id per list item, or every instance collides on the same
//   default id when querying its own children). This measures its own two
//   children directly via node navigation — no id needed, no collision
//   possible, works out of the box in a list.
// - Area sizes are measured once, right after mount (a short, bounded
//   requestFrame retry — see scheduleMeasure()), instead of the original's
//   `binduiappear` (viewport-appearance) event. binduiappear isn't otherwise
//   used anywhere in this project yet, so leaning on it here first would be
//   one more unverified assumption stacked on the gesture-arena one above;
//   measuring right after mount needs nothing new and lands before any real
//   user interaction is possible either way.
// - Two nested nodes, not one. The original renders ONE element (id=
//   swipeActionId) at width = displayAreaSize + actionAreaSize, transform
//   and all, and relies on the CALLING APP to wrap it in something exactly
//   displayAreaSize wide with overflow:hidden — undocumented in the dist
//   package (the README points at example app source this project doesn't
//   have), and easy to silently get wrong: skip that wrapper and the action
//   area just sits fully visible next to the display area at rest, which is
//   exactly what this port did on the very first device run. Rather than
//   pass that footgun on to every consumer, the clipping viewport is built
//   in: an OUTER node (width = displayAreaSize, overflow: hidden, the one
//   the gesture is registered on and sized by) contains an INNER row (width
//   = totalAreaSize, the one the transform actually moves) which in turn
//   contains displayArea/actionArea. Same visual contract, nothing left for
//   a consumer to remember.

import m from "mithril";
import shim from "mithril-lynx-v1";
import { wrapElement } from "mithril-lynx-v1/element";
import { createGesture } from "mithril-lynx-v1/gesture";
import { cx } from "../internal/cx.js";
import { easeInOut } from "./easing.js";
import { cancelFrame, requestFrame } from "../internal/frames.js";
import { makeGestureControls } from "../internal/gesture-controls.js";
import { nativeBool } from "../internal/native.js";

const ANIMATION_DURATION = 350; // ms
const TRANSFORM_EPSILON = 0.03; // px
const MIN_SWIPE_VELOCITY = 0.1; // px/ms
const MAX_MEASURE_ATTEMPTS = 12;

function clampTransform(value, actionAreaSize) {
	if (Math.abs(value) < TRANSFORM_EPSILON) return 0;
	return Math.max(Math.min(0, value), -actionAreaSize);
}

function clearAnimation(s) {
	if (s.animationFrame !== -1) {
		cancelFrame(s.animationFrame);
		s.animationFrame = -1;
	}
}

function setTransform(vnode, value) {
	const s = vnode.state;
	const next = clampTransform(value, s.actionAreaSize);
	s.currentTransform = next;
	if (s.el != null) s.el.setStyleProperty("transform", `translateX(${next}px)`);
}

/** Drives one open/close animation from wherever the transform sits now. */
function runSwipeAnimation(vnode, startTransform, distanceToSwipe, consumedTime, toAction) {
	const s = vnode.state;
	const startTime = Date.now();

	const step = () => {
		const elapsed = Date.now() - startTime + consumedTime;
		const percentage = easeInOut(Math.min(elapsed / ANIMATION_DURATION, 1));

		if (toAction) setTransform(vnode, startTransform + distanceToSwipe * percentage);
		else setTransform(vnode, distanceToSwipe * (1 - percentage));

		if (elapsed / ANIMATION_DURATION < 1) {
			s.animationFrame = requestFrame(step);
			return;
		}
		setTransform(vnode, toAction ? -s.actionAreaSize : 0);
		s.animationFrame = -1;
		shim.redraw();
	};
	step();
}

/** Settles toward fully revealing the action area (mirrors lynx-ui's swipeRightToAction). */
function animateToAction(vnode, isCanceling) {
	const s = vnode.state;
	const distanceToSwipe = -s.actionAreaSize - s.currentTransform;
	const swipedPercentage = s.actionAreaSize > 0 ? Math.abs(s.currentTransform) / s.actionAreaSize : 0;
	clearAnimation(s);
	runSwipeAnimation(vnode, s.currentTransform, distanceToSwipe, isCanceling ? 0 : ANIMATION_DURATION * swipedPercentage, true);
}

/** Settles back to fully closed (mirrors lynx-ui's swipeLeftToUndo). */
function animateToClosed(vnode, isCanceling) {
	const s = vnode.state;
	const distanceToSwipe = s.currentTransform;
	const swipedPercentage = s.actionAreaSize > 0 ? 1 - Math.abs(s.currentTransform) / s.actionAreaSize : 1;
	clearAnimation(s);
	runSwipeAnimation(vnode, s.currentTransform, distanceToSwipe, isCanceling ? 0 : ANIMATION_DURATION * swipedPercentage, false);
}

function scheduleMeasure(vnode, attempt = 0) {
	const s = vnode.state;
	if (s.displayEl == null || s.actionEl == null) return;

	Promise.all([s.displayEl.invoke("boundingClientRect", { relativeTo: "" }), s.actionEl.invoke("boundingClientRect", { relativeTo: "" })]).then(
		([displayRes, actionRes]) => {
			const displayWidth = displayRes && displayRes.data && displayRes.data.width;
			const actionWidth = actionRes && actionRes.data && actionRes.data.width;
			const gotDisplay = typeof displayWidth === "number" && displayWidth > 0;
			const gotAction = typeof actionWidth === "number" && actionWidth > 0;

			if (gotDisplay) s.displayAreaSize = displayWidth;
			if (gotAction) s.actionAreaSize = actionWidth;

			if ((!gotDisplay || !gotAction) && attempt < MAX_MEASURE_ATTEMPTS) {
				requestFrame(() => scheduleMeasure(vnode, attempt + 1));
				return;
			}
			shim.redraw();
		},
	);
}

function onTouchesDown(vnode, event, controller) {
	const s = vnode.state;
	s.controls.interceptGesture(controller, true);
	s.isFirstMove = true;
	s.prevX = event.params.clientX;
	s.prevY = event.params.clientY;
	s.lastMoveTimestamp = null;
	s.velocity = 0;
	if (typeof vnode.attrs.onSwipeStart === "function") vnode.attrs.onSwipeStart();
}

function onTouchesMove(vnode, event, controller) {
	const s = vnode.state;
	if (vnode.attrs.enableSwipe === false) return;
	if (!s.isFirstMove && !s.isHorizontal) return;
	clearAnimation(s);

	const x = event.params.clientX;
	const y = event.params.clientY;
	const dx = x - s.prevX;
	const dy = y - s.prevY;

	if (s.isFirstMove) {
		s.isFirstMove = false;
		s.isHorizontal = Math.abs(dx) >= Math.abs(dy);
		if (s.isHorizontal) {
			s.controls.interceptGesture(controller, true);
		} else {
			s.controls.interceptGesture(controller, false);
			s.controls.fail(controller);
			s.prevX = x;
			s.prevY = y;
			return;
		}
	}

	s.prevX = x;
	s.prevY = y;

	if (s.lastMoveTimestamp != null) {
		const dt = event.params.timestamp - s.lastMoveTimestamp;
		s.velocity = dt !== 0 ? (x - s.lastMoveX) / dt : 0;
	}
	s.lastMoveTimestamp = event.params.timestamp;
	s.lastMoveX = x;
	s.lastDirection = dx > 0 ? "closed" : "action";

	setTransform(vnode, dx + s.currentTransform);
}

function onTouchesUp(vnode, _event, _controller) {
	const s = vnode.state;
	s.isFirstMove = true;

	if (s.isHorizontal) {
		if (Math.abs(s.velocity) > MIN_SWIPE_VELOCITY) {
			if (s.lastDirection === "action") animateToAction(vnode, false);
			else animateToClosed(vnode, false);
		} else if (s.actionAreaSize > 0 && Math.abs(s.currentTransform) > s.actionAreaSize * 0.5) {
			animateToAction(vnode, true);
		} else {
			animateToClosed(vnode, true);
		}
		if (typeof vnode.attrs.onSwipeEnd === "function") vnode.attrs.onSwipeEnd();
	}
	s.isHorizontal = false;
}

export const SwipeAction = {
	oninit(vnode) {
		const s = vnode.state;
		s.displayAreaSize = 0;
		s.actionAreaSize = vnode.attrs.estimatedActionAreaSize ?? 0;
		s.currentTransform = 0;
		s.prevX = 0;
		s.prevY = 0;
		s.lastMoveTimestamp = null;
		s.lastMoveX = 0;
		s.velocity = 0;
		s.lastDirection = "closed";
		s.isFirstMove = true;
		s.isHorizontal = false;
		s.animationFrame = -1;
	},

	oncreate(vnode) {
		const s = vnode.state;
		const row = vnode.dom.firstChild; // inner row — see the file header's "two nested nodes" note
		s.el = wrapElement(row);
		s.displayEl = wrapElement(row.firstChild);
		s.actionEl = wrapElement(row.firstChild.nextSibling);
		scheduleMeasure(vnode);

		const gesture = createGesture(vnode.dom, {
			type: "native",
			callbacks: {
				onTouchesDown: (event, controller) => onTouchesDown(vnode, event, controller),
				onTouchesMove: (event, controller) => onTouchesMove(vnode, event, controller),
				onTouchesUp: (event, controller) => onTouchesUp(vnode, event, controller),
			},
		});
		s.gesture = gesture;
		s.controls = makeGestureControls(vnode.dom._handle, gesture.id);

		const actionRef = vnode.attrs.actionRef;
		if (actionRef != null) {
			actionRef.showActionArea = (animated) => {
				if (animated) animateToAction(vnode, false);
				else {
					clearAnimation(vnode.state);
					setTransform(vnode, -vnode.state.actionAreaSize);
				}
				if (typeof vnode.attrs.onSwipeEnd === "function") vnode.attrs.onSwipeEnd();
			};
			actionRef.closeActionArea = (animated) => {
				if (animated) animateToClosed(vnode, false);
				else {
					clearAnimation(vnode.state);
					setTransform(vnode, 0);
				}
			};
		}
	},

	onremove(vnode) {
		clearAnimation(vnode.state);
		if (vnode.state.gesture != null) vnode.state.gesture.remove();
	},

	view(vnode) {
		const s = vnode.state;
		const { className, style, displayArea, actionArea, iosEnableSimultaneousTouch = true } = vnode.attrs;
		const totalAreaSize = s.displayAreaSize + s.actionAreaSize;

		return m(
			"view",
			{
				class: cx(className, { "ui-swipe-action": true, "ui-swiping": s.isHorizontal }),
				style: Object.assign({}, style, {
					width: s.displayAreaSize > 0 ? `${s.displayAreaSize}px` : undefined,
					overflow: "hidden",
				}),
				"enable-new-animator": nativeBool(false),
				"ios-enable-simultaneous-touch": nativeBool(iosEnableSimultaneousTouch),
			},
			m(
				"view",
				{
					style: {
						display: "linear",
						"linear-orientation": "horizontal",
						width: totalAreaSize > 0 ? `${totalAreaSize}px` : undefined,
						// Real visual bug, caught only by actually looking at a
						// screenshot rather than trusting "it doesn't crash": with no
						// height set here, this row was auto/content-sized — shorter
						// than the outer viewport's real height (set by the CALLER's
						// own CSS, e.g. .SwipeRow{height:56px}) — so displayArea/
						// actionArea's own `height:"100%"` below resolved against
						// THIS node's shrunk auto height, not the intended row height.
						// Every row rendered as a short, mis-centered pill floating in
						// a mostly-empty box, and the revealed action button was the
						// same height, not the full row — looked broken even though
						// nothing was throwing.
						height: "100%",
						transform: `translateX(${s.currentTransform}px)`,
					},
				},
				[
					m("view", { class: "ui-swipe-action-display", style: { height: "100%" } }, displayArea),
					m(
						"view",
						{
							class: "ui-swipe-action-action",
							style: { height: "100%" },
							ontap: () => {
								setTransform(vnode, 0);
								if (typeof vnode.attrs.onAction === "function") vnode.attrs.onAction();
							},
						},
						actionArea,
					),
				],
			),
		);
	},
};
