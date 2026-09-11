// input.js
//
// Mithril port of @lynx-js/lynx-ui-input's Input and TextArea (Apache-2.0 —
// see ./NOTICE). Both wrap the native <input>/<textarea> xelements, which
// are opt-in native artifacts: without org.lynxsdk.lynx:xelement and
// xelement-input on the host (and XElementBehaviors registered on the
// LynxViewBuilder) they mount without error and render at zero size. See the
// README's native-interop section.
//
// One deliberate divergence from the original, and it's a simplification
// rather than a gap. lynx-ui runs its components on the background thread,
// so an input event lands on the main thread and has to be forwarded across;
// to keep typing from racing that hop it marks the field readonly on the
// main thread via Main Thread Scripting, ships the event over, then unlocks.
// A mithril-lynx app in main-thread-owned mode has no hop at all — the
// handler already runs where the event arrives — so controlled input is just
// synchronous here, and none of that machinery is needed. (An app that moves
// its logic to the background thread would reintroduce the hop; that's the
// case mithril-lynx's named-handler registry exists for.)
//
// The value of a controlled field is pushed imperatively through the native
// element's own setValue, exactly as upstream does — it is NOT a rendered
// attribute, and diffing one onto the element would fight the native
// editor's own state.

import m from "mithril";
import { wrapElement } from "mithril-lynx/element";
import { cx } from "./internal/cx.js";
import { nativeBool } from "./internal/native.js";

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
