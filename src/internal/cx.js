// internal/cx.js
//
// The clsx() stand-in lynx-ui uses to merge a caller's className with the
// semantic state classes. Kept local (a few lines) rather than taking a
// dependency, and deliberately matching lynx-ui's own output: the caller's
// classes first, then whichever of ui-active/ui-checked/ui-disabled apply,
// so CSS written against lynx-ui's class contract works here unchanged.

export function cx(className, states) {
	let out = className == null || className === "" ? "" : String(className);
	if (states != null) {
		for (const key in states) {
			if (states[key]) out = out === "" ? key : out + " " + key;
		}
	}
	return out;
}

/**
 * The caller's classes for a component's element. Mithril code passes
 * `class` (as it does to any element); lynx-ui code passes `className`.
 * Both are accepted and combined, in that order — the same way Mithril's
 * own hyperscript joins a selector's classes with `attrs.class`. Extra
 * attribute bags spread onto the same element (a component's `*Props`
 * escape hatch) contribute theirs too, so a class set there is kept rather
 * than overwritten.
 * @param {Object} attrs - The component's `vnode.attrs`.
 * @param {...Object} [bags] - Raw attribute objects spread onto the same element.
 * @returns {string|undefined} The combined classes, or `undefined` when there are none.
 */
export function classOf(attrs, ...bags) {
	let out = "";
	for (const source of [attrs, ...bags]) {
		if (source == null) continue;
		for (const value of [source.class, source.className]) {
			if (value == null || value === "") continue;
			out = out === "" ? String(value) : out + " " + value;
		}
	}
	return out === "" ? undefined : out;
}
