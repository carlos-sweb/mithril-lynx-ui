// dialog.js
//
// Mithril port of @lynx-js/lynx-ui-dialog (Apache-2.0 — see ./NOTICE): a
// modal overlay built entirely on Presence — DialogRoot/DialogTrigger/
// DialogClose/DialogView/DialogBackdrop/DialogContent, matching the real
// source's split exactly (read in full before writing anything here).
//
// One deliberate scope cut, documented rather than silently dropped: the
// original's DialogView accepts a `container` prop that swaps its plain
// `<view>` for a native `<overlay mode={...}>`, for showing a dialog OUTSIDE
// the current LynxView entirely (a separate native surface). That mode needs
// `convertOverlayMode()` from lynx-ui-common (undocumented native `mode`
// encoding) and is irrelevant to every app this project targets so far — a
// plain `<view style="position:fixed">` already renders "above" normal
// document flow with zero portal machinery, which is exactly what a
// same-surface modal needs. Left unimplemented; `container`/`overlayLevel`
// are accepted but ignored. Add real `<overlay>` support here (or in a
// shared helper) if a future component genuinely needs a second surface.
//
// The one piece with no existing equivalent to reuse: the original's
// usePresenceGroup (wraps N children — Backdrop + Content — each in their
// OWN Presence, tracks their states in an array, and derives one combined
// "groupState" via a fixed precedence: any DelayedEntering > any Entering >
// any Leaving > all Entered > all Left) is a REACT HOOK, called from
// DialogView's own render body. There's no Mithril hooks equivalent, so it's
// inlined directly into DialogView below (own vnode.state, own Presence
// children) rather than extracted into presence.js — the only current
// caller is Dialog; if Sheet/Popover turn out to need the identical N-child
// group pattern later, promote it then, not speculatively now.
//
// Presence's own `state`/`setPresenceState` controlled-mode contract (see
// presence.js) does all the real work here: it already calls the redraw
// scheduler from inside setState regardless of whether setPresenceState was
// supplied, so DialogView's own per-child callback below needs no redraw
// call of its own — just update the array and derive the combined state.

import m from "mithril-runtime";
import { redraw } from "mithril-lynx/mount-redraw";
import { Button } from "../button/button.js";
import { cx } from "../internal/cx.js";
import { renderChildren } from "../internal/press-v2.js";
import { nativeBool } from "../internal/native.js";
import { PresenceState, Presence, resolveAnimationStatus, usePresence } from "../presence/presence-v2.js";
import { createScope } from "../scope/scope.js";

const dialogScope = createScope();

function resolveBusyState(state) {
	return state === PresenceState.Entering || state === PresenceState.DelayedEntering || state === PresenceState.Leaving;
}

/** lynx-ui's presenceClassVariants: `transition` gates whether entering/leaving/animating are included at all, not just open/closed. */
function dialogClasses(status, className, transition) {
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

/**
 * lynx-ui's renderContentWithExtraProps: pre-binds extraProps into a NEW
 * function so Button's own scoped-slot can still merge its OWN {active,
 * disabled} on top — a function child ends up called with
 * {busy, active, disabled}, not just {busy}. Different from press.js's
 * renderChildren, which calls a function child immediately instead of
 * wrapping it for a later caller to invoke.
 */
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

export const DialogRoot = {
	oninit(vnode) {
		const s = vnode.state;
		s.uncontrolledShow = vnode.attrs.defaultShow === true;
		const isControlled = vnode.attrs.show !== undefined;
		const actualShow = isControlled ? vnode.attrs.show === true : s.uncontrolledShow;
		s.api = {
			show: actualShow,
			forceMount: vnode.attrs.forceMount === true,
			// Mutated in place by DialogView's per-child Presence callbacks below —
			// dialogScope.Provider hands out this SAME object every render, so a
			// write here is visible to Trigger/Close the next time either reads
			// useScope(), no extra plumbing needed.
			groupState: actualShow ? PresenceState.Entering : PresenceState.Left,
			setUncontrolledShow: (next) => {
				s.uncontrolledShow = next;
				redraw();
			},
			onOpen: vnode.attrs.onOpen,
			onClose: vnode.attrs.onClose,
			onShowChange: vnode.attrs.onShowChange,
			debugLog: vnode.attrs.debugLog,
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
		s.api.debugLog = vnode.attrs.debugLog;

		const status = resolveAnimationStatus(s.api.groupState, false, true);
		return m(dialogScope.Provider, { value: s.api }, renderChildren(status, vnode.children));
	},
};

function dialogButtonView(vnode, changeShow) {
	const ctx = dialogScope.useScope();
	if (ctx == null) {
		throw new Error(`mithril-lynx-ui: <Dialog${changeShow ? "Trigger" : "Close"}> must be used inside a <DialogRoot>`);
	}
	const { disabled = false, style, className, transition } = vnode.attrs;
	const busy = resolveBusyState(ctx.groupState);
	const status = resolveAnimationStatus(ctx.groupState, false, false);
	const presenceClassName = dialogClasses(status, className, transition);

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

export const DialogTrigger = { view: (vnode) => dialogButtonView(vnode, true) };
export const DialogClose = { view: (vnode) => dialogButtonView(vnode, false) };

export const DialogBackdrop = {
	view(vnode) {
		const api = usePresence();
		if (api == null) throw new Error("mithril-lynx-ui: <DialogBackdrop> must be used inside a <DialogView>");
		const ctx = dialogScope.useScope();
		if (ctx == null) throw new Error("mithril-lynx-ui: <DialogBackdrop> must be used inside a <DialogRoot>");
		const { className, style, clickToClose = true, transition, dialogBackdropProps, onClick } = vnode.attrs;
		const presenceClassName = dialogClasses(api.status, className, transition);
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
				dialogBackdropProps,
			),
			vnode.children,
		);
	},
};

export const DialogContent = {
	view(vnode) {
		const api = usePresence();
		if (api == null) throw new Error("mithril-lynx-ui: <DialogContent> must be used inside a <DialogView>");
		const { className, style, transition, dialogContentProps } = vnode.attrs;
		const presenceClassName = dialogClasses(api.status, className, transition);

		return m(
			"view",
			Object.assign(
				{},
				api.animationAttrs,
				{
					class: presenceClassName,
					style,
					overlap: nativeBool(false),
					"event-through": false,
				},
				dialogContentProps,
			),
			vnode.children,
		);
	},
};

export const DialogView = {
	oninit(vnode) {
		const s = vnode.state;
		const children = Array.isArray(vnode.children) ? vnode.children : [vnode.children];
		s.stateGroup = children.map(() => PresenceState.Left);
		s.mountView = false;
		s.mountedCount = 0;
	},

	view(vnode) {
		const s = vnode.state;
		const ctx = dialogScope.useScope();
		if (ctx == null) throw new Error("mithril-lynx-ui: <DialogView> must be used inside a <DialogRoot>");
		const { className, style, transition, dialogViewProps } = vnode.attrs;
		const { show, forceMount } = ctx;

		const children = Array.isArray(vnode.children) ? vnode.children : [vnode.children];

		// Gated on mountedCount, NOT on stateGroup directly: mountedCount only
		// reaches 0 once EVERY child's own onClose has already fired, which
		// presence.js always defers one frame past the render that first
		// commits that child's Left state (see makeController's defer()).
		// Gating on stateGroup.every(Left) instead unmounts (returns null) on
		// the very SAME render where the LAST child's state first becomes
		// Left — before that child's own Presence ever gets an update cycle
		// to notice it and fire its own onLeft()/onClose, silently dropping
		// the group's onClose whenever the two children don't finish leaving
		// on the exact same render (the common case, not an edge case).
		if (show) s.mountView = true;
		else if (s.mountedCount === 0) s.mountView = false;

		const groupStatus = resolveAnimationStatus(combineGroupStates(s.stateGroup), false, true);
		const presenceClassName = dialogClasses(groupStatus, className, transition);

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
					// Unlike setPresenceState above, presence.js's own onEntered/onLeft
					// never call redraw() after invoking onOpen/onClose (only
					// setState's callers do, for the state transition itself) — so
					// without a redraw here, mountedCount reaching 0 would update
					// silently and DialogView would never get another view() call to
					// notice it and actually return null. Always safe to call: like
					// setPresenceState, this only ever runs from presence.js's own
					// defer() (a delayFrames(1, ...) callback), never mid-render.
					onOpen: () => {
						s.mountedCount += 1;
						if (s.mountedCount === children.length && typeof ctx.onOpen === "function") ctx.onOpen();
						redraw();
					},
					onClose: () => {
						s.mountedCount -= 1;
						if (s.mountedCount === 0 && typeof ctx.onClose === "function") ctx.onClose();
						redraw();
					},
				},
				child,
			),
		);

		// Lynx's default layout is linear, not web flow — a plain
		// `position:fixed` view does NOT center a child the way it might on
		// the web. DialogContent is centered by making THIS wrapper a flex
		// container (justify-content/align-items: center); DialogBackdrop
		// stays `position:absolute` (already outside flex flow) so it still
		// covers the full screen underneath.
		return m(
			"view",
			Object.assign(
				{},
				{
					class: presenceClassName,
					style: Object.assign(
						{ position: "fixed", width: "100%", height: "100%", display: "flex", "justify-content": "center", "align-items": "center" },
						style,
					),
				},
				dialogViewProps,
			),
			presenceChildren,
		);
	},
};
