# 3 — Asynchronous geometry measurement

## What this solves

Positioning a floating element relative to another (a popover against its
trigger), or knowing a track's real width before converting a finger
position into a value, requires asking the native side for the node's real
rectangle — something that can't be read synchronously anywhere, not even
in a component that had a direct native handle: measuring always requires
a round trip to the native layout layer. This is the first pattern in this
set that's inherently asynchronous even in its simplest form.

## The native PAPI involved

The same `__InvokeUIMethod` from manual 1, with the `"boundingClientRect"`
method:

```js
el.invoke("boundingClientRect", { relativeTo: "" })
```

Resolves `{ code, data: { left, top, width, height, ... } }`.

## What an implementation looks like

In `src/popover/popover.js`, measuring two nodes in parallel and retrying
if there's no valid data yet (layout might not be ready on the first
attempt):

```js
function measureRect(el) {
	return el.invoke("boundingClientRect", { relativeTo: "" }).then((res) => (res && res.data) || {});
}

function maybeRecompute(vnode, attempt = 0) {
	const s = vnode.state;
	const ctx = s.ctx;
	if (attempt === 0 && ctx.state !== PresenceState.DelayedEntering) return;
	if (!ctx.show) return;
	const referenceEl = ctx.hasAnchor && ctx.anchorEl ? ctx.anchorEl : ctx.triggerEl;
	if (referenceEl == null || s.el == null) return;

	const { placement = "bottom", placementOffset = 0 } = vnode.attrs;
	Promise.all([measureRect(referenceEl), measureRect(s.el)]).then(([reference, floating]) => {
		const gotReference = typeof reference.width === "number" && reference.width > 0;
		const gotFloating = typeof floating.width === "number" && floating.width > 0;
		if (!gotReference || !gotFloating) {
			if (attempt < MAX_MEASURE_ATTEMPTS) requestFrame(() => maybeRecompute(vnode, attempt + 1));
			return;
		}
		ctx.floatingCoords = computePlacement(placement, reference, floating, placementOffset);
		redraw();
	});
}
```

The same retry pattern appears in `src/swipe-action/swipe-action.js`,
measuring two areas to work out how far each one can travel:

```js
function scheduleMeasure(vnode, attempt = 0) {
	const s = vnode.state;
	if (s.displayEl == null || s.actionEl == null) return;

	Promise.all([
		s.displayEl.invoke("boundingClientRect", { relativeTo: "" }),
		s.actionEl.invoke("boundingClientRect", { relativeTo: "" }),
	]).then(([displayRes, actionRes]) => {
		const displayWidth = displayRes && displayRes.data && displayRes.data.width;
		const actionWidth = actionRes && actionRes.data && actionRes.data.width;
		const gotDisplay = typeof displayWidth === "number" && displayWidth > 0;
		const gotAction = typeof actionWidth === "number" && actionWidth > 0;

		if (gotDisplay) s.displayAreaSize = displayWidth;
		if (gotAction) s.actionAreaSize = actionWidth;

		if ((!gotDisplay || !gotAction) && attempt < MAX_MEASURE_ATTEMPTS) {
			requestFrame(() => scheduleMeasure(vnode, attempt + 1));
			return;
		}
		redraw();
	});
}
```

## Applying this in mithril-lynx

This is the case where the least changes compared to the pattern above:
since measurement was already asynchronous to begin with (there was never
a "synchronous" version of `boundingClientRect`), the only real change is
the way it's invoked — the same `invoke(method, params)` translation from
manual 1, via `lynx.createSelectorQuery().select(selector).invoke(...)`.
The retry logic (`Promise.all` + `attempt < MAX_MEASURE_ATTEMPTS`) carries
over unchanged.

The one thing to keep in mind: each measurement now crosses the thread
boundary twice (there and back), so the cost of a failed retry is a bit
higher than before — it's worth keeping `MAX_MEASURE_ATTEMPTS` low (2-3)
and not turning this into aggressive polling.

**Two real bugs, found porting `popover.js`'s `maybeRecompute()`:**

1. The unwrapped-response shape from manual 1 bit here too — `measureRect()`
   still read `res.data`, silently getting `{}` back forever (measurement
   never succeeded, popover never positioned itself, no error). Fixed to
   `.then((res) => res || {})`.
2. A `select()`-based ref throws SYNCHRONOUSLY when its id no longer
   matches any element — real for this pattern specifically, since a retry
   loop keeps a reference to a node that can be unmounted (`show` flips
   false, a leave animation finishes) WHILE a `requestFrame`-scheduled
   retry is still pending. That throw becomes an unhandled promise
   rejection unless the calling code catches it — `maybeRecompute()`
   now ends in `.catch(() => {})`, matching the "give up quietly" contract
   `scheduleMeasure()` above already uses for a failed measurement.

**A third, bigger one, not specific to measurement:** the redraw this
pattern ends with (`redraw()`, from `mithril-lynx/mount-redraw` — see
manual 1) is NOT synchronous. It schedules the actual re-render ~50ms out.
Every test waiting for a measurement's result to show up in a render needs
that margin on top of whatever else it's waiting for (an animation delay,
a retry chain) — the same fix already made once this session for
`presence.test.ts`/`dialog.test.ts`, needed again here for the same reason.
Forgetting it doesn't look like a timing bug at first: `popover.test.ts`
failed with the position stuck at the DEFAULT `"0px"`, which reads
exactly like "the measurement never succeeded" rather than "it succeeded
one tick too late to observe."

## How to test this without a device

There's no "out of the box" support for simulating `boundingClientRect` —
every test that needs it sets `globalThis.__nodesRefInvokeHandler` (see
manual 1's "how to test" section) inside its own `mount()`, returning
fixed rectangles based on call order:

```ts
const TRIGGER_RECT = { left: 100, top: 200, width: 50, height: 20 };
const CONTENT_RECT = { left: 0, top: 0, width: 80, height: 40 };

let invokeCallCount = 0;

function mount(view) {
	invokeCallCount = 0;
	globalThis.__nodesRefInvokeHandler = (_element, method, _params, callback) => {
		if (method === "boundingClientRect") {
			// maybeRecompute() calls Promise.all([reference, floating]) — the
			// first one (reference) is always requested before the second.
			const rect = invokeCallCount % 2 === 0 ? TRIGGER_RECT : CONTENT_RECT;
			invokeCallCount++;
			callback({ code: 0, data: rect });
		} else {
			callback({ code: 0, data: {} });
		}
	};
	// ... mount the component normally (see test/harness.ts)
}
```

The key is that the call order inside the component is deterministic
(`Promise.all([a, b])` always requests `a` first) — the mock relies on
that, not on identifying the node.

## Where this pattern is used

- `src/popover/popover.js` — reference case for this manual.
- `src/swipe-action/swipe-action.js` — measuring the swipe's two areas.
- `src/slider/slider.js` — measuring the track (see manual 4, which also
  adds the queue of events that arrive while a measurement is in flight).
