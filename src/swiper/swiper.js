// swiper.js
//
// Mithril port of @lynx-js/lynx-ui-swiper (Apache-2.0 — see ./NOTICE): a
// horizontal, swipeable carousel. Real source (3401 lines across 27 files —
// LARGER than Popover's own 1930, despite this project's difficulty list
// originally sizing Swiper as the "easy last one" from an early npm-pack
// line count; re-read in full anyway, per this project's own established
// habit of not trusting an estimate that predates a full-source read) read
// in full first: `Swiper/index.tsx` (432 lines) composes TEN separate
// hooks — velocity-based fling physics (two competing implementations,
// `useVelocity`/`useVelocity_experiment`), a hand-rolled seamless LOOP
// (duplicating `loopDuplicateCount` items past each boundary so a swipe
// past the last item visually continues into a copy of the first), a full
// bounce-decoration system for edge overscroll, axis-lock gesture
// disambiguation, autoplay driven by Main Thread Scripting, and a
// 'normal' | 'custom' dual layout mode (custom mode absolutely positions
// every item itself via a caller-supplied animation function, for
// non-linear carousel effects).
//
// THE scope cut, matching FeedList's/Sheet's own hand-rolled-physics
// precedent (not Popover's "real geometry work, no shortcut" precedent —
// this genuinely IS the "custom physics reimplementing something a
// simpler mechanism already covers" class of thing): the ENTIRE
// velocity/fling/bounce/loop system. What ships instead — a real,
// complete, useful carousel, not a stub:
//   - A single "normal" flex-row layout (no 'custom' absolute-positioning
//     mode — a caller wanting bespoke per-item animation curves is
//     exactly the case this project keeps deferring, same reasoning as
//     Dialog's un-ported native-`<overlay>` `container` mode).
//   - Swiping decides its target purely from DISTANCE dragged, not
//     velocity: past `swipeThreshold` (a fraction of itemWidth, default
//     0.2) of the item's own width advances/retreats one item; short of
//     it snaps back. A real, common, honest carousel interaction — just
//     not the "a fast short flick also advances" refinement velocity
//     tracking buys upstream.
//   - No loop: dragging past the first/last item hard-clamps instead of
//     wrapping. `loop`/`loopDuplicateCount` are not supported.
//   - No bounce decorations, no autoplay-via-MTS (a plain `setInterval`
//     timer instead — this project's own already-established finding
//     that MTS's real value in upstream is crossing a thread hop that
//     doesn't exist in mithril-lynx's own render model applies here too;
//     see input.js's own header for the fullest version of that
//     argument), no RTL.
//   - `items`/`renderItem(item, index)` instead of upstream's own
//     `data`/`children(props)` render-prop — matching THIS project's own
//     already-established list.js/feed-list.js naming convention instead
//     of copying a React-specific children-as-function shape wholesale.
//     No separate exported `SwiperItem` component either, for the same
//     reason list.js has no separate "ListItem" — sizing/spacing for each
//     item is this file's own internal concern, not something a caller
//     assembles by hand.
//
// The swipe gesture itself is NOT built on plain on*touch listeners —
// same reasoning, and the exact same primitive, as swipe-action.js's own
// horizontal drag: a real native gesture (internal/gesture.js's
// registerGesture(), see docs/native-papi/papi-05-native-gestures.md) with
// arenaPolicy {mode:"axis-lock", axis:"horizontal", referenceMoves:1} —
// unlike swipe-action.js's referenceMoves:0, the axis decision here needs
// the FIRST move as its reference point and decides on the SECOND, since
// the first move alone has no delta yet (matches this file's own original
// onTouchesMove shape, preserved below purely for this component's own UI
// state now, not the arena decision) — so a genuine vertical scroll inside
// an ancestor <scroll-view> still passes through instead of being
// swallowed. Settling to the target index uses a
// plain CSS transition (`transform Nms ease-out`), not a custom easing
// loop — sheet.js's own drag-to-dismiss already established that a snap
// doesn't need bespoke animation code when the platform's own transition
// support does the job; this is the one case in the project so far where
// that snap should visibly ANIMATE (an instant jump between carousel
// pages would look broken), and a CSS transition is genuinely simpler
// than porting swipe-action.js's own hand-rolled requestFrame easing loop
// for it.
//
// Device debugging note: an extended on-device session initially found
// ZERO gesture callbacks firing for ANY horizontal drag test, despite the
// exact same createGesture()/interceptGesture() pattern working moments
// earlier for both sheet.js's drag-to-dismiss and swipe-action.js's own
// row reveal on the SAME build/device. Ruled out along the way: which node
// gets createGesture() (root vs. the track child — swipe-action registers
// on its own root, sheet.js on an inner child; both work, neither placement
// mattered here), swipe-action's "enable-new-animator"/"ios-enable-
// simultaneous-touch" attrs (copied over regardless, but adding them didn't
// fix it), and a suspected gesture-arena conflict with the page's own
// ancestor <scroll-view> (a plain, unrelated drag on slider.js's thumb
// failed the exact same way, and Draggable/SwipeAction/Sortable — all
// already mounted on the same scrollable page — worked fine, so the arena
// itself wasn't the culprit). The actual cause: the test's own touch
// coordinates started outside the card's real right edge (the container's
// rendered width is narrower than the screen, but the test picked an x
// past it) — a touch that starts outside an element never reaches that
// element's gesture detector at all, regardless of where it moves
// afterward. Once the down-coordinate was moved inside the card's actual
// bounds, the very first attempt worked. No code change resulted from any
// of the ruled-out theories; recorded here so a future "gesture callbacks
// never fire" investigation on this project checks real on-screen element
// bounds FIRST, before re-litigating the gesture-arena mechanism itself.

import m from "mithril-runtime";
import { redraw } from "mithril-lynx/mount-redraw";
import { ensureId, createRef } from "../internal/native-ref.js";
import { registerGesture } from "../internal/gesture.js";
import { cx } from "../internal/cx.js";
import { nativeBool } from "../internal/native.js";

function clamp(value, min, max) {
	return Math.min(Math.max(value, min), max);
}

function stepOf(attrs) {
	return attrs.itemWidth + (attrs.spaceBetween ?? 0);
}

function baseOffsetFor(index, step) {
	return -(index * step);
}

function setTransform(s, value, animate) {
	s.currentTransform = value;
	if (s.trackEl == null) return;
	s.trackEl.setStyleProperties({
		transform: `translateX(${value}px)`,
		transition: animate ? `transform ${s.attrs.duration ?? 300}ms ease-out` : "none",
	});
}

function stopAutoPlay(s) {
	if (s.autoPlayTimer != null) {
		clearInterval(s.autoPlayTimer);
		s.autoPlayTimer = null;
	}
}

function startAutoPlay(s) {
	stopAutoPlay(s);
	if (!s.attrs.autoPlay) return;
	s.autoPlayTimer = setInterval(() => {
		const count = (s.attrs.items || []).length;
		if (count < 2) return;
		settleTo(s, s.currentIndex + 1 >= count ? 0 : s.currentIndex + 1);
	}, s.attrs.autoPlayInterval ?? 3000);
}

/** Moves to `targetIndex`, animating the settle, reporting onChange only on a real change, and restarting autoplay's own timer so a manual interaction doesn't fight it. */
function settleTo(s, targetIndex) {
	const count = (s.attrs.items || []).length;
	const clamped = clamp(targetIndex, 0, Math.max(0, count - 1));
	const changed = clamped !== s.currentIndex;
	s.currentIndex = clamped;
	setTransform(s, baseOffsetFor(clamped, stepOf(s.attrs)), true);
	if (changed && typeof s.attrs.onChange === "function") s.attrs.onChange(clamped);
	startAutoPlay(s);
	redraw();
}

function onTouchesDown(s) {
	s.isFirstMove = true;
	s.axisDecided = false;
	stopAutoPlay(s);
}

function onTouchesMove(s, event) {
	const x = event.clientX;
	const y = event.clientY;

	if (s.isFirstMove) {
		s.isFirstMove = false;
		s.startX = x;
		s.startY = y;
		return; // axis decision needs a real delta, from the next callback on — matching this file's own original onTouchesMove shape
	}
	const dx = x - s.startX;
	const dy = y - s.startY;

	if (!s.axisDecided) {
		if (dx === 0 && dy === 0) return;
		s.axisDecided = true;
		// The arena itself already decided this on the main thread
		// (arenaPolicy above) — tracked again here purely for this
		// component's own UI concerns (the ui-swiping class, onSwipeStart),
		// not to make the claim/release call, which no longer happens from
		// app code at all.
		s.isHorizontal = Math.abs(dx) >= Math.abs(dy);
		if (s.isHorizontal) {
			s.dragging = true;
			if (typeof s.attrs.onSwipeStart === "function") s.attrs.onSwipeStart();
		} else {
			return;
		}
	}
	if (!s.isHorizontal) return;

	const step = stepOf(s.attrs);
	const count = (s.attrs.items || []).length;
	const min = baseOffsetFor(Math.max(0, count - 1), step);
	setTransform(s, clamp(baseOffsetFor(s.currentIndex, step) + dx, min, 0), false);
}

function onTouchesUp(s) {
	s.isFirstMove = true;
	s.axisDecided = false;
	if (!s.isHorizontal) return;
	s.isHorizontal = false;
	s.dragging = false;

	const step = stepOf(s.attrs);
	const delta = s.currentTransform - baseOffsetFor(s.currentIndex, step);
	const threshold = step * (s.attrs.swipeThreshold ?? 0.2);
	const count = (s.attrs.items || []).length;

	let target = s.currentIndex;
	if (delta <= -threshold && s.currentIndex < count - 1) target = s.currentIndex + 1;
	else if (delta >= threshold && s.currentIndex > 0) target = s.currentIndex - 1;

	settleTo(s, target);
	if (typeof s.attrs.onSwipeEnd === "function") s.attrs.onSwipeEnd();
}

export const Swiper = {
	oninit(vnode) {
		const s = vnode.state;
		s.attrs = vnode.attrs;
		const count = (vnode.attrs.items || []).length;
		s.currentIndex = clamp(vnode.attrs.initialIndex ?? 0, 0, Math.max(0, count - 1));
		s.currentTransform = baseOffsetFor(s.currentIndex, stepOf(vnode.attrs));
		s.dragging = false;
		s.isFirstMove = true;
		s.axisDecided = false;
		s.isHorizontal = false;
		s.startX = 0;
		s.startY = 0;
		s.trackRefId = ensureId(null); // native ref (internal/native-ref.js) is by id — see manual 2
	},

	oncreate(vnode) {
		const s = vnode.state;
		s.trackEl = createRef(s.trackRefId);
		setTransform(s, s.currentTransform, false);

		// arenaPolicy {mode:"axis-lock", axis:"horizontal", referenceMoves:1}:
		// claim eagerly on touch-down, decide on the SECOND move (using the
		// first move as reference) — see this file's own header.
		s.gesture = registerGesture(vnode.dom, "native", { mode: "axis-lock", axis: "horizontal", referenceMoves: 1 });

		const swiperRef = vnode.attrs.swiperRef;
		if (swiperRef != null) {
			swiperRef.swipeNext = () => settleTo(s, s.currentIndex + 1);
			swiperRef.swipePrev = () => settleTo(s, s.currentIndex - 1);
			swiperRef.swipeTo = (index) => settleTo(s, index);
		}

		startAutoPlay(s);
	},

	onupdate(vnode) {
		vnode.state.attrs = vnode.attrs;
	},

	onremove(vnode) {
		const s = vnode.state;
		stopAutoPlay(s);
		if (s.gesture != null) s.gesture.remove();
	},

	view(vnode) {
		const s = vnode.state;
		const {
			items = [],
			renderItem,
			itemKey,
			itemWidth,
			itemHeight,
			containerWidth = itemWidth,
			spaceBetween = 0,
			className,
			style,
			trackClassName,
			trackStyle,
		} = vnode.attrs;

		const trackChildren = items.map((item, index) =>
			m(
				"view",
				{
					key: itemKey ? itemKey(item, index) : index,
					class: "ui-swiper-item",
					style: {
						width: `${itemWidth}px`,
						height: `${itemHeight}px`,
						"margin-right": `${spaceBetween}px`,
						"flex-shrink": 0,
					},
				},
				renderItem(item, index),
			),
		);

		return m(
			"view",
			{
				class: cx(className, { "ui-swiper": true, "ui-swiping": s.dragging }),
				style: Object.assign({ width: `${containerWidth}px`, height: `${itemHeight}px`, overflow: "hidden" }, style),
				// Same two attrs swipe-action.js's own gesture root carries — copied
				// for consistency, not because a device bug pinned the failure to
				// either one specifically (see this file's own device-debugging
				// note below: the real bug turned out to be unrelated to both).
				"enable-new-animator": nativeBool(false),
				"ios-enable-simultaneous-touch": nativeBool(true),
				// Forwarded from the registerGesture() call in oncreate — see
				// docs/native-papi/papi-05-native-gestures.md. e.redraw = false
				// on the high-frequency handlers: the drag writes its own
				// transform imperatively (manual 2's pattern).
				ongesturedown: (e) => {
					onTouchesDown(s);
					e.redraw = false;
				},
				ongesturemove: (e) => {
					onTouchesMove(s, e);
					e.redraw = false;
				},
				ongestureup: () => onTouchesUp(s), // settleTo() below already calls redraw() itself
			},
			m(
				"view",
				{
					id: s.trackRefId,
					class: cx(trackClassName, { "ui-swiper-track": true }),
					style: Object.assign(
						{
							display: "flex",
							"flex-direction": "row",
							transform: `translateX(${s.currentTransform}px)`,
						},
						trackStyle,
					),
				},
				trackChildren,
			),
		);
	},
};
