// dialog.js
//
// Mithril compound modal built on Presence (Apache-2.0 — see ../NOTICE).
// Each animated part owns its lifecycle. Group completion, not an open
// counter, controls unmounting so interrupted entry cannot strand a modal.
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
import { cx, classOf } from "../internal/cx.js";
import { renderChildren } from "../internal/press.js";
import { nativeBool } from "../internal/native.js";
import { PresenceState, Presence, resolveAnimationStatus, usePresence } from "../presence/presence.js";
import { createScope } from "../scope/scope.js";
import { delayFrames } from "../internal/frames.js";
import { ensureId, invokeNative } from "../internal/native-ref.js";

const dialogScope = createScope();
const openDialogs = [];
const visibilityListeners = new Set();

function focusAccessible(id) {
	if (id && typeof lynx !== "undefined" && typeof lynx.createSelectorQuery === "function") {
		invokeNative(id, "requestAccessibilityFocus", {}).catch(() => {});
	}
}

function updateStack(api, visible) {
	const index = openDialogs.indexOf(api);
	if (visible && index < 0) openDialogs.push(api);
	if (!visible && index >= 0) openDialogs.splice(index, 1);
	if ((visible && index < 0) || (!visible && index >= 0)) {
		visibilityListeners.forEach((listener) => listener(openDialogs.length > 0));
	}
}

/** Consume Back for the topmost dialog, including non-dismissible dialogs. */
export function handleDialogBack() {
	const api = openDialogs[openDialogs.length - 1];
	if (!api) return false;
	if (api.closeOnBack) api.requestShow(false);
	return true;
}

/** Observe modal availability so the Android host can enable its Back callback. */
export function subscribeDialogVisibility(listener) {
	visibilityListeners.add(listener);
	listener(openDialogs.length > 0);
	return () => visibilityListeners.delete(listener);
}

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
	if (states.some((s) => s === PresenceState.Entered)) return PresenceState.Entered;
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
		s.api.requestShow = (next) => {
			if (s.api.show === next) return;
			if (typeof s.api.onShowChange === "function") s.api.onShowChange(next);
			s.api.setUncontrolledShow(next);
		};
	},
	onremove(vnode) { updateStack(vnode.state.api, false); },

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
		s.api.closeOnBack = vnode.attrs.closeOnBack !== false;
		s.api.reducedMotion = vnode.attrs.reducedMotion === true;
		s.api.initialFocusId = vnode.attrs.initialFocusId;
		s.api.restoreFocusId = vnode.attrs.restoreFocusId;

		const status = resolveAnimationStatus(s.api.groupState, false, true);
		return m(dialogScope.Provider, { value: s.api }, renderChildren(status, vnode.children));
	},
};

function dialogButtonView(vnode, changeShow) {
	const ctx = dialogScope.useScope();
	if (ctx == null) {
		throw new Error(`mithril-lynx-ui: <Dialog${changeShow ? "Trigger" : "Close"}> must be used inside a <DialogRoot>`);
	}
	const { disabled = false, style, transition } = vnode.attrs;
	const className = classOf(vnode.attrs);
	const busy = resolveBusyState(ctx.groupState);
	const status = resolveAnimationStatus(ctx.groupState, false, false);
	const presenceClassName = dialogClasses(status, className, transition);

	const handleClick = () => {
		if (changeShow) ctx.triggerId = vnode.state.id;
		ctx.requestShow(changeShow);
	};

	return m(
		Button,
		{
			buttonProps: Object.assign({ id: vnode.state.id, "accessibility-element": nativeBool(true), "accessibility-trait": "button" }, vnode.attrs.buttonProps),
			style,
			className: cx(presenceClassName, { "ui-busy": busy }),
			disabled: (changeShow && busy) || disabled,
			onClick: handleClick,
		},
		withExtraProps({ busy }, vnode.children),
	);
}

export const DialogTrigger = { oninit: (vnode) => { vnode.state.id = ensureId(vnode.attrs.buttonProps?.id); }, view: (vnode) => dialogButtonView(vnode, true) };
export const DialogClose = { oninit: (vnode) => { vnode.state.id = ensureId(vnode.attrs.buttonProps?.id); }, view: (vnode) => dialogButtonView(vnode, false) };

export const DialogBackdrop = {
	view(vnode) {
		const api = usePresence();
		if (api == null) throw new Error("mithril-lynx-ui: <DialogBackdrop> must be used inside a <DialogView>");
		const ctx = dialogScope.useScope();
		if (ctx == null) throw new Error("mithril-lynx-ui: <DialogBackdrop> must be used inside a <DialogRoot>");
		const { style, clickToClose = true, transition = true, dialogBackdropProps, onClick,
			color, variant = "dim", blurRadius = "12px", captureTarget, blurViewProps } = vnode.attrs;
		const className = classOf(vnode.attrs);
		const presenceClassName = dialogClasses(api.status, className, transition && !ctx.reducedMotion);
		if (variant === "blur" && !captureTarget) throw new Error("mithril-lynx-ui: blur backdrop requires captureTarget (a separate, non-flattened background view)");

		const handleClick = () => {
			if (!clickToClose || !ctx.show) return;
			ctx.requestShow(false);
			if (typeof onClick === "function") onClick();
		};

		return m(
			"view",
			Object.assign(
				{},
				api.animationAttrs,
				{
					class: presenceClassName,
					style: Object.assign({ width: "100%", height: "100%", position: "absolute" },
						color ? { "background-color": color } : {}, variant === "transparent" ? { "background-color": "transparent" } : {}, style),
					ontap: handleClick,
					"event-through": nativeBool(false),
					"accessibility-elements-hidden": nativeBool(true),
				},
				dialogBackdropProps,
			),
			[variant === "blur" ? m("blur-view", Object.assign({}, blurViewProps, {
				"blur-radius": blurRadius, "android-capture-target": captureTarget,
				style: { position: "absolute", width: "100%", height: "100%" },
				"event-through": nativeBool(true),
			}), m("view", {
				style: { position: "absolute", width: "100%", height: "100%", "background-color": color || "transparent" },
				ontap: handleClick, "event-through": nativeBool(false), flatten: nativeBool(false),
			})) : null, vnode.children],
		);
	},
};

export const DialogContent = {
	oninit(vnode) { vnode.state.id = ensureId(vnode.attrs.dialogContentProps?.id); },
	view(vnode) {
		const api = usePresence();
		if (api == null) throw new Error("mithril-lynx-ui: <DialogContent> must be used inside a <DialogView>");
		const ctx = dialogScope.useScope();
		const { style, transition = true, dialogContentProps, accessibilityLabel } = vnode.attrs;
		const className = classOf(vnode.attrs);
		ctx.contentId = vnode.state.id;
		const presenceClassName = dialogClasses(api.status, className, transition && !ctx.reducedMotion);

		return m(
			"view",
			Object.assign(
				{},
				api.animationAttrs,
				{
					class: presenceClassName,
					id: vnode.state.id,
					style,
					overlap: nativeBool(false),
					"event-through": nativeBool(false),
					"accessibility-element": nativeBool(false),
					"accessibility-label": accessibilityLabel,
				},
				dialogContentProps,
			),
			vnode.children,
		);
	},
};

/** Scroll only the body; keep the title and action buttons outside it. */
export const DialogBody = {
	view(vnode) {
		return m("scroll-view", Object.assign({}, vnode.attrs.scrollViewProps, {
			class: classOf(vnode.attrs), "scroll-orientation": "vertical",
			"enable-nested-scroll": nativeBool(true), "force-can-scroll": nativeBool(true),
			style: Object.assign({ width: "100%", height: vnode.attrs.height ?? "240px", "max-height": "55vh", "flex-shrink": 1 }, vnode.attrs.style),
		}), vnode.children);
	},
};

export const DialogView = {
	oninit(vnode) {
		const s = vnode.state;
		const children = Array.isArray(vnode.children) ? vnode.children : [vnode.children];
		s.stateGroup = children.map(() => PresenceState.Left);
		s.mountView = false;
		s.stateByKey = new Map();
		s.cycle = false;
		s.openNotified = false;
		s.generation = 0;
	},
	onremove(vnode) {
		const s = vnode.state;
		s.disposed = true;
		s.generation += 1;
		if (s.ctx) { s.ctx.groupState = PresenceState.Left; updateStack(s.ctx, false); }
	},

	view(vnode) {
		const s = vnode.state;
		const ctx = dialogScope.useScope();
		if (ctx == null) throw new Error("mithril-lynx-ui: <DialogView> must be used inside a <DialogRoot>");
		s.ctx = ctx;
		const { style, transition, dialogViewProps } = vnode.attrs;
		const className = classOf(vnode.attrs);
		const { show, forceMount } = ctx;

		const children = Array.isArray(vnode.children) ? vnode.children : [vnode.children];
		const keys = children.map((child, index) => child?.key ?? index);
		s.stateGroup = keys.map((key) => s.stateByKey.get(key) ?? PresenceState.Left);
		for (const key of s.stateByKey.keys()) if (!keys.includes(key)) s.stateByKey.delete(key);

		// Notify once per cycle, outside rendering. Interrupted entry still
		// completes its close cycle without waiting for an onOpen notification.
		const groupState = combineGroupStates(s.stateGroup);
		if (show) { s.mountView = true; s.cycle = true; }
		else if (groupState === PresenceState.Left) {
			s.mountView = false;
			ctx.groupState = PresenceState.Left;
			if (s.cycle) {
				s.cycle = false;
				s.openNotified = false;
				const generation = ++s.generation;
				delayFrames(1, () => {
					if (s.disposed || generation !== s.generation || ctx.show) return;
					focusAccessible(ctx.restoreFocusId || ctx.triggerId);
					if (typeof ctx.onClose === "function") ctx.onClose();
					redraw();
				});
			}
		}
		if (show && s.stateGroup.length > 0 && s.stateGroup.every((state) => state === PresenceState.Entered) && !s.openNotified) {
			s.openNotified = true;
			const generation = ++s.generation;
			delayFrames(1, () => {
				if (s.disposed || generation !== s.generation || !ctx.show) return;
				focusAccessible(ctx.initialFocusId || ctx.contentId);
				if (typeof ctx.onOpen === "function") ctx.onOpen();
				redraw();
			});
		}
		updateStack(ctx, show || groupState !== PresenceState.Left);

		const groupStatus = resolveAnimationStatus(combineGroupStates(s.stateGroup), false, true);
		const presenceClassName = dialogClasses(groupStatus, className, transition);

		if (!s.mountView && forceMount !== true) return null;

		const presenceChildren = children.map((child, index) =>
			m(
				Presence,
				{
					key: keys[index],
					show,
					forceMount,
					enterDelayFrames: 1,
					animationTimeout: ctx.reducedMotion ? 0 : (vnode.attrs.animationTimeout ?? 500),
					state: s.stateGroup[index],
					setPresenceState: (state) => {
						if (s.disposed) return;
						s.stateByKey.set(keys[index], state);
						s.stateGroup[index] = state;
						ctx.groupState = combineGroupStates(s.stateGroup);
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
					"event-through": nativeBool(!s.mountView),
					"accessibility-elements-hidden": nativeBool(!s.mountView),
					"accessibility-exclusive-focus": nativeBool(s.mountView),
					flatten: nativeBool(false),
					"native-interaction-enabled": nativeBool(s.mountView),
					style: Object.assign(
						{ position: "fixed", width: "100%", height: "100%", display: s.mountView ? "flex" : "none", "justify-content": "center", "align-items": "center", "z-index": 1000 },
						style,
					),
				},
				dialogViewProps,
			),
			presenceChildren,
		);
	},
};
