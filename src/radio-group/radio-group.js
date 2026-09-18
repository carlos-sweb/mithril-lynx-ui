// radio-group.js
//
// Mithril port of @lynx-js/lynx-ui-radio-group (Apache-2.0 — see ../NOTICE).
// RadioGroup renders no element of its own — it is pure coordination, and
// its children are laid out by whatever container the app already has.
// Each Radio is a Button underneath, so press/disabled behaviour is shared
// rather than re-implemented, and the class contract matches lynx-ui's:
// `ui-checked` on the selected Radio, `ui-disabled` when the Radio or the
// whole group is disabled.
//
// A Radio's effective disabled state is its own OR the group's — disabling
// the group disables every Radio in it, which is why the group's value has
// to reach Radios ambiently (they're rarely direct children; usually each
// sits inside the app's own row/label markup).

import m from "mithril-runtime";
import { Button } from "../button/button.js";
import { cx } from "../internal/cx.js";
import { renderChildren } from "../internal/press.js";
import { createScope } from "../scope/scope.js";

const groupScope = createScope();
const radioScope = createScope();

export const RadioGroup = {
	oninit(vnode) {
		vnode.state.uncontrolledValue = vnode.attrs.defaultValue ?? null;
	},

	view(vnode) {
		const { disabled = false, onValueChange } = vnode.attrs;
		const isControlled = vnode.attrs.value !== undefined;
		const value = isControlled ? vnode.attrs.value : vnode.state.uncontrolledValue;

		const select = (next) => {
			if (next === value) return;
			if (!isControlled) vnode.state.uncontrolledValue = next;
			if (typeof onValueChange === "function") onValueChange(next);
		};

		return m(
			groupScope.Provider,
			{ value: { value, disabled, select } },
			renderChildren({ value, disabled }, vnode.children),
		);
	},
};

export const Radio = {
	view(vnode) {
		const group = groupScope.useScope();
		if (group == null) {
			throw new Error("mithril-lynx-ui: <Radio> must be used inside a <RadioGroup>");
		}

		const { className, style, value, radioProps } = vnode.attrs;
		const disabled = vnode.attrs.disabled === true || group.disabled === true;
		const checked = value === group.value;

		return m(
			Button,
			{
				disabled,
				onClick: () => group.select(value),
				style,
				className: cx(className, { "ui-checked": checked }),
				buttonProps: radioProps,
			},
			m(
				radioScope.Provider,
				{ value: { checked, disabled } },
				renderChildren({ checked, disabled }, vnode.children),
			),
		);
	},
};

/** The dot/mark inside a Radio. Mirrors CheckboxIndicator's forceMount rule. */
export const RadioIndicator = {
	view(vnode) {
		const { className, style, forceMount = false } = vnode.attrs;
		const { checked = false, disabled = false } = radioScope.useScope() || {};

		return m(
			"view",
			{ class: cx(className, { "ui-checked": checked, "ui-disabled": disabled }), style },
			forceMount || checked ? vnode.children : null,
		);
	},
};
