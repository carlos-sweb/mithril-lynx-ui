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
once — and the first case where the answer isn't a mithril-lynx-ui pattern
at all, but a new primitive added to mithril-lynx itself (2.4.0+).

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

The native side doesn't call the JS function directly — it calls a global
dispatcher, `runWorklet(ctx, params)`, looking up the function registered
under `ctx._wkltId`. Any callback passed to `__SetGestureDetector` first
has to go through a "worklet" registration (`registerWorklet`/`runWorklet`,
lazily installed on `globalThis` the first time a gesture is registered).
This is a real native requirement, not specific to any one package.

## Why this can't be solved at the mithril-lynx-ui level

Every earlier manual's bridge (createSelectorQuery-based refs, style
writes) works because the thing being bridged is a single request/response
or a fire-and-forget write — mithril-lynx-ui can build that entirely from
userspace, using primitives Lynx already exposes globally. A gesture is
different: the native side calls back into whichever thread registered the
detector, repeatedly, and a component's own code only ever runs on the
background thread. There is no selector-query equivalent for "let native
call me back" — the only place code can intercept that call is on the main
thread itself, which mithril-lynx-ui's component code never touches. This
is why the primitive lives in mithril-lynx (2.4.0's `Op.SetGestureDetector`
patch op), not in an internal helper here.

## The real, implemented design

A component calls a fake-dom node's own `setGestureDetector(type,
arenaPolicy)` — a new method on `LynxElement`, callable directly because a
component already holds a real fake-dom node reference synchronously
(`vnode.dom`, or a child of it), unlike the id-based bridge the earlier
manuals needed. This pushes a new `Op.SetGestureDetector` patch op; when
mithril-lynx's `apply-patch.js` applies it on the main thread, it:

1. Registers the real `__SetGestureDetector`, with three synthetic
   callbacks (`onTouchesDown`/`onTouchesMove`/`onTouchesUp`).
2. Evaluates a small, generic **arena policy** synchronously, inside those
   callbacks, using only the event's own coordinates — no round trip to
   the background thread for this part. Two policies cover every real
   consumer in this codebase:
   - `{ mode: "claim" }` — claim on touches-down, hold it for the whole
     gesture (sheet.js: a vertical drag with nothing else to negotiate).
   - `{ mode: "axis-lock", axis: "horizontal" | "vertical", referenceMoves }`
     — claim eagerly, then release+fail if the losing axis wins once
     there's a real delta to judge. `referenceMoves: 0` decides on the
     first move, using touches-down as the reference (swipe-action.js);
     `referenceMoves: 1` uses the first move as the reference and decides
     on the second (swiper.js, which needs a real move before it has any
     delta to compare at all).
3. Forwards each callback's raw coordinates to the background thread as a
   plain event — `"gesturedown"`/`"gesturemove"`/`"gestureup"` — through
   the exact same `onEvent` channel `Op.AddEvent` already uses for every
   other native event. Nothing new on the background-thread side: a
   component just adds `ongesturedown`/`ongesturemove`/`ongestureup`
   handlers to the same node's own attrs, reading `event.clientX`/
   `event.clientY`, exactly like `ontouchstart` already works.

The controller-based `interceptGesture()`/`fail()` calls the single-thread
reference implementation above made from app code are gone entirely —
there's no controller object in app code to call them on anymore. The
arena decision already happened by the time the background thread sees the
event at all.

`src/internal/gesture.js` is the whole mithril-lynx-ui side of this — a
few lines wrapping the two fake-dom methods:

```js
export function registerGesture(node, type, arenaPolicy) {
	const gestureId = node.setGestureDetector(type, arenaPolicy);
	return {
		remove() {
			node.removeGestureDetector(gestureId);
		},
	};
}
```

Real usage, `src/sheet/sheet.js` (vertical drag-to-dismiss — `{mode:
"claim"}`, since a sheet's content is a modal surface with nothing else
competing for the gesture):

```js
oncreate(vnode) {
	const s = vnode.state;
	s.innerEl = createRef(s.refId); // manual 2's style-write bridge, unrelated to the gesture itself
	if (!s.ctx.enableDragToClose) return;
	s.gesture = registerGesture(vnode.dom.firstChild, "native", { mode: "claim" });
},

onremove(vnode) {
	if (vnode.state.gesture != null) vnode.state.gesture.remove();
},

view(vnode) {
	// ...
	const innerContent = m(
		"view",
		{
			id: s.refId,
			ongesturedown: (e) => {
				s.startX = e.clientX;
				s.startY = e.clientY;
				e.redraw = false; // see below
			},
			ongesturemove: (e) => {
				const dx = e.clientX - s.startX;
				const dy = e.clientY - s.startY;
				s.dragOffset = Math.max(0, closingDelta(ctx.resolvedSide, dx, dy));
				s.innerEl.setStyleProperty("transform", sheetDragTransform(ctx.resolvedSide, s.dragOffset));
				e.redraw = false;
			},
			ongestureup: (e) => {
				if (s.dragOffset >= ctx.dismissThreshold) ctx.setUncontrolledShow(false);
				s.dragOffset = 0;
				s.innerEl.setStyleProperty("transform", sheetDragTransform(ctx.resolvedSide, 0));
				e.redraw = false;
			},
		},
		vnode.children,
	);
	// ...
},
```

`e.redraw = false` on every handler: mithril-runtime's real `EventDict`
auto-redraws after ANY dispatched event unless told not to (`if (ev.redraw
!== false) redraw()`, confirmed reading `render/render.js` directly) — a
gesture event is exactly the high-frequency case manual 2 already
established shouldn't pay for a diff on every move. `ongestureup`'s own
state changes, when they happen, already trigger their own `redraw()`
(`setUncontrolledShow` does), so nothing is lost by opting out of the
automatic one.

`src/swiper/swiper.js` (axis-lock, deciding on the second move):

```js
oncreate(vnode) {
	vnode.state.gesture = registerGesture(vnode.dom, "native", { mode: "axis-lock", axis: "horizontal", referenceMoves: 1 });
},
```
— with `ongesturemove` written exactly like a plain event handler, no
axis-tracking of its own: that logic now lives entirely in mithril-lynx's
`apply-patch.js` (`createArenaTracker`), shared by every consumer instead
of hand-rolled per component.

## How to test this without a device

Real, implemented, and now much simpler than the single-thread reference
pattern: `test/harness.ts` exports `gestureCallbacksOf(app, node)`,
`makeGestureController()`, and `gestureTouch(x, y)`. A gesture's arena
decision itself is exercised by extracting the real callbacks
`Op.SetGestureDetector` registered (the testing environment's own
`__SetGestureDetector` simulation just records `{id, type, config,
relationMap}` onto the element — nothing to mock) and invoking them
through `runWorklet`, same as native would:

```ts
const inner = app.root.firstChild!;
const callbacks = gestureCallbacksOf(app, inner);
const controller = makeGestureController();

callbacks.onTouchesDown(gestureTouch(0, 0), controller);
callbacks.onTouchesMove(gestureTouch(0, 20), controller);
expect(transformOf(app, inner)).toBe("translate(0px, 20px)");
```

Because `harness.ts`'s `mount()` now wires a real `onEvent` (dispatching
straight onto the matching background-thread fake-dom node, the same way
`background.js`'s own channel does internally — the one hop this harness
otherwise deliberately skips for every other event, see its own header),
firing a gesture callback this way exercises the FULL real path: native
registration → the arena policy → event forwarding → the component's own
`ongesturedown`/`ongesturemove`/`ongestureup` handlers. This is stronger
test coverage than the single-thread version ever had, not a compromise —
mithril-lynx core's own `test/gesture.test.ts` covers the arena-policy
logic itself in isolation (both policies, both `referenceMoves` values,
and the event-forwarding path) at the primitive level.

## What's still genuinely unverified

The arena-policy timing (claim on down; axis-lock deciding on move 1 or 2)
mirrors what the original single-thread implementation already did,
device-verified once. What's NEW here — evaluating that decision inside
mithril-lynx's own `apply-patch.js` instead of directly in app code, and
forwarding the resulting events to the background thread afterward — has
not been confirmed to feel the same on a real device. Two concerns, in
order of how likely they are to matter:

1. **Forwarding overhead.** Every `gesturemove` now does real work on the
   main thread (the arena check) plus a cross-thread dispatch, even though
   the actual APP logic (computing a transform, writing it back) still
   only happens once that event lands on the background thread. Whether
   this adds perceptible lag to a drag, especially the style write that
   typically follows immediately after, is exactly the open question the
   previous version of this manual described — now with a concrete
   implementation to actually measure, not just a proposal.
2. **Arena-policy generality.** The two policies (`claim`, `axis-lock`)
   cover every consumer in this codebase today. A future gesture need that
   doesn't fit either shape (e.g. a real `waitFor`/`simultaneousWith`
   relation to another gesture, which the original `createGesture()` API
   supported and this one deliberately doesn't) would need a new policy
   added to `apply-patch.js`'s `createArenaTracker`, not something a
   component can express on its own.

## Where this pattern is used

- `src/sheet/sheet.js` — reference case for this manual (drag-to-dismiss, `{mode:"claim"}`).
- `src/swipe-action/swipe-action.js` — horizontal swipe, axis-lock deferred to the first move (`referenceMoves: 0`).
- `src/swiper/swiper.js` — carousel, axis-lock deferred to the second move (`referenceMoves: 1`).
- `src/drawer/drawer.js` — doesn't call this directly, but wraps `Sheet` and inherits its behavior.
