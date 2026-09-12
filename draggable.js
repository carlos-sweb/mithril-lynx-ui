// draggable.js
//
// Mithril port of @lynx-js/lynx-ui-draggable (Apache-2.0 — see ./NOTICE).
//
// `draggableRef` (added for sortable.js, Phase 5): a plain object filled in
// oncreate with `setTransform(x, y)`/`getTranslate()` — the same imperative-
// ref convention as inputRef/sliderRef/actionRef elsewhere in this repo.
// sortable.js needs to move a sibling item's transform from OUTSIDE that
// item's own drag gesture (the "swap target" while another item is being
// dragged over it), which nothing on Draggable's own view() exposes
// otherwise.
//
// This is where the project's central bet pays off most clearly. lynx-ui's
// version carries twelve `'main thread'` directives: the entire drag loop —
// reading the touch point, computing the delta, clamping it, writing the
// transform — is pushed onto the main thread through Main Thread Scripting,
// because a drag that pays a thread hop per frame doesn't feel like a drag.
// A mithril-lynx app in main-thread-owned mode is already there, so all of
// that is just ordinary code here. Not a workaround for missing MTS: the
// reason MTS exists in the original doesn't apply.
//
// The transform is written straight to the node rather than through a
// redraw, for the same reason lynx-ui writes it from the main thread: a diff
// per touchmove would be wasted work.
//
// It is ALSO rendered into the style attrs, and that isn't redundant: any
// redraw during a drag (an app mirroring onDragging into state does exactly
// this) re-applies `style` from the attrs, and Mithril's style diff removes
// properties no longer present — silently wiping the imperative transform
// mid-gesture. Caught on device: the state said 97px while the element had
// snapped back. So the rendered style carries the same value the imperative
// write does, and a redraw becomes a no-op for it instead of a reset.

import m from "mithril";
import { wrapElement } from "mithril-lynx/element";
import { cx } from "./internal/cx.js";

const MIN_INT = Number.MIN_SAFE_INTEGER;
const MAX_INT = Number.MAX_SAFE_INTEGER;

function includesDirection(direction, allowed) {
	if (Array.isArray(allowed)) return allowed.includes(direction);
	return allowed === direction || allowed === "all";
}

/** Ported as-is from lynx-ui: explicit min/max win, otherwise allowedDirection decides. */
function boundsFor(attrs) {
	const allowed = attrs.allowedDirection ?? "all";
	const none = allowed === "none";

	const minX = attrs.minTranslateX ?? (includesDirection("left", allowed) ? MIN_INT : 0);
	const maxX = attrs.maxTranslateX ?? (includesDirection("right", allowed) ? MAX_INT : 0);
	const minY = attrs.minTranslateY ?? (includesDirection("up", allowed) ? MIN_INT : 0);
	const maxY = attrs.maxTranslateY ?? (includesDirection("down", allowed) ? MAX_INT : 0);

	return {
		minX: none ? 0 : minX,
		maxX: none ? 0 : maxX,
		minY: none ? 0 : minY,
		maxY: none ? 0 : maxY,
	};
}

function pagePoint(event) {
	if (event && event.touches && event.touches.length > 0) {
		return { x: event.touches[0].pageX, y: event.touches[0].pageY };
	}
	// A touchend carries no active touches; changedTouches holds the last one.
	if (event && event.changedTouches && event.changedTouches.length > 0) {
		return { x: event.changedTouches[0].pageX, y: event.changedTouches[0].pageY };
	}
	return null;
}

function clamp(value, min, max) {
	return Math.min(Math.max(value, min), max);
}

function writeTransform(s, x, y) {
	s.translate = { x, y };
	if (s.el != null) s.el.setStyleProperty("transform", `translate(${x}px, ${y}px)`);
}

export const Draggable = {
	oninit(vnode) {
		const s = vnode.state;
		s.translate = { x: 0, y: 0 };
		s.translateAtStart = { x: 0, y: 0 };
		s.startPoint = null;
		s.dragging = false;
	},

	oncreate(vnode) {
		const s = vnode.state;
		s.el = wrapElement(vnode.dom);

		const draggableRef = vnode.attrs.draggableRef;
		if (draggableRef != null) {
			draggableRef.setTransform = (x, y) => writeTransform(s, x, y);
			draggableRef.getTranslate = () => s.translate;
		}
	},

	view(vnode) {
		const s = vnode.state;
		const { className, style, enableDragging = true, resetOnEnd = false, trigger = "longpress" } = vnode.attrs;

		const setTransform = (x, y) => writeTransform(s, x, y);

		const onStart = (e) => {
			const point = pagePoint(e);
			if (point == null) return;
			s.startPoint = point;
			s.translateAtStart = s.translate;
			s.dragging = true;
			if (typeof vnode.attrs.onDragStart === "function") vnode.attrs.onDragStart(point);
		};

		const onMove = (e) => {
			if (!s.dragging || s.startPoint == null) return;
			const point = pagePoint(e);
			if (point == null) return;

			const bounds = boundsFor(vnode.attrs);
			const dx = clamp(point.x - s.startPoint.x, bounds.minX, bounds.maxX);
			const dy = clamp(point.y - s.startPoint.y, bounds.minY, bounds.maxY);
			setTransform(s.translateAtStart.x + dx, s.translateAtStart.y + dy);

			if (typeof vnode.attrs.onDragging === "function") vnode.attrs.onDragging(s.translate);
		};

		const onEnd = () => {
			if (!s.dragging) return;
			s.dragging = false;
			s.startPoint = null;
			if (resetOnEnd) setTransform(0, 0);
			if (typeof vnode.attrs.onDragEnd === "function") vnode.attrs.onDragEnd(s.translate);
		};

		const handlers = enableDragging
			? Object.assign(
					trigger === "longpress" ? { onlongpress: onStart } : { ontouchstart: onStart },
					{ ontouchmove: onMove, ontouchend: onEnd, ontouchcancel: onEnd },
				)
			: {};

		return m(
			"view",
			Object.assign({}, vnode.attrs.draggableProps, handlers, {
				class: cx(className, { "ui-dragging": s.dragging }),
				style: Object.assign({}, style, {
					transform: `translate(${s.translate.x}px, ${s.translate.y}px)`,
				}),
			}),
			vnode.children,
		);
	},
};
