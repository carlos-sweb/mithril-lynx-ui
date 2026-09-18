// internal/press.js
//
// Mithril equivalent of lynx-ui's usePressTap + useTouchEmulation pair
// (lynx-ui-switch/src/use-press-tap.ts, @lynx-js/react-use): press state
// plus the native touch/tap wiring every interactive component shares, with
// the same semantics — a disabled element never becomes active and never
// fires a tap, and going disabled mid-press clears the pressed state.
//
// Two things differ from the React original, both forced by the runtime
// rather than chosen:
//   - State lives on the component's own vnode.state (Mithril's per-instance
//     object) instead of useState.
//   - mithril-lynx normalizes every event with `redraw: false` on purpose
//     (see its CONTRACT.md — a redraw on every touch event would be
//     wasteful), so a state change here has to ask for the redraw itself.
//     Encapsulated here so no component has to remember it.

import shim from "mithril-lynx";

/**
 * Reads/updates `state.pressed` and returns the attrs to spread onto the
 * interactive <view>. `disabled` and `onTap` come from the current attrs,
 * so they're passed per-render rather than captured once.
 */
export function pressAttrs(state, options) {
	const { disabled = false, onTap } = options || {};

	const setPressed = (next) => {
		if (state.pressed === next) return;
		state.pressed = next;
		shim.redraw();
	};

	return {
		ontouchstart: () => {
			if (disabled) return;
			setPressed(true);
		},
		ontouchend: () => setPressed(false),
		ontouchcancel: () => setPressed(false),
		ontap: () => {
			if (disabled) return;
			if (typeof onTap === "function") onTap();
		},
		// lynx-ui sets this on every interactive root so a tap can't fall
		// through to whatever is behind the component.
		"event-through": false,
	};
}

/** True only when actually pressed AND interactive — lynx-ui's `isEffectiveActive`. */
export function isActive(state, disabled) {
	return state.pressed === true && !disabled;
}

/**
 * lynx-ui's render(api, children): children may be a plain vnode/array, or
 * a function called with the component's current state (its scoped-slot
 * form). Mithril children arrive as an array, so a function passed as the
 * single child shows up as [fn] — both shapes are accepted here.
 */
export function renderChildren(api, children) {
	let child = children;
	if (Array.isArray(child) && child.length === 1) child = child[0];
	return typeof child === "function" ? child(api) : children;
}
