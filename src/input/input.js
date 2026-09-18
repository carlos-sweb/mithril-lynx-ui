// input.js
//
// Mithril port of @lynx-js/lynx-ui-input's Input and TextArea (Apache-2.0 —
// see ./NOTICE). Both wrap the native <input>/<textarea> xelements, which
// are opt-in native artifacts: without org.lynxsdk.lynx:xelement and
// xelement-input on the host (and XElementBehaviors registered on the
// LynxViewBuilder) they mount without error and render at zero size. See the
// README's native-interop section.
//
// One deliberate divergence from the original, confirmed closed rather than
// just assumed (project plan's own "Input's live-echo MTS optimization"
// item — read main-thread.js's and background.js's own headers before
// concluding this, not just the earlier main-thread-owned-mode reasoning
// below). Real lynx-ui's `Input` binds its native `<input>`'s content event
// with `main-thread:bindinput`, not a plain `bindinput`: ReactLynx runs an
// app's OWN component tree on the BACKGROUND thread by default, so every
// keystroke's event handler is one hop away from where it lands unless MTS
// pulls it onto the main thread instead — and once pulled there, upstream
// marks the field readonly on the main thread FIRST (a hop-free write),
// ships the value across via runOnBackground, and unlocks it again once the
// controlled round-trip settles, purely to stop a second keystroke from
// racing that hop and corrupting what the native editor shows mid-flight.
//
// mithril-lynx has no equivalent scenario to guard against, in EITHER of
// its render modes — not just the main-thread-owned one this file already
// targets. Confirmed by reading both cross-thread adapters directly:
// background.js's own header states it plainly ("Mithril never renders on
// the background thread in data-channel mode") — the background side is a
// plain-JS data store, with zero Mithril component tree on it in any mode.
// main-thread.js's setupApp() is the ONLY place a Mithril root ever renders,
// so an `oninput` handler on a native `<input>` ALWAYS executes on the same
// thread the native event was delivered on, full stop — there's no
// mithril-lynx configuration where "logic moves to the background thread"
// also moves Input's own rendering there, unlike ReactLynx's default. The
// named cross-thread registry (registerHandler/runOnMainThread/
// runOnBackground) exists for a background-owned BUSINESS-LOGIC layer to
// reach back into main-thread UI actions deliberately — not something a
// native input event ever needs to cross to reach its own handler. So
// controlled input is just synchronous code here, unconditionally, and none
// of upstream's readonly-lock machinery has anything to protect against.
//
// The value of a controlled field is pushed imperatively through the native
// element's own setValue, exactly as upstream does — it is NOT a rendered
// attribute, and diffing one onto the element would fight the native
// editor's own state.

import m from "mithril";
import { wrapElement } from "mithril-lynx-v1/element";
import { cx } from "../internal/cx.js";
import { nativeBool } from "../internal/native.js";

function detailOf(event) {
	// Lynx nests the useful fields under `detail`; the normalized event object
	// itself carries none of them (event.value is undefined).
	return (event && event.detail) || {};
}

function makeRef(vnode) {
	const el = wrapElement(vnode.dom);

	return {
		focus: () => el.invoke("focus"),
		blur: () => el.invoke("blur"),
		setValue: (value) => el.invoke("setValue", { value: value == null ? "" : String(value) }),
		/** Resolves { value, selectionStart, selectionEnd } inside the PAPI's { code, data } envelope. */
		getValue: () => el.invoke("getValue"),
		setSelectionRange: (selectionStart, selectionEnd) =>
			el.invoke("setSelectionRange", { selectionStart, selectionEnd }),
	};
}

function fieldComponent(tag) {
	return {
		oncreate(vnode) {
			const s = vnode.state;
			s.ref = makeRef(vnode);
			// Hand the imperative API to whoever asked for it — the Mithril
			// equivalent of upstream's useImperativeHandle(ref, ...). Callers pass
			// a plain object and read methods off it afterwards.
			if (vnode.attrs.inputRef != null) Object.assign(vnode.attrs.inputRef, s.ref);

			// Seed the native editor. A controlled field takes `value`; an
			// uncontrolled one takes `defaultValue` once and is then on its own.
			const initial = vnode.attrs.value !== undefined ? vnode.attrs.value : vnode.attrs.defaultValue;
			s.lastValue = vnode.attrs.value;
			if (initial != null && initial !== "") s.ref.setValue(initial);
		},

		onupdate(vnode) {
			const s = vnode.state;
			if (vnode.attrs.value === undefined) return; // uncontrolled: never pushed
			if (vnode.attrs.value === s.lastValue) return;
			s.lastValue = vnode.attrs.value;
			s.ref.setValue(vnode.attrs.value);
		},

		view(vnode) {
			const {
				id,
				className,
				style,
				placeholder,
				readonly = false,
				maxLength = 140,
				maxLines,
				type = "text",
				confirmType = "send",
				inputFilter,
				showSoftInputOnFocus = true,
				onInput,
				onFocus,
				onBlur,
				onConfirm,
				onSelectionChange,
				inputProps,
			} = vnode.attrs;

			const attrs = Object.assign({}, inputProps, {
				id,
				class: cx(className, { "ui-readonly": readonly === true }),
				style,
				placeholder,
				// Booleans have to cross as strings — a native element reads
				// Mithril's HTML-style empty-string boolean attr as not-set.
				readonly: nativeBool(readonly),
				"show-soft-input-on-focus": nativeBool(showSoftInputOnFocus),
				maxlength: maxLength,
				"confirm-type": confirmType,
				"input-filter": inputFilter,

				oninput: (e) => {
					const d = detailOf(e);
					if (typeof onInput === "function") {
						onInput(d.value ?? "", d.selectionStart, d.selectionEnd, d.isComposing === true);
					}
				},
				onfocus: (e) => {
					if (typeof onFocus === "function") onFocus(detailOf(e).value ?? "");
				},
				onblur: (e) => {
					if (typeof onBlur === "function") onBlur(detailOf(e).value ?? "");
				},
				onconfirm: (e) => {
					if (typeof onConfirm === "function") onConfirm(detailOf(e).value ?? "");
				},
				onselection: (e) => {
					const d = detailOf(e);
					if (typeof onSelectionChange === "function") {
						onSelectionChange(d.selectionStart, d.selectionEnd);
					}
				},
			});

			if (tag === "input") attrs.type = type;
			else if (maxLines != null) attrs.maxlines = maxLines;

			return m(tag, attrs);
		},
	};
}

export const Input = fieldComponent("input");
export const TextArea = fieldComponent("textarea");
