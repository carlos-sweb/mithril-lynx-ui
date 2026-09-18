// form.js
//
// Mithril port of @lynx-js/lynx-ui-form (Apache-2.0 — see ./NOTICE): a thin
// form-state aggregator (name → value map, one onChanged callback for the
// whole form) that FormField wires up as a specific already-ported
// component per its `as` prop.
//
// Turned out much smaller than the project plan assumed — the plan filed
// this under "Phase 8: MTS-dependent", but the real source
// (@lynx-js/lynx-ui-form, read in full before writing anything here) has NO
// Main Thread Scripting anywhere; it's a plain React Context + useReducer.
// Ported onto this project's own Context substitute (scope.js) instead.
//
// The one piece that made this a clean fit: FormField uses each underlying
// component UNCONTROLLED — `defaultValue`/`defaultChecked`, set once, never
// synced back — rather than feeding a controlled `value` on every render.
// Input, TextArea, Checkbox, Switch and RadioGroup already support that
// exact contract in this project (already needed for their OWN demos), so
// there was nothing to add there at all.
//
// The original suppresses onChanged during the initial mount (an
// isMounted ref) so every FormField's own registration doesn't count as a
// "change" the app gets told about. The FIRST attempt here copied that
// literally — gate a `mounted` flag flipped by FormRoot's own oncreate —
// which seemed reasonable given Mithril fires a component's oncreate
// bottom-up... except it doesn't, for THIS specific purpose: reading this
// shim's own source (initComponent pushes a component's oncreate onto the
// flush queue BEFORE it recurses into rendering that component's own
// children — see initLifecycle/createComponent), a component's oncreate is
// queued, and therefore runs, BEFORE any of its descendants' — the exact
// opposite of what the first attempt assumed. FormRoot's oncreate really
// did flip `mounted = true` before any FormField's own oncreate had run its
// initial registration, defeating the guard immediately (confirmed the hard
// way: the very first registration call already saw mounted === true and
// tried to redraw mid-render, throwing the "locked" error below).
//
// Fixed properly instead of patching the ordering assumption: registration
// and real changes go through two SEPARATE api methods now.
// `registerField` (called only from FormField's oncreate) is silent — no
// callback, no redraw, just seeds formData — because ANY oncreate anywhere
// in the tree runs inside the render pass still building that same tree,
// so redrawing there is never safe regardless of ordering, and never
// needed either (the in-flight render already reflects the value once it
// finishes). `onChanged` (called only from a real field interaction —
// always dispatched by native from outside any render) redraws directly,
// same as every other component's onChange convention in this project.

import m from "mithril-runtime";
import { redraw } from "mithril-lynx/mount-redraw";
import { Button } from "../button/button.js";
import { Checkbox } from "../checkbox/checkbox.js";
import { Input, TextArea } from "../input/input.js";
import { delayFrames } from "../internal/frames.js";
import { RadioGroup } from "../radio-group/radio-group.js";
import { createScope } from "../scope/scope.js";
import { Switch } from "../switch/switch.js";

const formScope = createScope();

function restAttrs(attrs, omit) {
	const out = {};
	for (const key in attrs) {
		if (!omit.includes(key)) out[key] = attrs[key];
	}
	return out;
}

/** For a component nested inside <FormRoot> that isn't a FormField (a custom reset button, a live summary, ...). Only valid from view(), same as scope.js's useScope(). */
export function useForm() {
	const api = formScope.useScope();
	if (api == null) {
		throw new Error("mithril-lynx-ui: useForm() must be called from a view() nested inside <FormRoot>");
	}
	return api;
}

export const FormRoot = {
	oninit(vnode) {
		const s = vnode.state;
		s.formData = Object.assign({}, vnode.attrs.initialValues);
		s.api = {
			getValue: (name) => s.formData[name],
			getAllValues: () => s.formData,

			// Silent on purpose: called ONLY from a FormField's own oncreate, to
			// seed formData with its starting value. Every oncreate in a tree —
			// no matter how deeply nested — runs INSIDE the same render pass
			// that's still building that tree (confirmed against this shim's own
			// source: a component's oncreate is queued to the flush list before
			// it even recurses into rendering its children, so nesting doesn't
			// change anything). Calling redraw() — or the app's onChanged,
			// which almost always redraws itself — from ANY oncreate throws
			// "Node is currently being rendered to and thus is locked", the same
			// class of bug presence.js already hit. Not needed anyway: the
			// render already in flight will reflect this value once it finishes.
			registerField: (name, initialValue) => {
				if (name in s.formData) return; // initialValues already had it
				s.formData[name] = initialValue;
			},

			// Called from a REAL field interaction (a tap, typing, ...) — always
			// dispatched by native from OUTSIDE any render pass, so redrawing
			// here is safe. Never call this from a lifecycle hook.
			onChanged: (name, value) => {
				if (s.formData[name] === value) return;
				s.formData = Object.assign({}, s.formData, { [name]: value });
				if (typeof vnode.attrs.onChanged === "function") vnode.attrs.onChanged(s.formData);
				redraw();
			},

			unregisterField: (name) => {
				if (!(name in s.formData)) return;
				const next = Object.assign({}, s.formData);
				delete next[name];
				s.formData = next;
				// Called from a FormField's onremove — which, like oncreate above,
				// always runs DURING an active render pass (the one removing that
				// field). Deferred one frame for the same reentrancy reason.
				delayFrames(1, () => {
					if (typeof vnode.attrs.onChanged === "function") vnode.attrs.onChanged(s.formData);
					redraw();
				});
			},

			submit: () => {
				if (typeof vnode.attrs.onSubmit === "function") vnode.attrs.onSubmit(s.formData);
			},
		};
	},

	view(vnode) {
		return m(formScope.Provider, { value: vnode.state.api }, vnode.children);
	},
};

const FORM_FIELD_OWN_ATTRS = ["as", "name", "onChanged", "children"];

export const FormField = {
	view(vnode) {
		const api = formScope.useScope();
		if (api == null) {
			throw new Error("mithril-lynx-ui: <FormField> must be used inside a <FormRoot>");
		}
		vnode.state.api = api; // stash — oncreate/onremove can't call useScope() themselves, see scope.js

		const { as, name, onChanged } = vnode.attrs;
		if (name == null) {
			throw new Error("mithril-lynx-ui: <FormField> requires a name");
		}
		// Positional children (m(FormField, attrs, child1, child2)) land on
		// vnode.children, a SEPARATE vnode property from vnode.attrs — not
		// something to destructure off attrs, which is only ever populated by
		// an explicit `children:` KEY inside the attrs object itself (which
		// nothing here uses).
		const children = vnode.children;

		const rest = restAttrs(vnode.attrs, FORM_FIELD_OWN_ATTRS);
		const initialValue = api.getValue(name) ?? null;
		const handleChange = (value) => {
			api.onChanged(name, value);
			if (typeof onChanged === "function") onChanged(value);
		};

		switch (as) {
			case "Input":
				return m(Input, Object.assign({}, rest, { defaultValue: initialValue ?? undefined, onInput: handleChange }), children);
			case "TextArea":
				return m(TextArea, Object.assign({}, rest, { defaultValue: initialValue ?? undefined, onInput: handleChange }), children);
			case "Checkbox":
				return m(Checkbox, Object.assign({}, rest, { defaultChecked: initialValue === true, onChange: handleChange }), children);
			case "Switch":
				return m(Switch, Object.assign({}, rest, { defaultChecked: initialValue === true, onChange: handleChange }), children);
			case "RadioGroupRoot":
				return m(RadioGroup, Object.assign({}, rest, { defaultValue: initialValue ?? undefined, onValueChange: handleChange }), children);
			default:
				throw new Error(`mithril-lynx-ui: <FormField> does not support as="${as}"`);
		}
	},

	oncreate(vnode) {
		const api = vnode.state.api;
		api.registerField(vnode.attrs.name, api.getValue(vnode.attrs.name) ?? null);
	},

	onremove(vnode) {
		const api = vnode.state.api;
		if (api != null) api.unregisterField(vnode.attrs.name);
	},
};

export const FormSubmitButton = {
	view(vnode) {
		const api = formScope.useScope();
		if (api == null) {
			throw new Error("mithril-lynx-ui: <FormSubmitButton> must be used inside a <FormRoot>");
		}
		const { onSubmit } = vnode.attrs;
		const rest = restAttrs(vnode.attrs, ["onSubmit"]);

		return m(
			Button,
			Object.assign({}, rest, {
				onClick: () => {
					api.submit();
					if (typeof onSubmit === "function") onSubmit(api.getAllValues());
				},
			}),
			vnode.children,
		);
	},
};
