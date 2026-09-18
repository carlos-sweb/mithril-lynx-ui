# 1 — Imperative refs: invoking a native method on a node

## What this solves

Some operations a native element exposes as an imperative method, not as
something expressible as a declarative attribute in the Mithril tree:
asking an `<input>` to focus, reading its current value and selection,
starting a `<refresh>`'s animation, measuring a node's rectangle. This is
the simplest pattern here because it's a single, one-off call that resolves
with a response — no continuous state, no high-frequency events involved.

## The native PAPI involved

A single native function: `__InvokeUIMethod(handle, method, params, callback)`.
It takes the node's handle, the method name to invoke, its parameters, and
a callback that Lynx calls with the result — normally wrapped in
`{ code, data }`, where `code === 0` means success.

## What an implementation looks like

A minimal helper wrapping `__InvokeUIMethod` in a promise:

```js
function wrapElement(node) {
	const handle = node._handle;

	return {
		// Always resolves with { code, data } — the success/error code
		// has to be checked by the caller, the helper doesn't assume it.
		invoke(method, params) {
			return new Promise((resolve) => {
				__InvokeUIMethod(handle, method, params || {}, (res) => resolve(res));
			});
		},
	};
}
```

And the real usage, in `src/input/input.js` — a full imperative ref built
on top of `invoke()`:

```js
function makeRef(vnode) {
	const el = wrapElement(vnode.dom);

	return {
		focus: () => el.invoke("focus"),
		blur: () => el.invoke("blur"),
		setValue: (value) => el.invoke("setValue", { value: value == null ? "" : String(value) }),
		// Resolves { value, selectionStart, selectionEnd } inside { code, data }.
		getValue: () => el.invoke("getValue"),
		setSelectionRange: (selectionStart, selectionEnd) =>
			el.invoke("setSelectionRange", { selectionStart, selectionEnd }),
	};
}
```

`oncreate` builds the ref and exposes it to the component's consumer
(`vnode.attrs.inputRef`), and also uses it internally to imperatively push
a controlled `value` instead of going through a declarative attribute
(avoiding fighting the native editor's own internal state):

```js
oncreate(vnode) {
	const s = vnode.state;
	s.ref = makeRef(vnode);
	if (vnode.attrs.inputRef != null) Object.assign(vnode.attrs.inputRef, s.ref);

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
```

## Applying this in mithril-lynx

In mithril-lynx, component code (`view`/`oncreate`/etc.) runs on the
background thread — it never has a synchronous native handle like
`vnode.dom._handle` available right there. To invoke a native method from
that context, the bridge is the selector-query Lynx already exposes
globally on the background thread:

```js
function invokeNative(id, method, params) {
	return new Promise((resolve, reject) => {
		lynx.createSelectorQuery()
			.select(`#${id}`)
			.invoke({
				method,
				params: params || {},
				success: (data) => resolve(data),
				fail: (data) => reject(data),
			})
			.exec();
	});
}
```

It's the same helper as above, with two differences: instead of a
`handle` it takes an `id` (string), and instead of the flat `{code, data}`
response it splits success/failure into `success`/`fail` (so `getValue()`
either resolves or rejects, instead of always returning `{code, data}` and
forcing you to check `code` by hand).

**A real bug this caused, ported into `popover.js`.** A direct-handle ref's
`invoke()` resolves with the raw `{code, data}` envelope — every caller has
to unwrap it themselves (`res.data`). This bridge's `invoke()` already
unwraps it before resolving — a caller ported without noticing the shape
changed gets `res.data.data` → `undefined`, silently. That's exactly what
happened moving `popover.js`'s `measureRect()`: it kept `.then((res) =>
(res && res.data) || {})`, so every measurement silently came back `{}`
— not an error, just a popover that never positions itself, retrying up to
`MAX_MEASURE_ATTEMPTS` and giving up. Fixed to `.then((res) => res || {})`.
Any component moving from a direct-handle `invoke()` to this one needs the
same check at every call site — the fix doesn't announce itself with an
error.

To use it, the node needs a stable `id` to target — see `ensureId()` below.
Unlike a direct handle (which already "is" the node), a selector depends on
the node existing in the real tree at query time — care is needed not to
invoke before the first patch has been applied on the native side. Note
also: `@lynx-js/types`' own `NodesRef` typings mark non-id selectors as
`SELECTOR_NOT_SUPPORTED` — id is not just the simplest choice, it's
currently the only one this bridge can rely on.

**Getting a stable id.** A component can't assume its consumer always
passes one, so it needs to mint its own when they don't — once per
component instance, in `oninit` (which fires once and whose state persists
across redraws), never in `view` (which reruns every redraw and would mint
a new id each time, breaking the ref):

```js
let nextId = 1;
function ensureId(preferredId) {
	return preferredId || `mlui-ref-${nextId++}`;
}
```

**A real ordering bug, found porting `input.js`'s controlled `setValue`.**
Because each `invoke()` call is an independent promise crossing the
bridge, two calls to the SAME node issued back-to-back have no guaranteed
resolution order — a slower first call can resolve AFTER a faster second
one and silently overwrite it with stale data. `input.js` calls `setValue()`
from both `oncreate` and `onupdate`; if two `onupdate`s fire close together
(two quick redraws), the earlier push could land last and show the wrong
value. The fix is a per-id queue: every `invoke()` call to the same id
waits for the previous one to settle before firing, so writes always apply
in the order they were issued regardless of how long any individual one
takes:

```js
const invokeQueues = new Map();

function invokeNative(id, method, params) {
	const prior = invokeQueues.get(id) || Promise.resolve();
	const call = prior.then(() => new Promise((resolve, reject) => {
		lynx.createSelectorQuery()
			.select(`#${id}`)
			.invoke({ method, params: params || {}, success: resolve, fail: reject })
			.exec();
	}));
	// Swallow the rejection in the queue's own chain — one failed call
	// must not wedge every later call to the same node.
	invokeQueues.set(id, call.then(() => {}, () => {}));
	return call;
}
```

This is real, implemented code — see `src/internal/native-ref.js`
(`ensureId`, `invokeNative`, and `createRef`, which wraps both into the
`{invoke, setStyleProperty, setStyleProperties}` shape used by the
migrated `src/input/input.js`).

**A real bug this surfaced in mithril-lynx itself.** Giving a node an `id`
(needed for every ref built on this pattern) crashed with `Cannot use
__SetAttribute for "id"` — mithril-lynx's patch applier special-cased
`class` (routed to `__SetClasses`) but not `id`, which needs its own
`__SetID` call the same way. Nothing in mithril-lynx's own test suite had
ever set an `id` before this. Fixed in mithril-lynx `2.3.1`
(`src/apply-patch.js`) — if you're on an older version, assigning `id` to
any element will crash.

**A second, more serious bug this surfaced — in `mithril-runtime` itself,
not in anything PAPI-specific.** Porting `input.js` broke a completely
unrelated component (`form.js`) in a way that only showed up depending on
test order. Root cause: `mithril-runtime`'s `initComponent()` (in
`render/render.js`) locks a component's shared `view` function on entry
(`sentinel.$$reentrantLock$$ = true`) and only clears it on the success
path — no `try`/`finally`. If a `view()` throws (as `form.js`'s own
"rejects an unsupported `as`" test deliberately does), the lock never
clears, and every LATER mount of ANY component sharing that same `view`
function silently no-ops from then on — no error, it just stops rendering.
This is the exact same bug class already found and fixed once in the real
`mithril` package (see `form.test.ts`'s own long-standing comment about
`mithril-lynx@0.0.5`) — reintroduced here in `mithril-runtime`, a separate,
from-scratch reimplementation. It has nothing to do with native refs
specifically; it can bite any component whose `view()` can throw, in tests
or in a real app. Patched locally in both `node_modules/mithril-runtime`
copies in this workspace (wrapped the lock-clearing line in
`try`/`finally`) — **not durable**, lost on the next `npm install` until
it's fixed upstream in `carlos-sweb/mithril-runtime` and republished.

## How to test this without a device

A working mock for `lynx.createSelectorQuery()` now exists — see
`test/setup.ts`. It resolves an `#id` selector by scanning the PAPI call
log for the last `__SetAttribute(handle, "id", value)` that wrote that id
(the real native `id` attribute, set by `apply-patch.js` like any other
attribute), then delegates to the real simulated `__InvokeUIMethod` —
hopping to "main thread" for that lookup and back, the same hop
`test/harness.ts`'s `mount()` does for `sendPatch`. Any test that needs a
specific response (for example, measuring a real rectangle — see manual 3)
still overrides `globalThis.__InvokeUIMethod` for that case, exactly as
before — this mock doesn't change that part.

## Where this pattern is used

- `src/input/input.js` — reference case for this manual.
- `src/popover/popover.js` — `invoke("boundingClientRect", ...)` (see manual 3).
- `src/slider/slider.js` — track measurement (see manuals 3 and 4).
- `src/feed-list/feed-list.js` — `invoke("autoStartRefresh")` / `invoke("finishRefresh")`.
