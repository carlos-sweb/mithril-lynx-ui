// button.js
//
// Mithril port of @lynx-js/lynx-ui-button (Apache-2.0 — see ../NOTICE).
// Behaviourally identical, including the exact class contract: the caller's
// own className, plus `ui-active` while pressed (and not disabled) and
// `ui-disabled` when disabled. That contract is the whole reason CSS
// written for lynx-ui renders the same here.
//
// lynx-ui is headless — its packages ship no CSS at all, leaving visuals to
// the consumer's utility classes. mithril-lynx-ui ships an optional default
// look on top (css/button.css, Luna tokens only), so `class: "ui-button"`
// gets you something presentable without a Tailwind setup; omit that class
// and you get the same bare, unstyled component lynx-ui gives you.
//
// State sharing with compound children uses a scoped slot — pass a function
// as the single child and it's called with {active, disabled} — which is
// lynx-ui's own children-as-function form. React Context isn't needed for
// a parent handing state straight to its own children (see ./scope.js's
// header for when it IS needed).

import m from "mithril";
import { cx } from "./internal/cx.js";
import { isActive, pressAttrs, renderChildren } from "./internal/press.js";
import { createScope } from "./scope.js";

// The equivalent of lynx-ui's exported ButtonContext: Checkbox and Radio
// are built ON Button and need its {active, disabled} in descendants that
// aren't Button's own direct children (their Indicator parts), so the state
// is published ambiently as well as through the scoped slot.
const buttonScope = createScope();

/** Reads the enclosing Button's {active, disabled} — lynx-ui's useButtonContext(). */
export function useButtonState() {
	return buttonScope.useScope() || { active: false, disabled: false };
}

export const Button = {
	oninit(vnode) {
		vnode.state.pressed = false;
	},

	view(vnode) {
		const { className, style, disabled = false, onClick, buttonProps } = vnode.attrs;
		const active = isActive(vnode.state, disabled);
		const api = { active, disabled };

		return m(
			"view",
			Object.assign(
				{},
				buttonProps,
				pressAttrs(vnode.state, { disabled, onTap: onClick }),
				{
					class: cx(className, { "ui-active": active, "ui-disabled": disabled }),
					style,
				},
			),
			m(buttonScope.Provider, { value: api }, renderChildren(api, vnode.children)),
		);
	},
};
