// Ambient declaration for the ESM internal/native.js.

/**
 * Coerces a boolean into the string form a native Lynx element reads.
 * Mithril's HTML boolean-attribute semantics (`true` → `setAttribute(k, "")`)
 * don't survive the trip to a native element, which sees an empty string as
 * not-set. Use this for every boolean attr on a native element.
 */
export function nativeBool(value: unknown): "true" | "false";
