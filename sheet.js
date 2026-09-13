// sheet.js
//
// Mithril port of @lynx-js/lynx-ui-sheet (Apache-2.0 — see ./NOTICE): an
// edge-anchored overlay (bottom sheet / top sheet / left-right drawer) —
// SheetRoot/SheetTrigger/SheetClose/SheetView/SheetBackdrop/SheetContent/
// SheetHandle. Real source (2720 lines across 18 files) read in full first.
//
// Structurally this is Dialog (./dialog.js, read first as the template —
// same Presence-group/scope architecture, copied and adapted rather than
// shared, see the note further down) plus TWO real, new things: which edge
// the content slides in from, and drag-to-dismiss. Also inherits Dialog's
// own documented cut: no native `<overlay>`/`container` support, just a
// plain `position:fixed` view — same reasoning as dialog.js's header.
//
// The BIG deliberate scope cut, matching this project's established pattern
// (FeedList's useRefreshAndBounce, Draggable/Slider's MTS drag loops): the
// real source's entire snap-point/rubber-band/spring-physics engine
// (`useSnap`, `useSnapTouches`, `useDrag`, `@lynx-js/motion` MotionValue —
// 424+253+106 lines, a genuine hand-rolled physics simulation) is NOT
// ported. That system lets a sheet rest at multiple heights ('fit', a
// percentage, or a pixel value) and resize by dragging between them, with
// spring-animated settling and rubber-band over-drag resistance.
//
// What ships instead: a single resting position (however tall the caller's
// own content naturally is, exactly like `SheetContentProps.innerStyle`'s
// own documented "in horizontal mode set the drawer width here" contract —
// this project just doesn't ALSO support 'fit'/percentage/pixel SNAP
// POINTS on top of that single position), plus a real, useful,
// MUCH simpler drag-to-dismiss: dragging the content toward its closing
// edge past a fixed pixel threshold (`dismissThreshold`, default 80) closes
// it; short of that, it snaps back to rest instantly (no spring).
// `snapPoints`/`initialSnap`/`onSnapChange`/`rubberBand`/`claimedGestureAngles`/
// `screenHeight`/`screenWidth`/`handleOnly` are therefore NOT supported;
// `dismissThreshold` here is a plain pixel distance, not upstream's
// fraction-of-sheet-size. `SheetHandle` is a plain decorative grip — since
// there's no separate "handle-only" drag zone, grabbing it drags the whole
// content anyway (it's rendered as part of the same draggable surface),
// which covers the common visual case without needing cross-node drag
// coordination the drag mechanism below was never designed for.
//
// Drag-to-dismiss is built on a REAL native gesture (mithril-lynx/gesture's
// createGesture(), type "native"), NOT plain on*touch listeners — the FIRST
// attempt used ./draggable.js directly and failed on device: a bottom
// sheet's own closing drag is VERTICAL, the exact same axis the page's own
// ancestor `<scroll-view>` cares about, and Draggable's plain touch
// listeners have no gesture-arena priority to win that contest with — the
// drag was silently swallowed by the page scroll instead of moving the
// sheet at all. This is the identical problem swipe-action.js already
// solved for its own (horizontal) drag, using the SAME
// internal/gesture-controls.js fail()/interceptGesture() wrapper over the
// SAME native primitive — reused here rather than re-solved. Unlike
// SwipeAction (which must let a genuine vertical scroll pass through,
// since it lives inline in a scrollable list), a sheet's own content is a
// modal foreground surface once open, so it claims the gesture
// unconditionally on touch-down rather than waiting to see which axis the
// first move favors.
//
// Presence-group note: this is the SECOND component needing the exact
// N-child group-presence pattern (mountedCount/combineGroupStates) dialog.js
// built and documented as "extract to presence.js only if a second caller
// needs it, not speculatively". This IS that second caller — duplicated
// here rather than refactored in THIS change (re-verifying Dialog after
// extracting a shared helper is real, separate work), but worth promoting
// for real the next time a THIRD caller (Popover) needs it too.

import m from "mithril";
import shim from "mithril-lynx";
import { createGesture } from "mithril-lynx/gesture";
import { wrapElement } from "mithril-lynx/element";
import { Button } from "./button.js";
import { cx } from "./internal/cx.js";
import { makeGestureControls } from "./internal/gesture-controls.js";
import { renderChildren } from "./internal/press.js";
import { PresenceState, Presence, resolveAnimationStatus, usePresence } from "./presence.js";
import { createScope } from "./scope.js";

const sheetScope = createScope();

/** Mirrors the real source's own getSheetTransform (utils/direction.ts) — cross-checked, not guessed. */
function sheetDragTransform(resolvedSide, offset) {
	if (resolvedSide === "top") return `translate(0px, ${-offset}px)`;
	if (resolvedSide === "left") return `translate(${-offset}px, 0px)`;
	if (resolvedSide === "right") return `translate(${offset}px, 0px)`;
	return `translate(0px, ${offset}px)`; // bottom
}

/** How far a raw (dx, dy) move is toward THIS side's closing edge — negative (opening direction) clamped to 0 by the caller. */
function closingDelta(resolvedSide, dx, dy) {
	if (resolvedSide === "left") return -dx;
	if (resolvedSide === "right") return dx;
	if (resolvedSide === "top") return -dy;
	return dy; // bottom
}

function resolveSheetSide(side, enableRTL) {
	if (side === "start") return enableRTL ? "right" : "left";
	if (side === "end") return enableRTL ? "left" : "right";
	return side;
}

function sheetPositionStyle(resolvedSide) {
	if (resolvedSide === "top") return { position: "absolute", left: 0, right: 0, top: 0, width: "100%" };
	if (resolvedSide === "left") return { position: "absolute", top: 0, bottom: 0, left: 0, height: "100%" };
	if (resolvedSide === "right") return { position: "absolute", top: 0, bottom: 0, right: 0, height: "100%" };
	return { position: "absolute", left: 0, right: 0, bottom: 0, width: "100%" };
}

function resolveBusyState(state) {
	return state === PresenceState.Entering || state === PresenceState.DelayedEntering || state === PresenceState.Leaving;
}

/** Same class contract as dialog.js's dialogClasses, plus an always-present ui-sheet-side-* flag so CSS can target a specific edge's slide-in/out keyframes. */
function sheetClasses(status, className, transition, resolvedSide) {
	const sideFlag = { [`ui-sheet-side-${resolvedSide}`]: true };
	if (transition) {
		return cx(
			className,
			Object.assign(
				{
					"ui-entering": status.entering,
					"ui-leaving": status.leaving,
					"ui-animating": status.animating,
					"ui-open": status.open,
					"ui-closed": status.closed,
				},
				sideFlag,
			),
		);
	}
	return cx(className, Object.assign({ "ui-open": status.open, "ui-closed": status.closed }, sideFlag));
}

function withExtraProps(extraProps, children) {
	let child = children;
	if (Array.isArray(child) && child.length === 1) child = child[0];
	if (typeof child === "function") {
		return [(innerProps) => child(Object.assign({}, extraProps, innerProps))];
	}
	return children;
}

function combineGroupStates(states) {
	if (states.some((s) => s === PresenceState.DelayedEntering)) return PresenceState.DelayedEntering;
	if (states.some((s) => s === PresenceState.Entering)) return PresenceState.Entering;
	if (states.some((s) => s === PresenceState.Leaving)) return PresenceState.Leaving;
	if (states.length > 0 && states.every((s) => s === PresenceState.Entered)) return PresenceState.Entered;
	return PresenceState.Left;
}

export const SheetRoot = {
	oninit(vnode) {
		const s = vnode.state;
		s.uncontrolledShow = vnode.attrs.defaultShow === true;
		const isControlled = vnode.attrs.show !== undefined;
		const actualShow = isControlled ? vnode.attrs.show === true : s.uncontrolledShow;
		s.api = {
			show: actualShow,
			forceMount: vnode.attrs.forceMount === true,
			groupState: actualShow ? PresenceState.Entering : PresenceState.Left,
			setUncontrolledShow: (next) => {
				s.uncontrolledShow = next;
				shim.redraw();
			},
			onOpen: vnode.attrs.onOpen,
			onClose: vnode.attrs.onClose,
			onShowChange: vnode.attrs.onShowChange,
			resolvedSide: resolveSheetSide(vnode.attrs.side ?? "bottom", vnode.attrs.enableRTL === true),
			enableDragToClose: vnode.attrs.enableDragToClose !== false,
			dismissThreshold: vnode.attrs.dismissThreshold ?? 80,
		};
	},

	view(vnode) {
		const s = vnode.state;
		const isControlled = vnode.attrs.show !== undefined;
		const actualShow = isControlled ? vnode.attrs.show === true : s.uncontrolledShow;
		s.api.show = actualShow;
		s.api.forceMount = vnode.attrs.forceMount === true;
		s.api.onOpen = vnode.attrs.onOpen;
		s.api.onClose = vnode.attrs.onClose;
		s.api.onShowChange = vnode.attrs.onShowChange;
		s.api.resolvedSide = resolveSheetSide(vnode.attrs.side ?? "bottom", vnode.attrs.enableRTL === true);
		s.api.enableDragToClose = vnode.attrs.enableDragToClose !== false;
		s.api.dismissThreshold = vnode.attrs.dismissThreshold ?? 80;

		const status = resolveAnimationStatus(s.api.groupState, false, true);
		return m(sheetScope.Provider, { value: s.api }, renderChildren(status, vnode.children));
	},
};

function sheetButtonView(vnode, changeShow) {
	const ctx = sheetScope.useScope();
	if (ctx == null) {
		throw new Error(`mithril-lynx-ui: <Sheet${changeShow ? "Trigger" : "Close"}> must be used inside a <SheetRoot>`);
	}
	const { disabled = false, style, className, transition } = vnode.attrs;
	const busy = resolveBusyState(ctx.groupState);
	const status = resolveAnimationStatus(ctx.groupState, false, false);
	const presenceClassName = sheetClasses(status, className, transition, ctx.resolvedSide);

	const handleClick = () => {
		if (typeof ctx.onShowChange === "function") ctx.onShowChange(changeShow);
		ctx.setUncontrolledShow(changeShow);
	};

	return m(
		Button,
		{
			style,
			className: cx(presenceClassName, { "ui-busy": busy }),
			disabled: busy || disabled,
			onClick: handleClick,
		},
		withExtraProps({ busy }, vnode.children),
	);
}

export const SheetTrigger = { view: (vnode) => sheetButtonView(vnode, true) };
export const SheetClose = { view: (vnode) => sheetButtonView(vnode, false) };

export const SheetBackdrop = {
	view(vnode) {
		const api = usePresence();
		if (api == null) throw new Error("mithril-lynx-ui: <SheetBackdrop> must be used inside a <SheetView>");
		const ctx = sheetScope.useScope();
		if (ctx == null) throw new Error("mithril-lynx-ui: <SheetBackdrop> must be used inside a <SheetRoot>");
		const { className, style, clickToClose = true, transition, sheetBackdropProps, onClick } = vnode.attrs;
		const presenceClassName = sheetClasses(api.status, className, transition, ctx.resolvedSide);
		const busy = resolveBusyState(ctx.groupState);

		const handleClick = () => {
			if (!clickToClose || busy) return;
			if (typeof ctx.onShowChange === "function") ctx.onShowChange(false);
			ctx.setUncontrolledShow(false);
			if (typeof onClick === "function") onClick();
		};

		return m(
			"view",
			Object.assign(
				{},
				api.animationAttrs,
				{
					class: presenceClassName,
					style: Object.assign({ width: "100%", height: "100%", position: "absolute" }, style),
					ontap: handleClick,
					"event-through": false,
				},
				sheetBackdropProps,
			),
			vnode.children,
		);
	},
};

export const SheetHandle = {
	view(vnode) {
		const { className, style } = vnode.attrs;
		return m("view", { class: cx(className, { "ui-sheet-handle": true }), style }, vnode.children);
	},
};

export const SheetContent = {
	oninit(vnode) {
		const s = vnode.state;
		s.dragOffset = 0;
		s.startX = 0;
		s.startY = 0;
	},

	// vnode.dom is the OUTER (presence-animated, CSS-slide) node — see
	// view() below; the gesture is registered on its inner child instead, so
	// the drag's own imperative transform writes never fight the CSS
	// keyframe animating the SAME property on the outer node (the two-node
	// split this file uses throughout, same reasoning as swipe-action.js's
	// own "two nested nodes, not one" note).
	//
	// `s.ctx` is read here, not via sheetScope.useScope() again — a second
	// useScope() call from oncreate would read a POPPED scope stack (slider.js
	// hit this same timing gap first; see its own header). view() below
	// stashes the live context on vnode.state every render specifically so
	// oncreate/the gesture callbacks (which run long after that particular
	// view() call returns) always see the CURRENT ctx, not a stale one
	// captured once at mount.
	oncreate(vnode) {
		const s = vnode.state;
		const inner = vnode.dom.firstChild;
		s.innerEl = wrapElement(inner);

		if (!s.ctx.enableDragToClose) return;

		const gesture = createGesture(inner, {
			type: "native",
			callbacks: {
				onTouchesDown: (event, controller) => {
					s.startX = event.params.clientX;
					s.startY = event.params.clientY;
					s.controls.interceptGesture(controller, true);
				},
				onTouchesMove: (event) => {
					const dx = event.params.clientX - s.startX;
					const dy = event.params.clientY - s.startY;
					s.dragOffset = Math.max(0, closingDelta(s.ctx.resolvedSide, dx, dy));
					s.innerEl.setStyleProperty("transform", sheetDragTransform(s.ctx.resolvedSide, s.dragOffset));
				},
				onTouchesUp: () => {
					if (s.dragOffset >= s.ctx.dismissThreshold) {
						if (typeof s.ctx.onShowChange === "function") s.ctx.onShowChange(false);
						s.ctx.setUncontrolledShow(false);
					}
					// Reset unconditionally, closing or not: a close is about to hand
					// off to the CSS leave-out animation on the OUTER node, which must
					// start from the natural resting transform, not wherever the drag
					// left it; snapping back is exactly what "didn't pass the
					// threshold" means anyway.
					s.dragOffset = 0;
					s.innerEl.setStyleProperty("transform", sheetDragTransform(s.ctx.resolvedSide, 0));
				},
			},
		});
		s.gesture = gesture;
		s.controls = makeGestureControls(inner._handle, gesture.id);
	},

	onremove(vnode) {
		if (vnode.state.gesture != null) vnode.state.gesture.remove();
	},

	view(vnode) {
		const s = vnode.state;
		const api = usePresence();
		if (api == null) throw new Error("mithril-lynx-ui: <SheetContent> must be used inside a <SheetView>");
		const ctx = sheetScope.useScope();
		if (ctx == null) throw new Error("mithril-lynx-ui: <SheetContent> must be used inside a <SheetRoot>");
		s.ctx = ctx;
		const { className, style, transition, innerClassName, innerStyle, sheetContentProps } = vnode.attrs;
		const presenceClassName = sheetClasses(api.status, className, transition, ctx.resolvedSide);
		const positionStyle = sheetPositionStyle(ctx.resolvedSide);

		const innerContent = m("view", { class: innerClassName, style: innerStyle }, vnode.children);

		return m(
			"view",
			Object.assign(
				{},
				api.animationAttrs,
				{
					class: presenceClassName,
					style: Object.assign(positionStyle, style),
					"event-through": false,
				},
				sheetContentProps,
			),
			innerContent,
		);
	},
};

export const SheetView = {
	oninit(vnode) {
		const s = vnode.state;
		const children = Array.isArray(vnode.children) ? vnode.children : [vnode.children];
		s.stateGroup = children.map(() => PresenceState.Left);
		s.mountView = false;
		s.mountedCount = 0;
	},

	// Same mountedCount-gated group as dialog.js's DialogView — see that
	// file's own header for why gating on stateGroup.every(Left) directly
	// would drop the group's onClose on the common case where the two
	// children don't finish leaving on the exact same render.
	view(vnode) {
		const s = vnode.state;
		const ctx = sheetScope.useScope();
		if (ctx == null) throw new Error("mithril-lynx-ui: <SheetView> must be used inside a <SheetRoot>");
		const { className, style, sheetViewProps } = vnode.attrs;
		const { show, forceMount } = ctx;

		const children = Array.isArray(vnode.children) ? vnode.children : [vnode.children];

		if (show) s.mountView = true;
		else if (s.mountedCount === 0) s.mountView = false;

		if (!s.mountView && forceMount !== true) return null;

		const presenceChildren = children.map((child, index) =>
			m(
				Presence,
				{
					key: index,
					show,
					forceMount,
					state: s.stateGroup[index],
					setPresenceState: (state) => {
						s.stateGroup[index] = state;
						ctx.groupState = combineGroupStates(s.stateGroup);
					},
					onOpen: () => {
						s.mountedCount += 1;
						if (s.mountedCount === children.length && typeof ctx.onOpen === "function") ctx.onOpen();
						shim.redraw();
					},
					onClose: () => {
						s.mountedCount -= 1;
						if (s.mountedCount === 0 && typeof ctx.onClose === "function") ctx.onClose();
						shim.redraw();
					},
				},
				child,
			),
		);

		return m(
			"view",
			Object.assign(
				{},
				{
					class: className,
					style: Object.assign({ position: "fixed", width: "100%", height: "100%", overflow: "hidden" }, style),
				},
				sheetViewProps,
			),
			presenceChildren,
		);
	},
};
