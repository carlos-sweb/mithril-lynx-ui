// internal/press-v2.js
//
// The mithril-lynx v2 variant of press.js. Same contract (press state plus
// the native touch/tap wiring every interactive component shares), one real
// difference: no explicit redraw call at all. v1 deliberately normalizes
// every event with `redraw: false` (a redraw on every touch event would be
// wasteful there), so press.js has to ask for one itself. v2's own
// commit.js has no such opt-out — Mithril's real `EventDict.handleEvent`
// auto-redraws after ANY event handler runs, unconditionally, which is
// exactly what makes `state.pressed = next` alone enough here.

/**
 * Reads/updates `state.pressed` and returns the attrs to spread onto the
 * interactive <view>. `disabled` and `onTap` come from the current attrs,
 * so they're passed per-render rather than captured once.
 */
export function pressAttrs(state, options) {
	const { disabled = false, onTap } = options || {};

	const setPressed = (next) => {
		state.pressed = next;
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
