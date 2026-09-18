// checkbox.js
//
// Mithril port of @lynx-js/lynx-ui-checkbox (Apache-2.0 — see ../NOTICE).
// Like the original it is built ON Button rather than reimplementing press
// handling, so it inherits that component's exact active/disabled
// behaviour, and it keeps the same class contract: `ui-checked` /
// `ui-indeterminate` on the root, plus Button's own `ui-active` /
// `ui-disabled`.
//
// The one non-obvious rule, ported as-is: tapping an *indeterminate*
// checkbox resolves to checked rather than toggling — a tri-state control
// leaves the indeterminate state by being decided, never by flipping back
// into it.

import m from "mithril-runtime";
import { Button, useButtonState } from "../button/button.js";
import { cx } from "../internal/cx.js";
import { renderChildren } from "../internal/press.js";
import { createScope } from "../scope/scope.js";

const checkboxScope = createScope();

export const Checkbox = {
	oninit(vnode) {
		vnode.state.uncontrolledChecked = vnode.attrs.defaultChecked === true;
	},

	view(vnode) {
		const {
			className,
			style,
			disabled = false,
			indeterminate = false,
			onChange,
			checkboxProps,
		} = vnode.attrs;
		const isControlled = vnode.attrs.checked !== undefined;
		const checked = isControlled ? vnode.attrs.checked === true : vnode.state.uncontrolledChecked;

		const change = (next) => {
			if (!isControlled) vnode.state.uncontrolledChecked = next;
			if (typeof onChange === "function") onChange(next);
		};

		return m(
			Button,
			{
				disabled,
				onClick: () => change(indeterminate ? true : !checked),
				style,
				className: cx(className, { "ui-checked": checked, "ui-indeterminate": indeterminate }),
				buttonProps: checkboxProps,
			},
			m(
				checkboxScope.Provider,
				{ value: { checked, indeterminate } },
				renderChildren({ checked, indeterminate }, vnode.children),
			),
		);
	},
};

/**
 * Renders its children only once there's something to indicate (checked or
 * indeterminate), unless forceMount is set — matching lynx-ui, where the
 * mark is expected to animate in rather than exist invisibly. Reads both
 * the Checkbox's state and the enclosing Button's, exactly like the
 * original reads both of its contexts.
 */
export const CheckboxIndicator = {
	view(vnode) {
		const { className, style, forceMount = false } = vnode.attrs;
		const { checked = false, indeterminate = false } = checkboxScope.useScope() || {};
		const { active, disabled } = useButtonState();

		return m(
			"view",
			{
				class: cx(className, {
					"ui-indeterminate": indeterminate,
					"ui-checked": checked,
					"ui-active": active,
					"ui-disabled": disabled,
				}),
				style,
			},
			forceMount || checked || indeterminate ? vnode.children : null,
		);
	},
};
