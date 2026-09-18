// internal/native-ref.js
//
// Imperative access to a native element from mithril-lynx component code.
// Component code always runs on the background thread and never holds a
// real element handle — the bridge is Lynx's selector-query API, the same
// primitive any background-thread code uses to reach into the native tree.
// See docs/native-papi/papi-01-imperative-refs.md and
// papi-02-direct-style-writes.md for the full writeup of this pattern.
//
// Selection is by id only: Lynx's own NodesRef selector support is
// currently id-only (SELECTOR_NOT_SUPPORTED for anything else per
// @lynx-js/types), so every component using this needs a stable `id` on
// the target node. Use ensureId() below to get one, whether or not the
// component's own consumer supplied one.

let nextId = 1;

/** A stable id to select a node by — reuses `preferredId` if given (a
 * consumer-supplied id), otherwise mints one once per call site. Call this
 * from `oninit` (fires once per component instance) and reuse the result,
 * not from `view` (fires on every redraw). */
export function ensureId(preferredId) {
	return preferredId || `mlui-ref-${nextId++}`;
}

function selectorQuery(id) {
	return lynx.createSelectorQuery().select(`#${id}`);
}

// Per-id queue of in-flight invoke() calls. Each call to the same node
// waits for the previous one to settle before firing — without this, two
// calls issued back-to-back (e.g. two controlled-value pushes from two
// quick redraws) could resolve OUT OF ORDER, since each crosses the
// bridge independently and there's no guarantee the first one to be SENT
// is the first one to come back. That would let a stale write silently
// land after a newer one and corrupt what the native element shows.
// Found while porting input.js's controlled `setValue` push — see
// docs/native-papi/papi-01-imperative-refs.md.
const invokeQueues = new Map();

/**
 * One-off imperative calls that need a response back: focus, measure, read
 * a value. Always resolves/rejects — never hands back the raw
 * `{code, data}` envelope the underlying PAPI callback gets, so callers
 * don't have to check a status code by hand. Calls to the same `id` are
 * serialized (see invokeQueues above); calls to different ids run freely
 * in parallel.
 */
export function invokeNative(id, method, params) {
	const prior = invokeQueues.get(id) || Promise.resolve();
	const call = prior.then(
		() =>
			new Promise((resolve, reject) => {
				selectorQuery(id)
					.invoke({
						method,
						params: params || {},
						success: (data) => resolve(data),
						fail: (data) => reject(data),
					})
					.exec();
			}),
	);
	// Swallow the rejection in the QUEUE's own chain (not in what's
	// returned to the caller) — one failed call must not wedge every
	// later call to the same node.
	invokeQueues.set(
		id,
		call.then(
			() => {},
			() => {},
		),
	);
	return call;
}

/**
 * Fire-and-forget style/prop writes for high-frequency events (drag,
 * swipe) — bypasses Mithril's diff entirely. `setNativeProps` has no
 * confirmation callback on the native side (unlike `invoke`), so writes
 * are coalesced: if one is still "in flight" (the cross-thread call
 * hasn't returned) when a new one arrives, only the latest survives —
 * there is no point queueing every intermediate frame of a drag.
 */
export function createNativeWriter(id) {
	let pending = null;
	let sending = false;

	function flush() {
		if (sending || pending == null) return;
		sending = true;
		const props = pending;
		pending = null;
		selectorQuery(id).setNativeProps(props).exec();
		sending = false;
		if (pending != null) flush(); // a new write arrived while this one was going out
	}

	return {
		write(props) {
			pending = Object.assign(pending || {}, props);
			flush();
		},
	};
}

/**
 * Convenience wrapper combining invokeNative()/createNativeWriter() behind
 * an API shaped like the direct-handle helper this replaces, to keep a
 * component's own call sites a close, mostly mechanical translation.
 */
export function createRef(id) {
	const writer = createNativeWriter(id);
	return {
		id,
		invoke(method, params) {
			return invokeNative(id, method, params);
		},
		setStyleProperty(name, value) {
			writer.write({ [name]: value });
		},
		setStyleProperties(styles) {
			writer.write(styles);
		},
	};
}
