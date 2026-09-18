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
// Registers a real native gesture via internal/gesture.js's
// registerGesture() — see docs/native-papi/papi-05-native-gestures.md.
// arenaPolicy {mode:"axis-lock", axis:"horizontal", referenceMoves:0}:
// claim eagerly on touch-down, decide on the very first move (using the
// down position as reference) whether the drag is actually horizontal,
// release+fail otherwise so a genuine vertical scroll passes through to an
// ancestor <scroll-view>. That axis decision now happens on the main
// thread, before this file ever sees the event — onTouchesDown/Move/Up
// below still track their OWN isFirstMove/isHorizontal locally, for the UI
// concerns that are genuinely this component's own (the `ui-swiping`
// class, whether to animate on release), not to make the arena decision
// itself anymore.
//
// Third departure, forced rather than chosen: the snap-back animation loop
// below calls internal/frames.js's requestFrame()/cancelFrame() — i.e.
// lynx.requestAnimationFrame — NOT the bare global requestAnimationFrame,
// which mithril-lynx's own mount-redraw scheduling has claimed for itself
// (lynx.setTimeout-based — see its own header). Calling the bare global
// here would drain the whole animation across a burst of microtasks
// instead of real device frames, making a "350ms" snap-back visually snap
// instantly. See frames.js's own header for the same reasoning, first
// written for Presence.
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

import m from "mithril-runtime";
import { redraw } from "mithril-lynx/mount-redraw";
import { ensureId, createRef } from "../internal/native-ref.js";
import { registerGesture } from "../internal/gesture.js";
import { cx } from "../internal/cx.js";
import { easeInOut } from "./easing.js";
import { cancelFrame, requestFrame } from "../internal/frames.js";
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
		redraw();
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
			// internal/native-ref.js's invoke() resolves with the unwrapped
			// value already — see docs/native-papi/papi-01-imperative-refs.md.
			const displayWidth = displayRes && displayRes.width;
			const actionWidth = actionRes && actionRes.width;
			const gotDisplay = typeof displayWidth === "number" && displayWidth > 0;
			const gotAction = typeof actionWidth === "number" && actionWidth > 0;

			if (gotDisplay) s.displayAreaSize = displayWidth;
			if (gotAction) s.actionAreaSize = actionWidth;

			if ((!gotDisplay || !gotAction) && attempt < MAX_MEASURE_ATTEMPTS) {
				requestFrame(() => scheduleMeasure(vnode, attempt + 1));
				return;
			}
			redraw();
		},
	);
}

function onTouchesDown(vnode, event) {
	const s = vnode.state;
	s.isFirstMove = true;
	s.prevX = event.clientX;
	s.prevY = event.clientY;
	s.lastMoveTimestamp = null;
	s.velocity = 0;
	if (typeof vnode.attrs.onSwipeStart === "function") vnode.attrs.onSwipeStart();
}

function onTouchesMove(vnode, event) {
	const s = vnode.state;
	if (vnode.attrs.enableSwipe === false) return;
	if (!s.isFirstMove && !s.isHorizontal) return;
	clearAnimation(s);

	const x = event.clientX;
	const y = event.clientY;
	const dx = x - s.prevX;
	const dy = y - s.prevY;

	if (s.isFirstMove) {
		s.isFirstMove = false;
		// The arena itself already decided this on the main thread
		// (arenaPolicy above) — tracked again here for this component's OWN
		// UI concerns (the `ui-swiping` class, whether onTouchesUp animates),
		// not to redo the claim/release call, which no longer happens from
		// app code at all.
		s.isHorizontal = Math.abs(dx) >= Math.abs(dy);
		if (!s.isHorizontal) {
			s.prevX = x;
			s.prevY = y;
			return;
		}
	}

	s.prevX = x;
	s.prevY = y;

	if (s.lastMoveTimestamp != null) {
		const dt = event.timestamp - s.lastMoveTimestamp;
		s.velocity = dt !== 0 ? (x - s.lastMoveX) / dt : 0;
	}
	s.lastMoveTimestamp = event.timestamp;
	s.lastMoveX = x;
	s.lastDirection = dx > 0 ? "closed" : "action";

	setTransform(vnode, dx + s.currentTransform);
}

function onTouchesUp(vnode) {
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
		// Native refs (internal/native-ref.js) are by id — see manuals 2/3.
		// The gesture (internal/gesture.js) needs no id of its own: it's
		// registered directly on the outer fake-dom node in oncreate below.
		s.rowRefId = ensureId(null);
		s.displayRefId = ensureId(null);
		s.actionRefId = ensureId(null);
	},

	oncreate(vnode) {
		const s = vnode.state;
		s.el = createRef(s.rowRefId);
		s.displayEl = createRef(s.displayRefId);
		s.actionEl = createRef(s.actionRefId);
		scheduleMeasure(vnode);

		// arenaPolicy {mode:"axis-lock", axis:"horizontal", referenceMoves:0}:
		// claim eagerly on touch-down, decide on the first move (using the
		// down position as reference) — see this file's own header.
		s.gesture = registerGesture(vnode.dom, "native", { mode: "axis-lock", axis: "horizontal", referenceMoves: 0 });

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
				// Forwarded from the registerGesture() call in oncreate — see
				// docs/native-papi/papi-05-native-gestures.md. e.redraw = false:
				// the drag writes its own transform imperatively (manual 2's
				// pattern), so a diff per move would be wasted.
				ongesturedown: (e) => {
					onTouchesDown(vnode, e);
					e.redraw = false;
				},
				ongesturemove: (e) => {
					onTouchesMove(vnode, e);
					e.redraw = false;
				},
				ongestureup: (e) => {
					onTouchesUp(vnode, e);
					// onTouchesUp CAN start an animation (redraw-worthy: the
					// `ui-swiping` class flips off) — let the automatic redraw
					// happen here, unlike the two high-frequency handlers above.
				},
			},
			m(
				"view",
				{
					id: s.rowRefId,
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
					m("view", { id: s.displayRefId, class: "ui-swipe-action-display", style: { height: "100%" } }, displayArea),
					m(
						"view",
						{
							id: s.actionRefId,
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
