// input-otp.js
//
// Mithril port of @lynx-js/lynx-ui-input-otp (Apache-2.0 — see ./NOTICE): a
// single hidden native input driving N visible "slot" views, each showing
// one character. Real source read in full before writing this.
//
// One deliberate divergence from the original, and it's a simplification
// rather than a gap: upstream drives its own raw `<input>` xelement
// directly, reimplementing the native focus/blur/setValue ref plumbing and
// boolean-attribute stringification that this project's OWN ./input.js
// already got right (and device-verified) for the general Input component.
// So the hidden field here IS an ./input.js Input, its box shrunk to 1x1px
// and made transparent. Attrs upstream sets that Input.js doesn't expose
// directly (`ignore-focus`, `ios-auto-correct`, `ios-spell-check`,
// `android-fullscreen-mode`) go through Input's own `inputProps` escape
// hatch instead.
//
// The hidden Input is rendered UNCONTROLLED (`defaultValue`, not `value`) —
// found the hard way, on a real device, that rendering it controlled and
// leaning on Input.js's own onupdate to echo a changed value back via
// setValue creates a feedback loop specific to THIS component's native
// attrs: combining `type="number"` with `input-filter` makes the native
// input re-fire its OWN `input` event, synchronously, as a side effect of
// that programmatic setValue call — landing while the redraw that triggered
// it is still on the call stack and throwing "Node is currently being
// rendered to and thus is locked." (The plain Input demo elsewhere in this
// project never hits this: it's controlled too, but sets neither
// `type="number"` nor `input-filter`.) InputOTP's own onupdate below pushes
// to native only for a genuine EXTERNAL change instead — see its own
// comment for the full mechanism.
//
// Second deliberate cut, documented rather than silently dropped: upstream
// reads @lynx-js/lynx-ui-input's `KeyboardAwareTriggerContext` and calls its
// (optional, no-op-by-default) `onInputFocused`/`onInputBlurred` hooks on
// focus/blur, for a KeyboardAware ROOT component elsewhere in an app to
// track which trigger is focused and scroll it above the keyboard. This
// project hasn't built a KeyboardAware root at all yet — nothing currently
// provides that context, and upstream's own context default is a pair of
// undefined callbacks called through `?.()`, i.e. a guaranteed no-op absent
// a provider. Add real wiring here if/when a KeyboardAware root ships.

import m from "mithril";
import shim from "mithril-lynx-v1";
import { cx } from "../internal/cx.js";
import { delayFrames } from "../internal/frames.js";
import { nativeBool } from "../internal/native.js";
import { Input } from "../input/input.js";
import { createScope } from "../scope/scope.js";

const otpScope = createScope();

const INPUT_PATTERNS = {
	alphabetic: /[^a-z]/gi,
	numeric: /\D/g,
	alphanumeric: /[^a-z0-9]/gi,
};

const NATIVE_INPUT_FILTERS = {
	alphabetic: "[A-Za-z]",
	numeric: "[0-9]",
	alphanumeric: "[A-Za-z0-9]",
};

const HIDDEN_INPUT_STYLE = {
	position: "absolute",
	top: "0px",
	left: "0px",
	width: "1px",
	height: "1px",
	padding: "0px",
	"border-width": "0px",
	opacity: 0,
	color: "transparent",
	"caret-color": "transparent",
	"background-color": "transparent",
};

function normalizeLength(length) {
	return Number.isInteger(length) && length > 0 ? length : 6;
}

function normalizeValue(value, length, inputType) {
	const pattern = INPUT_PATTERNS[inputType] || INPUT_PATTERNS.numeric;
	return String(value ?? "").replace(pattern, "").slice(0, length);
}

function reportInputError(error) {
	console.warn(`[mithril-lynx-ui][InputOTP] native input command failed: ${String(error)}`);
}

/** Reads the enclosing InputOTP's {value, length, inputType, focused, complete, disabled, invalid}. */
export function useInputOTPContext() {
	const context = otpScope.useScope();
	if (context == null) throw new Error("mithril-lynx-ui: <InputOTPSlot> must be used inside an <InputOTP>");
	return context;
}

export const InputOTP = {
	oninit(vnode) {
		const s = vnode.state;
		const fieldLength = normalizeLength(vnode.attrs.length ?? 6);
		const initial = normalizeValue(
			vnode.attrs.value ?? vnode.attrs.defaultValue ?? "",
			fieldLength,
			vnode.attrs.inputType ?? "numeric",
		);
		s.uncontrolledValue = initial;
		// What the native input was last EXPLICITLY told to show, from
		// outside a native typing event — see onupdate below for why this
		// exists at all instead of just rendering the underlying Input
		// controlled.
		s.lastPushedValue = initial;
		s.focused = false;
		s.inputRef = {};
		// The underlying Input's own ref object — plain and persistent across
		// renders, same convention as every other inputRef in this project.
		// Input.js's oncreate Object.assign()s the real focus/blur/setValue/
		// getValue methods onto it once, at mount.
		s.nativeRef = {};

		// Takes fieldLength as a parameter rather than closing over it — the
		// `length` prop can change across renders, and view() always has the
		// current normalized value on hand when it calls this.
		s.emit = (next, prev, attrs, currentFieldLength) => {
			if (next === prev) return;
			if (typeof attrs.onChange === "function") attrs.onChange(next);
			if (next.length === currentFieldLength && prev.length !== currentFieldLength && typeof attrs.onComplete === "function") {
				attrs.onComplete(next);
			}
		};
	},

	oncreate(vnode) {
		const { autoFocus = false, disabled = false } = vnode.attrs;
		if (!autoFocus || disabled) return;
		// A component's own oncreate runs BEFORE its children's (see scope.js's
		// header for the same trap) — the underlying Input's oncreate, which is
		// what actually populates s.nativeRef with real methods, hasn't run
		// yet at this point. One frame is enough for it to have committed.
		delayFrames(1, () => {
			Promise.resolve(vnode.state.inputRef.focus()).catch(reportInputError);
		});
	},

	// The underlying Input is deliberately UNCONTROLLED (see view() and this
	// file's own header for why) — this hook is what pushes an EXTERNAL
	// controlled-value change to the native field instead.
	onupdate(vnode) {
		const s = vnode.state;
		const { value } = vnode.attrs;
		if (value === undefined) return; // uncontrolled InputOTP — nothing to push
		const fieldLength = normalizeLength(vnode.attrs.length ?? 6);
		const next = normalizeValue(value, fieldLength, vnode.attrs.inputType ?? "numeric");
		if (next === s.lastPushedValue) return;
		s.lastPushedValue = next;
		Promise.resolve(s.nativeRef.setValue(next)).catch(reportInputError);
	},

	view(vnode) {
		const s = vnode.state;
		const {
			length,
			inputType = "numeric",
			value,
			disabled = false,
			invalid = false,
			className,
			style,
			onFocus,
			onBlur,
			inputProps,
		} = vnode.attrs;
		// autoFocus itself is only read in oncreate, not here.
		// Positional children (m(InputOTP, attrs, slot1, slot2, ...)) land on
		// vnode.children, a property separate from vnode.attrs — not something
		// to destructure off attrs (see form.js's own header for the exact
		// same trap hit earlier in this project). A single function child
		// (the scoped-slot form) still arrives wrapped as a one-item array —
		// unwrap it the same way press.js's renderChildren does, or `typeof
		// children === "function"` below would never match at all.
		let children = vnode.children;
		if (Array.isArray(children) && children.length === 1) children = children[0];

		const fieldLength = normalizeLength(length ?? 6);
		const isControlled = value !== undefined;
		const displayedValue = normalizeValue(isControlled ? value : s.uncontrolledValue, fieldLength, inputType);

		const context = {
			value: displayedValue,
			length: fieldLength,
			inputType,
			focused: s.focused,
			complete: displayedValue.length === fieldLength,
			disabled,
			invalid,
		};

		const handleInput = (rawValue) => {
			const nextValue = normalizeValue(rawValue, fieldLength, inputType);
			if (!isControlled) s.uncontrolledValue = nextValue;
			// Native already shows this value — it's where the event came from.
			// Recording it here means a controlled parent that faithfully mirrors
			// onChange straight back into `value` (the common case) won't cause
			// onupdate to push the exact same value right back to native, which
			// is the redundant round-trip that risked re-triggering the same
			// native echo this component's onupdate comment describes.
			s.lastPushedValue = nextValue;
			s.emit(nextValue, displayedValue, vnode.attrs, fieldLength);
			// The native input-filter should already have rejected anything
			// outside inputType, but if it didn't (or the length just got
			// shorter), push the corrected value back so the hidden field never
			// visibly disagrees with the slots. Goes straight to the underlying
			// Input's own ref, not s.inputRef.setValue — that wrapper would emit
			// a second time for the same change already reported above.
			if (rawValue !== nextValue) {
				s.lastPushedValue = nextValue;
				Promise.resolve(s.nativeRef?.setValue(nextValue)).catch(reportInputError);
			}
			shim.redraw();
		};

		const handleFocus = () => {
			s.focused = true;
			if (typeof onFocus === "function") onFocus();
			shim.redraw();
		};

		const handleBlur = () => {
			s.focused = false;
			if (typeof onBlur === "function") onBlur();
			shim.redraw();
		};

		const handleTap = () => {
			if (!disabled) Promise.resolve(s.inputRef.focus()).catch(reportInputError);
		};

		// Imperative API, refreshed every render like every other inputRef
		// convention in this project (button/input/slider/etc). The underlying
		// Input is uncontrolled (see onupdate's header for why), so an explicit
		// caller-driven setValue is the ONLY thing that pushes to native here —
		// tracked via s.lastPushedValue so a controlled parent that mirrors
		// this same value back through `value` doesn't cause onupdate to push
		// it a second, redundant time.
		s.inputRef.focus = () => (disabled ? Promise.resolve() : Promise.resolve(s.nativeRef?.focus()));
		s.inputRef.blur = () => Promise.resolve(s.nativeRef?.blur());
		s.inputRef.setValue = (nextRaw) => {
			const nextValue = normalizeValue(nextRaw, fieldLength, inputType);
			if (!isControlled) s.uncontrolledValue = nextValue;
			s.lastPushedValue = nextValue;
			s.emit(nextValue, displayedValue, vnode.attrs, fieldLength);
			shim.redraw();
			return Promise.resolve(s.nativeRef?.setValue(nextValue));
		};
		s.inputRef.clear = () => s.inputRef.setValue("");
		s.inputRef.getValue = () => displayedValue;
		if (vnode.attrs.inputRef != null) Object.assign(vnode.attrs.inputRef, s.inputRef);

		const renderedChildren = typeof children === "function" ? children(context) : children;

		return m(
			otpScope.Provider,
			{ value: context },
			m(
				"view",
				{
					class: cx(className, {
						"ui-focused": s.focused,
						"ui-complete": context.complete,
						"ui-disabled": disabled,
						"ui-invalid": invalid,
					}),
					style,
					flatten: nativeBool(false),
					ontap: handleTap,
				},
				[
					renderedChildren,
					m(Input, {
						inputRef: s.nativeRef,
						// Uncontrolled on purpose — see this component's own onupdate
						// for why. `defaultValue` only matters for Input's own oncreate
						// (the initial native seed); this InputOTP's own onupdate is
						// what pushes any LATER external change.
						defaultValue: displayedValue,
						type: inputType === "numeric" ? "number" : "text",
						confirmType: "done",
						maxLength: fieldLength,
						inputFilter: NATIVE_INPUT_FILTERS[inputType] || NATIVE_INPUT_FILTERS.numeric,
						style: HIDDEN_INPUT_STYLE,
						inputProps: Object.assign(
							{
								disabled: nativeBool(disabled),
								"ignore-focus": nativeBool(true),
								"android-fullscreen-mode": nativeBool(false),
								"ios-auto-correct": nativeBool(false),
								"ios-spell-check": nativeBool(false),
							},
							inputProps,
						),
						onInput: handleInput,
						onFocus: handleFocus,
						onBlur: handleBlur,
					}),
				],
			),
		);
	},
};

export const InputOTPSlot = {
	view(vnode) {
		const context = useInputOTPContext();
		const { index, className, style } = vnode.attrs;
		const { value, length, focused, complete, disabled, invalid } = context;

		const char = value[index];
		const isFilled = char !== undefined;
		const hasFakeCaret = focused && !disabled && value.length < length && index === value.length;
		const slotState = { index, char, focused: hasFakeCaret, filled: isFilled, complete, disabled, invalid };

		// Positional children (vnode.children, NOT vnode.attrs.children — see
		// InputOTP.view()'s own comment on this). Custom content is optional
		// here (unlike InputOTP itself), so "nothing passed" also has to be
		// told apart from "a single function/vnode was passed", both of which
		// arrive as vnode.children normalized to an array.
		let rawChildren = vnode.children;
		const hasCustomChildren = Array.isArray(rawChildren) ? rawChildren.length > 0 : rawChildren != null;
		if (Array.isArray(rawChildren) && rawChildren.length === 1) rawChildren = rawChildren[0];
		const renderedChildren = typeof rawChildren === "function" ? rawChildren(slotState) : rawChildren;

		return m(
			"view",
			{
				class: cx(className, {
					"ui-focused": hasFakeCaret,
					"ui-filled": isFilled,
					"ui-complete": complete,
					"ui-disabled": disabled,
					"ui-invalid": invalid,
				}),
				style,
			},
			// The digit gets its own class rather than inheriting the slot's own
			// `color` — Lynx doesn't cascade CSS properties from a <view> to a
			// <text> child by default (same trap as this project's own
			// font-family finding, see mithril-lynx's README) — without it the
			// digit rendered in the platform's default text color, nearly
			// invisible on a dark slot. Found visually on device, not guessed.
			hasCustomChildren
				? renderedChildren
				: [
					char === undefined ? null : m("text", { class: "ui-input-otp-char" }, char),
					hasFakeCaret ? m("view", { class: "ui-input-otp-caret" }) : null,
				],
		);
	},
};
