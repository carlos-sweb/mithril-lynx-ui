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
