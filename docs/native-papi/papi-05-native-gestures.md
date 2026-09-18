# 5 — Native gestures

## What this solves

When a gesture (dragging to dismiss a sheet, swiping to reveal an action, a
carousel) coexists with an ancestor that also wants to capture the same
touch (typically a `<scroll-view>`), a plain `ontouchmove` isn't enough: it
loses the "race" for the gesture against the ancestor's scroll. What's
needed is a gesture registered at the native level, one that participates
in Lynx's gesture arena and can explicitly claim or yield priority. This is
the first case in this set where the native side calls back into the
application at high frequency (potentially every frame of a pan), not just
once.

## The native PAPI involved

- `__SetGestureDetector(handle, id, type, config, relationMap)` — registers
  the detector.
- `__RemoveGestureDetector(handle, id)` — unregisters it.
- `__SetGestureState(handle, id, state)` — reports the final state
  (active/failed/ended).
- Inside the callback, a `controller` exposing `__SetGestureState` and
  `__ConsumeGesture(handle, id, {consume, inner})` — the latter is used to
  claim (`consume: true`) or release (`consume: false`) priority over
  ancestors.

One important detail: the native side doesn't call the JS function
directly — it calls a global dispatcher, `runWorklet(ctx, params)`, looking
up the function registered under `ctx._wkltId`. Any callback passed to
`__SetGestureDetector` first has to go through a "worklet" registration:

```js
function ensureWorkletRuntime() {
	if (globalThis.lynxWorkletImpl !== undefined) return;
	globalThis.lynxWorkletImpl = { _workletMap: {} };
	globalThis.registerWorklet = function (_type, id, fn) {
		globalThis.lynxWorkletImpl._workletMap[id] = fn;
	};
	globalThis.runWorklet = function (ctx, params) {
		if (typeof ctx !== "object" || ctx === null || !("_wkltId" in ctx)) return;
		var fn = globalThis.lynxWorkletImpl._workletMap[ctx._wkltId];
		if (typeof fn !== "function") return;
		var args = Array.isArray(params) ? params : params != null ? [params] : [];
		return fn.bind(ctx)(...args); // bind, never .apply()/.call() — the native controller doesn't support it
	};
}

let nextWorkletId = 1;

function wrapWorkletCallback(fn, workletType) {
	if (typeof fn !== "function") return fn;
	ensureWorkletRuntime();
	const id = "worklet-" + nextWorkletId++;
	globalThis.registerWorklet(workletType || "main-thread", id, fn);
	return { _wkltId: id };
}
```

## What an implementation looks like

Registering the detector:

```js
export const GestureType = {
	COMPOSED: -1, PAN: 0, FLING: 1, DEFAULT: 2,
	TAP: 3, LONGPRESS: 4, ROTATION: 5, PINCH: 6, NATIVE: 7,
};

let nextGestureId = 1;

function createGesture(node, options) {
	const { type, callbacks = {}, waitFor = [], simultaneousWith = [], continueWith = [], config } = options;
	const handle = node._handle;
	const gestureType = typeof type === "string" ? GestureType[type.toUpperCase()] : type;
	const id = nextGestureId++;

	__SetAttribute(handle, "has-react-gesture", true);
	__SetAttribute(handle, "flatten", false);

	const detectorConfig = {
		callbacks: Object.keys(callbacks).map((name) => ({ name, callback: wrapWorkletCallback(callbacks[name]) })),
	};
	if (config != null) detectorConfig.config = config;

	__SetGestureDetector(handle, id, gestureType, detectorConfig, {
		waitFor: waitFor.map((g) => g.id),
		simultaneous: simultaneousWith.map((g) => g.id),
		continueWith: continueWith.map((g) => g.id),
	});

	return {
		id,
		remove() {
			if (typeof __RemoveGestureDetector === "function") __RemoveGestureDetector(handle, id);
		},
		setState(state) {
			__SetGestureState(handle, id, state);
		},
	};
}
```

A small helper to claim/release/end the gesture from any callback:

```js
const GestureState = { active: 1, fail: 2, end: 3 };

function makeGestureControls(handle, gestureId) {
	function setState(controller, state) {
		if (controller != null && typeof controller.__SetGestureState === "function") {
			controller.__SetGestureState(handle, gestureId, state);
		}
	}
	return {
		fail(controller) { setState(controller, GestureState.fail); },
		active(controller) { setState(controller, GestureState.active); },
		end(controller) { setState(controller, GestureState.end); },
		// true: claim the gesture (block ancestors, e.g. a <scroll-view>). false: release it.
		interceptGesture(controller, shouldIntercept) {
			if (controller != null && typeof controller.__ConsumeGesture === "function") {
				controller.__ConsumeGesture(handle, gestureId, { consume: shouldIntercept, inner: false });
			}
		},
	};
}
```

Real usage, `src/sheet/sheet.js` (vertical drag-to-dismiss):

```js
oncreate(vnode) {
	const s = vnode.state;
	const inner = vnode.dom.firstChild;
	s.innerEl = wrapElement(inner);

	if (!s.ctx.enableDragToClose) return;

	const gesture = createGesture(inner, {
		type: "native",
		callbacks: {
			onTouchesDown: (event, controller) => {
				s.startX = event.params.clientX;
				s.startY = event.params.clientY;
				s.controls.interceptGesture(controller, true);
			},
			onTouchesMove: (event) => {
				const dx = event.params.clientX - s.startX;
				const dy = event.params.clientY - s.startY;
				s.dragOffset = Math.max(0, closingDelta(s.ctx.resolvedSide, dx, dy));
				s.innerEl.setStyleProperty("transform", sheetDragTransform(s.ctx.resolvedSide, s.dragOffset));
			},
			onTouchesUp: () => {
				if (s.dragOffset >= s.ctx.dismissThreshold) {
					if (typeof s.ctx.onShowChange === "function") s.ctx.onShowChange(false);
					s.ctx.setUncontrolledShow(false);
				}
				s.dragOffset = 0;
				s.innerEl.setStyleProperty("transform", sheetDragTransform(s.ctx.resolvedSide, 0));
			},
		},
	});
	s.gesture = gesture;
	s.controls = makeGestureControls(inner._handle, gesture.id);
},

onremove(vnode) {
	if (vnode.state.gesture != null) vnode.state.gesture.remove();
},
```

An example with axis decision on the first move,
`src/swiper/swiper.js` (horizontal carousel that must yield the gesture if
the move turns out to be vertical):

```js
function onTouchesMove(s, event, controller) {
	const x = event.params.clientX;
	const y = event.params.clientY;

	if (s.isFirstMove) {
		s.isFirstMove = false;
		s.startX = x;
		s.startY = y;
		return; // the axis decision needs a real delta, from the next callback on
	}
	const dx = x - s.startX;
	const dy = y - s.startY;

	if (!s.axisDecided) {
		if (dx === 0 && dy === 0) return;
		s.axisDecided = true;
		s.isHorizontal = Math.abs(dx) >= Math.abs(dy);
		if (s.isHorizontal) {
			s.controls.interceptGesture(controller, true);
			s.dragging = true;
		} else {
			s.controls.interceptGesture(controller, false);
			s.controls.fail(controller);
			return;
		}
	}
	if (!s.isHorizontal) return;
	// ... compute and write the track's position (manual 2)
}
```

## Applying this in mithril-lynx

This is the genuinely hard case. The component runs on the background
thread; the native node and the gesture registration live on the main
thread. The native side invokes
`onTouchesDown`/`onTouchesMove`/`onTouchesUp` on the thread where the
detector was registered — that is, the main thread, which doesn't run
application code. Wrapping `invoke()` in a promise (as in manuals 1 and 3)
isn't enough here: this isn't a one-off call, it's a callback the native
side fires repeatedly and expects something to answer without perceptible
delay (an `onTouchesMove` in a pan can arrive at frame frequency).

What's needed, then, isn't an API translation but a two-way protocol:

1. The background thread requests "register a gesture detector on the node
   with this selector" — a new message, symmetric to applying a patch.
2. The main thread registers the real `__SetGestureDetector`, with
   callbacks that, instead of running application logic, package up the
   event and forward it to the background thread — the same kind of
   channel that already exists today for forwarding tap events, but meant
   to fire much more often.
3. The background thread receives each forwarded event and runs the
   component's real logic (the logic that today lives directly inside
   `onTouchesMove`), which may end up producing a style write (manual 2)
   back toward the main thread.

This is documented as a design proposal, not a ready-made recipe: whether
the cost of that per-frame round trip is imperceptible or introduces
noticeable lag in a drag is a question that can only be answered by
measuring on a real device, not something that can be decided by reading
code.

## How to test this without a device

This part is 100% real and already exists today: extract the callback
registered in the last `__SetGestureDetector` call and invoke it by hand
via `runWorklet`, with a fake `controller`:

```ts
const lastCallOf = (fn: string) => papiCalls().filter((c) => c.fn === fn).at(-1);

function gestureCallback(name: string) {
	const args = lastCallOf("__SetGestureDetector")?.args;
	const entry = args[3].callbacks.find((c) => c.name === name);
	if (entry == null) throw new Error(`no "${name}" callback registered`);
	return (event, controller) => globalThis.runWorklet(entry.callback, [event, controller]);
}

function touchEvent(clientX, clientY) {
	return { params: { clientX, clientY } };
}

function makeController() {
	return { __SetGestureState() {}, __ConsumeGesture() {} };
}
```

Usage:

```ts
const down = gestureCallback("onTouchesDown");
const move = gestureCallback("onTouchesMove");
const up = gestureCallback("onTouchesUp");
const controller = makeController();

down(touchEvent(0, 0), controller);
move(touchEvent(0, 20), controller);
expect(transformOf()).toBe("translate(0px, 20px)");
up(touchEvent(0, 20), controller);
```

This validates the gesture logic itself (the math, the threshold, the
state exchange) with no hardware needed — what it does NOT validate is the
cross-thread forwarding protocol proposed above, because that protocol
doesn't exist yet. Once it's implemented, this same "extract and fire the
callback by hand" pattern still works to test the component's logic; what
would be new to test is the forwarding channel itself.

## Where this pattern is used

- `src/sheet/sheet.js` — reference case for this manual (drag-to-dismiss).
- `src/swipe-action/swipe-action.js` — horizontal swipe with axis-lock deferred to the second move.
- `src/swiper/swiper.js` — carousel with axis-lock from the first move.
- `src/drawer/drawer.js` — doesn't call this directly, but wraps `Sheet` and inherits its behavior.
