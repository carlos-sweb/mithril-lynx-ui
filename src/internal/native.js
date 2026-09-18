// internal/native.js
//
// Interop helpers for talking to Lynx's native elements through Mithril's
// DOM-shaped attribute layer.

/**
 * Coerces a boolean into the string form a native Lynx element actually
 * reads.
 *
 * Why this is needed: mithril-lynx's shim is a faithful port of
 * mithril/render/render.js, including its HTML semantics for boolean
 * attributes — `attr === true` becomes `setAttribute(key, "")`, because on
 * the web the *presence* of the attribute is what counts. Lynx's native
 * elements aren't HTML: they read a typed value, and an empty string reads
 * as not-set. Passing `visible: true` to <overlay> therefore mounted the
 * element with no error and never showed it — confirmed on device.
 *
 * So any boolean destined for a native element goes through here.
 */
export function nativeBool(value) {
	return value ? "true" : "false";
}
