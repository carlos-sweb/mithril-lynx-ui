// switch.js
//
// Mithril port of @lynx-js/lynx-ui-switch (Apache-2.0 — see ../NOTICE),
// including its compound shape (Switch + SwitchTrack + SwitchThumb), its
// controlled/uncontrolled duality, and its exact class contract:
// `ui-active` / `ui-checked` / `ui-disabled` on the root AND on both
// sub-components.
//
// This is the first component that genuinely needs ambient state: Track and
// Thumb are descendants, not necessarily direct children, so they can't be
// handed state positionally — lynx-ui uses React Context for exactly this,
// and ./scope.js is the equivalent. (Button, by contrast, hands state
// straight to its own children and needs only a scoped slot.) Both forms
// work here: a function passed as Switch's single child is called with
// {checked, active, disabled}, same as lynx-ui's children-as-function.

import m from "mithril-runtime";
import { cx } from "../internal/cx.js";
import { isActive, pressAttrs, renderChildren } from "../internal/press-v2.js";
import { createScope } from "../scope/scope.js";

const switchScope = createScope();

function stateClasses(api) {
	return { "ui-active": api.active, "ui-checked": api.checked, "ui-disabled": api.disabled };
}

export const Switch = {
	oninit(vnode) {
		vnode.state.pressed = false;
		// Uncontrolled seed. Ignored entirely while `checked` is supplied —
		// same rule lynx-ui documents: passing `checked` makes the component
		// controlled and `defaultChecked` is not consulted.
		vnode.state.uncontrolledChecked = vnode.attrs.defaultChecked === true;
	},

	view(vnode) {
		const { className, style, disabled = false, onChange, switchProps } = vnode.attrs;
		const isControlled = vnode.attrs.checked !== undefined;
		const checked = isControlled ? vnode.attrs.checked === true : vnode.state.uncontrolledChecked;
		const active = isActive(vnode.state, disabled);
		const api = { checked, active, disabled };

		const toggle = () => {
			const next = !checked;
			if (!isControlled) vnode.state.uncontrolledChecked = next;
			if (typeof onChange === "function") onChange(next);
		};

		return m(
			"view",
			Object.assign({}, switchProps, pressAttrs(vnode.state, { disabled, onTap: toggle }), {
				class: cx(className, stateClasses(api)),
				style,
			}),
			m(switchScope.Provider, { value: api }, renderChildren(api, vnode.children)),
		);
	},
};

function subComponent(vnode) {
	const api = switchScope.useScope() || { checked: false, active: false, disabled: false };
	return m(
		"view",
		{ class: cx(vnode.attrs.className, stateClasses(api)), style: vnode.attrs.style },
		vnode.children,
	);
}

export const SwitchTrack = { view: subComponent };
export const SwitchThumb = { view: subComponent };
