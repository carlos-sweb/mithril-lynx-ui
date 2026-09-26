// input.js
//
// Mithril port of @lynx-js/lynx-ui-input's Input and TextArea (Apache-2.0 —
// see ./NOTICE). Both wrap the native <input>/<textarea> xelements, which
// are opt-in native artifacts: without org.lynxsdk.lynx:xelement and
// xelement-input on the host (and XElementBehaviors registered on the
// LynxViewBuilder) they mount without error and render at zero size. See the
// README's native-interop section.
//
// How the text reaches the native editor: mithril-lynx gives an
// `input`/`textarea` element a real `value` property (see mithril-lynx's
// INPUT.md). Assigning it sends the native `setValue` UI method with the
// patch, right after the flush that creates the element; every event of
// the field syncs it back from `detail.value`. So a controlled `value` is
// just an attribute here — Mithril only writes it when it differs from what
// the field holds, which means text the user just typed is never echoed
// back, and a value the app changes is sent once.
//
// Upstream's `Input` locks the field readonly on the main thread while a
// controlled value round-trips, so a second keystroke can't race it.
// mithril-lynx does that job in core instead: the main thread counts each
// field's native `input` events and drops a `setValue` computed before the
// latest one (that keystroke's own event re-renders with the right value).
//
// The imperative handle (`inputRef`) delegates to the element's own
// `focus`/`blur`/`invoke` (mithril-lynx's fake-dom), so it needs no `id` and
// works from the moment the component is created.

import m from "mithril-runtime";
import { cx } from "../internal/cx.js";
import { nativeBool } from "../internal/native.js";

function detailOf(event) {
	// Lynx nests the useful fields under `detail`; the normalized event object
	// itself carries none of them (event.value is undefined).
	return (event && event.detail) || {};
}

/**
 * The imperative API over a field's fake-dom element.
 * @param {Object} dom - The field's `vnode.dom`.
 * @returns {Object} The `inputRef` methods.
 */
function makeRef(dom) {
	return {
		focus: () => dom.invoke("focus"),
		blur: () => dom.invoke("blur"),
		/** Goes through the element's `value`, so a later render compares against it; the call itself travels with the next patch. */
		setValue: (value) => {
			dom.value = value == null ? "" : String(value);
			return Promise.resolve();
		},
		/** Resolves { value, selectionStart, selectionEnd, isComposing }. */
		getValue: () => dom.invoke("getValue"),
		setSelectionRange: (selectionStart, selectionEnd) => dom.setSelectionRange(selectionStart, selectionEnd),
	};
}

function fieldComponent(tag) {
	return {
		oncreate(vnode) {
			// Hand the imperative API to whoever asked for it — the Mithril
			// equivalent of upstream's useImperativeHandle(ref, ...). Callers pass
			// a plain object and read methods off it afterwards.
			if (vnode.attrs.inputRef != null) Object.assign(vnode.attrs.inputRef, makeRef(vnode.dom));
			// An uncontrolled field takes `defaultValue` once and is then on its
			// own. Set here, not rendered: a `value` attribute dropped on the
			// next render would clear the field.
			if (vnode.attrs.value === undefined && vnode.attrs.defaultValue != null) {
				vnode.dom.value = vnode.attrs.defaultValue;
			}
		},

		view(vnode) {
			const {
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
				id: vnode.attrs.id,
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

			// Controlled: the native text follows `value` (null clears it).
			if (vnode.attrs.value !== undefined) attrs.value = vnode.attrs.value == null ? "" : vnode.attrs.value;
			if (tag === "input") attrs.type = type;
			else if (maxLines != null) attrs.maxlines = maxLines;

			return m(tag, attrs);
		},
	};
}

export const Input = fieldComponent("input");
export const TextArea = fieldComponent("textarea");
