// popover.js
//
// Mithril port of @lynx-js/lynx-ui-popover (Apache-2.0 — see ./NOTICE): a
// small floating panel anchored to a trigger — PopoverRoot/PopoverTrigger/
// PopoverAnchor/PopoverBackdrop/PopoverPositioner/PopoverContent/
// PopoverArrow. Real source (1930 lines across 18 files) read in full
// first, including the actual Floating-UI-style geometry engine under
// `floating/` (offset/shift/size/arrow middleware, computePosition,
// detectOverflow — ~700 lines).
//
// THE scope cut, and it's the biggest single one in this project: that
// whole middleware pipeline — which lets a popover auto-flip to the
// opposite side, shift sideways to stay inside the viewport, and shrink to
// whatever space is actually available — is NOT ported. Unlike FeedList's
// or Sheet's own cuts (hand-rolled ANIMATION/DRAG physics substituting for
// something native or a simpler primitive already covers), this is real,
// legitimate geometry work with no shortcut equivalent — cutting it is a
// genuine capability reduction, not a "this was overbuilt" call. What ships
// instead: a `placement` (`"top"|"bottom"|"left"|"right"` optionally
// suffixed `"-start"|"-end"`, matching upstream's own naming) computed once
// via the same well-known placement formula every Floating-UI-family
// library uses, no auto-adjustment if the result would overflow the
// viewport — the caller picks a placement that fits their own layout.
// `autoAdjust`/`rubberBand`-adjacent props are therefore not supported.
//
// The measurement mechanism upstream needs is ALSO not ported as designed,
// for a DIFFERENT reason — it's real, working code (`platform.tsx`'s own
// `getElementRects`/`getDimensions` combine `bindlayoutchange`-reported
// rects), but its whole `computeCoordsFromPlacement` deliberately computes
// coordinates RELATIVE TO THE REFERENCE ELEMENT rather than the viewport,
// with an explicit comment explaining why: "Lynx doesn't support
// `position: static` and makes all views positioned relatively by default"
// — so a floating element's `position: absolute` always resolves against
// its own immediate parent, never skips up to a chosen ancestor the way
// wc3 CSS does, and upstream works around that by rendering the floating
// content so it inherits the trigger's own local position. Reproducing
// that reliably would need confirming this project's own Lynx build
// behaves identically, on-device, before trusting it for something this
// central. Sidestepped entirely instead by using `position: fixed` with
// VIEWPORT-relative coordinates — already the exact mechanism `dialog.js`/
// `sheet.js` use successfully (confirmed correct on device at every scroll
// position, not just scrolled-to-top) — combined with the SAME
// `boundingClientRect` invoke() call `slider.js`/`swipe-action.js` already
// use and have already device-verified for real on-screen coordinates
// (`{data:{left, top, width, height}}`, viewport-relative by construction).
// No new measurement primitive, no untested Lynx behavior assumption.
//
// Architecturally simpler than Dialog/Sheet in one respect: upstream's own
// Popover uses exactly ONE shared Presence (around PopoverPositioner), not
// Dialog's own N-child presence GROUP — PopoverBackdrop/Trigger/Anchor/Arrow
// all just read that ONE state from context to derive their own classes,
// no mountedCount/combineGroupStates machinery needed here at all.
//
// One deliberate, documented improvement over upstream rather than a
// faithful copy: the real PopoverBackdrop always stays mounted (invisible-
// while-closed is left entirely to the consumer's own CSS, since lynx-ui
// ships none) — an always-present full-screen tap target with nothing
// stopping it from swallowing taps while genuinely closed unless a
// consumer's CSS happens to add `pointer-events:none`/`display:none` for
// `.ui-closed` themselves. This port just doesn't mount it at all while
// closed (same "if nothing to show, don't render it" contract `presence.js`
// itself already provides for Dialog/Sheet), so there's no invisible-but-
// clickable footgun to accidentally leave unhandled.
//
// Three real, device-only bugs found getting this to actually show anything:
//   1. The real one, and the one that mattered: PopoverPositioner destructured
//      `children` off vnode.ATTRS instead of reading vnode.children — the
//      exact same trap this project already documented in form.js and hit
//      again in input-otp.js. PopoverContent silently received no children
//      at all; nothing ever crashed, `onOpen` fired normally, there was just
//      never any real content inside the positioner to see. Everything
//      below was chasing a SYMPTOM of this, not a separate bug — worth
//      remembering as the first thing to check the next time a component's
//      floating/portaled content "opens" but shows nothing.
//   2. A real, separate finding, uncovered while chasing #1: a Lynx
//      `position: fixed` (or `absolute`) node with no explicit width/height
//      measures as ZERO-sized via `boundingClientRect`, unlike the web,
//      where such a box would shrink-wrap its content. Fixed by measuring
//      the REAL content node (PopoverContent's own, expected as the first
//      child) instead of the positioning wrapper itself — same "measure the
//      inner content, not the outer clipping/positioning wrapper" split
//      swipe-action.js's own oncreate already uses for its inner row.
//   3. `maybeRecompute`'s own retry loop (below) originally re-checked "is
//      state still exactly DelayedEntering" on every attempt, matching the
//      condition that first triggered it — but presence.js's watchdog can
//      advance state to Entered WHILE a retry chain is still in flight, and
//      re-checking that exact condition made every further retry bail out
//      immediately, silently, forever. Now only gates the FIRST attempt.
import m from "mithril";
import shim from "mithril-lynx-v1";
import { wrapElement } from "mithril-lynx-v1/element";
import { Button } from "../button/button.js";
import { cx } from "../internal/cx.js";
import { requestFrame } from "../internal/frames.js";
import { PresenceState, Presence, resolveAnimationStatus, usePresence } from "../presence/presence.js";
import { createScope } from "../scope/scope.js";

const popoverScope = createScope();
const popoverPlacementScope = createScope();

function resolveBusyState(state) {
	return state === PresenceState.Entering || state === PresenceState.DelayedEntering || state === PresenceState.Leaving;
}

/** Same trick dialog.js/sheet.js use to add {busy} on top of Button's own {active, disabled} scoped-slot. */
function withExtraProps(extraProps, children) {
	let child = children;
	if (Array.isArray(child) && child.length === 1) child = child[0];
	if (typeof child === "function") {
		return [(innerProps) => child(Object.assign({}, extraProps, innerProps))];
	}
	return children;
}

/** Same class contract as dialog.js's dialogClasses — enableDelay is always true here, matching upstream's own uniform presenceClassVariants({enableDelay:true,...}) calls throughout. */
function popoverClasses(status, className, transition) {
	if (transition) {
		return cx(className, {
			"ui-entering": status.entering,
			"ui-leaving": status.leaving,
			"ui-animating": status.animating,
			"ui-open": status.open,
			"ui-closed": status.closed,
		});
	}
	return cx(className, { "ui-open": status.open, "ui-closed": status.closed });
}

function statusOf(state) {
	return resolveAnimationStatus(state, true, false);
}

function getSide(placement) {
	return (placement || "bottom").split("-")[0];
}

function getAlign(placement) {
	return (placement || "bottom").split("-")[1];
}

function measureRect(el) {
	return el.invoke("boundingClientRect", { relativeTo: "" }).then((res) => (res && res.data) || {});
}

/**
 * The same placement formula every Floating-UI-family library uses (this
 * project's own port of computeCoordsFromPlacement), but working directly
 * in VIEWPORT coordinates — see this file's own header for why that
 * sidesteps upstream's reference-relative trick entirely rather than
 * reproducing it.
 */
function computePlacement(placement, reference, floating, offsetPx) {
	const side = getSide(placement);
	const align = getAlign(placement);
	let x;
	let y;

	if (side === "top") y = reference.top - floating.height - offsetPx;
	else if (side === "bottom") y = reference.top + reference.height + offsetPx;
	else if (side === "left") x = reference.left - floating.width - offsetPx;
	else x = reference.left + reference.width + offsetPx; // right

	if (side === "top" || side === "bottom") {
		if (align === "start") x = reference.left;
		else if (align === "end") x = reference.left + reference.width - floating.width;
		else x = reference.left + reference.width / 2 - floating.width / 2;
	} else {
		if (align === "start") y = reference.top;
		else if (align === "end") y = reference.top + reference.height - floating.height;
		else y = reference.top + reference.height / 2 - floating.height / 2;
	}

	return { x, y };
}

export const PopoverRoot = {
	oninit(vnode) {
		const s = vnode.state;
		s.uncontrolledShow = vnode.attrs.defaultShow === true;
		const isControlled = vnode.attrs.show !== undefined;
		const actualShow = isControlled ? vnode.attrs.show === true : s.uncontrolledShow;
		s.presenceState = actualShow ? PresenceState.Entering : PresenceState.Left;
		s.api = {
			show: actualShow,
			forceMount: vnode.attrs.forceMount === true,
			setUncontrolledShow: (next) => {
				s.uncontrolledShow = next;
				shim.redraw();
			},
			onOpen: vnode.attrs.onOpen,
			onClose: vnode.attrs.onClose,
			onShowChange: vnode.attrs.onShowChange,
			state: s.presenceState,
			setPresenceState: (next) => {
				s.presenceState = next;
				s.api.state = next;
			},
			// Filled in by PopoverTrigger/PopoverAnchor's own oncreate/onupdate.
			triggerEl: null,
			anchorEl: null,
			hasAnchor: false,
			// Filled in by PopoverPositioner's internal overlay once measured.
			floatingCoords: null,
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
		s.api.state = s.presenceState;

		return m(popoverScope.Provider, { value: s.api }, vnode.children);
	},
};

export const PopoverTrigger = {
	view(vnode) {
		const ctx = popoverScope.useScope();
		if (ctx == null) throw new Error("mithril-lynx-ui: <PopoverTrigger> must be used inside a <PopoverRoot>");
		vnode.state.ctx = ctx;
		const { style, className, disabled = false, transition, onClick } = vnode.attrs;
		const busy = resolveBusyState(ctx.state);
		const presenceClassName = popoverClasses(statusOf(ctx.state), className, transition);

		return m(
			Button,
			{
				style,
				className: cx(presenceClassName, { "ui-busy": busy }),
				disabled: busy || disabled,
				onClick: () => {
					const next = !ctx.show;
					if (typeof ctx.onShowChange === "function") ctx.onShowChange(next);
					ctx.setUncontrolledShow(next);
					if (typeof onClick === "function") onClick();
				},
			},
			withExtraProps({ busy }, vnode.children),
		);
	},

	// vnode.state.ctx is stashed from view() above — reading popoverScope's
	// own useScope() again here would read a POPPED scope stack (the same
	// timing gap slider.js already found and documented; see its own
	// header).
	oncreate(vnode) {
		vnode.state.ctx.triggerEl = wrapElement(vnode.dom);
	},
	onupdate(vnode) {
		vnode.state.ctx.triggerEl = wrapElement(vnode.dom);
	},
};

/** Optional alternative reference point — see PopoverRootProps' own real docs: "If this is used, the Popover uses it rather than PopoverTrigger as the real anchor." */
export const PopoverAnchor = {
	view(vnode) {
		const ctx = popoverScope.useScope();
		if (ctx == null) throw new Error("mithril-lynx-ui: <PopoverAnchor> must be used inside a <PopoverRoot>");
		vnode.state.ctx = ctx;
		ctx.hasAnchor = true;
		const { style, className } = vnode.attrs;
		return m("view", { class: className, style }, vnode.children);
	},

	oncreate(vnode) {
		vnode.state.ctx.anchorEl = wrapElement(vnode.dom);
	},
	onupdate(vnode) {
		vnode.state.ctx.anchorEl = wrapElement(vnode.dom);
	},
};

export const PopoverBackdrop = {
	view(vnode) {
		const ctx = popoverScope.useScope();
		if (ctx == null) throw new Error("mithril-lynx-ui: <PopoverBackdrop> must be used inside a <PopoverRoot>");
		// See this file's own header: deliberately NOT always-mounted, unlike
		// upstream — same "nothing to show, don't render it" contract Dialog/
		// Sheet already use, so a closed popover's backdrop can never sit
		// there invisibly swallowing taps.
		const mounted = ctx.state !== PresenceState.Left || ctx.forceMount === true;
		if (!mounted) return null;

		const { className, style, transition, onClick, popoverBackdropProps } = vnode.attrs;
		const presenceClassName = popoverClasses(statusOf(ctx.state), className, transition);
		const busy = resolveBusyState(ctx.state);

		const handleClick = () => {
			if (busy) return;
			if (typeof ctx.onShowChange === "function") ctx.onShowChange(false);
			ctx.setUncontrolledShow(false);
			if (typeof onClick === "function") onClick();
		};

		return m(
			"view",
			Object.assign(
				{},
				{
					class: presenceClassName,
					style: Object.assign({ width: "100%", height: "100%", position: "fixed" }, style),
					ontap: handleClick,
					"event-through": false,
				},
				popoverBackdropProps,
			),
		);
	},
};

/** Internal implementation detail (not exported) — the actual position:fixed, measured-and-placed overlay wrapper. Mirrors upstream's own non-exported PopoverOverlay. */
const PopoverOverlayInternal = {
	oninit(vnode) {
		const s = vnode.state;
		s.lastPresenceState = null;
	},

	// See PopoverTrigger's own note: ctx is stashed from view(), never
	// re-fetched here.
	//
	// s.el is (re-)captured in BOTH oncreate and onupdate, same redundant-
	// safety convention PopoverTrigger/PopoverAnchor already use: on device,
	// vnode.dom.firstChild (the REAL content node — see the comment on why
	// THIS is what gets measured, not vnode.dom itself) came back null the
	// very first time oncreate ran, throwing there and silently skipping
	// the rest of oncreate's own body (including the state-tracking write
	// that stops onupdate from redoing the same work) — a genuine, narrow
	// Lynx/Mithril child-attachment-timing gap this project hasn't hit
	// before, not something worth chasing further given onupdate's own
	// very next call already has a real node to grab.
	oncreate(vnode) {
		const s = vnode.state;
		if (vnode.dom.firstChild != null) s.el = wrapElement(vnode.dom.firstChild);
		s.lastPresenceState = s.ctx.state;
		maybeRecompute(vnode);
	},

	onupdate(vnode) {
		const s = vnode.state;
		if (vnode.dom.firstChild != null) s.el = wrapElement(vnode.dom.firstChild);
		if (s.lastPresenceState !== s.ctx.state) {
			s.lastPresenceState = s.ctx.state;
			maybeRecompute(vnode);
		}
	},

	view(vnode) {
		const s = vnode.state;
		const api = usePresence();
		if (api == null) throw new Error("mithril-lynx-ui: <PopoverPositioner> must be used inside a <PopoverRoot>");
		const ctx = popoverScope.useScope();
		s.ctx = ctx;
		const { style, className, transition, popoverPositionerProps } = vnode.attrs;
		const presenceClassName = popoverClasses(api.status, className, transition);
		const coords = ctx.floatingCoords;

		return m(
			"view",
			Object.assign(
				{},
				api.animationAttrs,
				{
					class: presenceClassName,
					style: Object.assign(
						{
							position: "fixed",
							left: coords ? `${coords.x}px` : "0px",
							top: coords ? `${coords.y}px` : "0px",
							// Hidden until the first real measurement lands (otherwise
							// this would flash at (0,0) for one frame every time it
							// opens) — `opacity`, NOT `visibility`. Confirmed on device:
							// a `visibility: hidden` node measured via boundingClientRect
							// comes back all zeros (width/height/top/left), unlike
							// standard CSS where a hidden-but-still-laid-out element keeps
							// its real box — so hiding this way made the very
							// measurement this needs impossible, a real chicken-and-egg
							// bug the first version of this file had. `opacity` doesn't
							// affect layout/measurement at all, so it doesn't have that
							// problem.
							opacity: coords ? 1 : 0,
						},
						style,
					),
					"event-through": false,
				},
				popoverPositionerProps,
			),
			vnode.children,
		);
	},
};

const MAX_MEASURE_ATTEMPTS = 12;

/**
 * Retries a few frames if either rect comes back zero-sized — NOT an
 * opacity/visibility problem (already ruled out on device: the floating
 * node measured all-zero even hidden via `opacity`, which doesn't affect
 * layout). The real cause is timing: DelayedEntering's own onupdate hook
 * fires synchronously with the just-created node's OWN first commit, one or
 * more frames before native has actually finished laying it out — the exact
 * same race swipe-action.js's own scheduleMeasure() already found and
 * solved for its two children, reused here rather than re-diagnosed.
 */
function maybeRecompute(vnode, attempt = 0) {
	const s = vnode.state;
	const ctx = s.ctx;
	// Same "DelayedEntering" hook upstream's own handleDelayedEntering uses —
	// presence.js schedules it 8 extra frames past the mount so the floating
	// content has genuinely finished its OWN first layout pass before this
	// measures it (see presence.js's own header on why that delay exists) —
	// still not always enough on its own, hence the retry above. Only gates
	// the FIRST attempt, though — a retry keeps going as long as the popover
	// is still open, even once state has since moved on to Entered (a
	// slightly-late position is harmless; giving up because the state moved
	// on while retrying is not — that's a real trap this file's own first
	// draft fell into, since onupdate's OWN re-trigger for the Entered
	// transition would ALSO have bailed here immediately, and no attempt
	// would ever complete).
	if (attempt === 0 && ctx.state !== PresenceState.DelayedEntering) return;
	if (!ctx.show) return;
	const referenceEl = ctx.hasAnchor && ctx.anchorEl ? ctx.anchorEl : ctx.triggerEl;
	if (referenceEl == null || s.el == null) return;

	const { placement = "bottom", placementOffset = 0 } = vnode.attrs;
	Promise.all([measureRect(referenceEl), measureRect(s.el)]).then(([reference, floating]) => {
		const gotReference = typeof reference.width === "number" && reference.width > 0;
		const gotFloating = typeof floating.width === "number" && floating.width > 0;
		if (!gotReference || !gotFloating) {
			if (attempt < MAX_MEASURE_ATTEMPTS) requestFrame(() => maybeRecompute(vnode, attempt + 1));
			return;
		}
		ctx.floatingCoords = computePlacement(placement, reference, floating, placementOffset);
		shim.redraw();
	});
}

export const PopoverPositioner = {
	view(vnode) {
		const ctx = popoverScope.useScope();
		if (ctx == null) throw new Error("mithril-lynx-ui: <PopoverPositioner> must be used inside a <PopoverRoot>");
		// vnode.CHILDREN, not vnode.attrs.children — the exact same trap this
		// project has already hit (and documented) in form.js and
		// input-otp.js, hit again here: a positional m(Component, attrs,
		// child1, child2) call's children land on vnode.children, a SEPARATE
		// Mithril vnode property, never on the attrs object. Confirmed on
		// device as the actual root cause behind BOTH earlier findings in
		// this file (nothing ever visible, and the floating content always
		// measuring zero) — PopoverOverlayInternal was rendering with
		// vnode.attrs.children === undefined the whole time, i.e. no real
		// content at all, not a sizing/positioning bug.
		const { placement = "bottom", placementOffset = 0, style, className, transition, popoverPositionerProps } = vnode.attrs;
		const children = vnode.children;

		return m(
			Presence,
			{
				show: ctx.show,
				forceMount: ctx.forceMount,
				state: ctx.state,
				setPresenceState: ctx.setPresenceState,
				enableDelay: true,
				onOpen: ctx.onOpen,
				onClose: ctx.onClose,
			},
			m(
				popoverPlacementScope.Provider,
				{ value: { side: getSide(placement) } },
				m(PopoverOverlayInternal, { placement, placementOffset, style, className, transition, popoverPositionerProps }, children),
			),
		);
	},
};

export const PopoverContent = {
	view(vnode) {
		const api = usePresence();
		if (api == null) throw new Error("mithril-lynx-ui: <PopoverContent> must be used inside a <PopoverPositioner>");
		const { className, style, transition, popoverContentProps } = vnode.attrs;
		const presenceClassName = popoverClasses(api.status, className, transition);

		return m(
			"view",
			Object.assign({}, api.animationAttrs, { class: presenceClassName, style, "event-through": false }, popoverContentProps),
			vnode.children,
		);
	},
};

const OPPOSITE_SIDE = { top: "bottom", bottom: "top", left: "right", right: "left" };
// bottom needs no rotation — the base triangle already points down.
const ARROW_ROTATE = { top: "rotate(180deg)", bottom: "", left: "rotate(90deg)", right: "rotate(270deg)" };

/**
 * A CSS-only triangle, always centered on the floating content's cross
 * axis — no per-open recomputation needed, unlike upstream's own arrow
 * middleware, since there's no shift adjustment left to compensate for
 * once autoAdjust is cut (see this file's own header).
 */
export const PopoverArrow = {
	view(vnode) {
		const ctx = popoverScope.useScope();
		if (ctx == null) throw new Error("mithril-lynx-ui: <PopoverArrow> must be used inside a <PopoverRoot>");
		const placementCtx = popoverPlacementScope.useScope();
		const side = placementCtx ? placementCtx.side : "bottom";
		const { size = 8, color = "black", className, style, transition } = vnode.attrs;
		const presenceClassName = popoverClasses(statusOf(ctx.state), className, transition);
		const crossAxisProp = side === "top" || side === "bottom" ? "left" : "top";

		return m("view", {
			class: presenceClassName,
			style: Object.assign(
				{
					position: "absolute",
					width: "0px",
					height: "0px",
					[OPPOSITE_SIDE[side]]: `-${size}px`,
					[crossAxisProp]: `calc(50% - ${size / 2}px)`,
					transform: ARROW_ROTATE[side],
					"border-left": `${size / 2}px solid transparent`,
					"border-right": `${size / 2}px solid transparent`,
					"border-bottom": `${size}px solid ${color}`,
				},
				style,
			),
		});
	},
};
