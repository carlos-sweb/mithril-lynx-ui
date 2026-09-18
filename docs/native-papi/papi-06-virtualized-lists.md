# 6 — Virtualized lists

## What this solves

A list with thousands of items can't render all of them at once — it needs
to recycle a small number of native cells, handing each one new content as
it scrolls into view. Unlike every previous pattern, the native side owns
scroll position and cell lifecycle: it decides when a cell needs content
and asks the application to provide it, on demand, as the user scrolls.
This is the most complex case in this set because that request is
synchronous — the native side calls in and expects a ready cell back,
immediately, with no round trip possible. It's also the one case where the
answer isn't a mithril-lynx-ui pattern, or even purely a mithril-lynx
primitive: it needs a real, if narrow, convention change in how an app is
structured, because — unlike every earlier manual — the thing crossing the
thread boundary here can't be data. It has to be code.

## The native PAPI involved

- `__CreateList(pageId, componentAtIndex, enqueueComponent, options)` —
  creates the native list and registers two callbacks the native side calls
  back into as it recycles cells.
- `__SetAttribute(listHandle, "update-list-info", {insertAction,
  removeAction, updateAction})` + `__UpdateListCallbacks(listHandle,
  componentAtIndex, enqueueComponent)` — the missing piece: creating the
  list and setting basic attributes alone never triggers
  `componentAtIndex`; the native side only starts requesting cells once
  told to, through this attribute plus a callback re-registration.
- `__AppendElement`, `__GetElementUniqueID`, `__FlushElementTree(handle,
  {triggerLayout, operationID, elementID, listID})` — used inside
  `componentAtIndex` to actually mount a cell's rendered content and flush
  it into the tree.

`componentAtIndex(listHandle, listId, cellIndex, opId)` is called by the
native side, synchronously, whenever it needs content for a given index —
whether that's a brand-new cell or one being reused from the recycle pool.
`enqueueComponent(listHandle, listId, sign)` is called when a cell scrolls
out of view and its content is no longer needed, so it can go back into the
pool keyed by content type.

## Why code, not data, has to cross the boundary

Real Lynx main and background threads are separate JS engine instances —
that's the fact behind every bridge in this whole manual set: no shared
memory, no shared closures, only serializable messages. Every earlier
pattern worked around that by sending DATA across (a method name and
params, a style object, touch coordinates) while the CODE that decides
what to do with that data — the app's own component logic — stayed put on
the background thread, the only place it ever needs to run.

A virtualized list breaks that: `componentAtIndex` fires on the main
thread and needs an answer synchronously. There is no async option, so
there is no way to ask the background thread "what does cell 47 look
like?" and wait for a reply — by the time any reply could arrive, native
has already timed out the request. The render logic that decides what a
cell looks like has to actually run ON the main thread. That means the
app's own `renderItem` function itself — not just data — has to exist
there.

A plain JS closure can't be shipped across a real thread boundary the way
it can be "passed" in a single-process test. So mithril-lynx doesn't try —
an app registers its cell-rendering function directly on the main thread,
by a string key, from its own `main-thread.ts` (a genuinely separate
webpack entry point in this project's build — see `create-mithril-lynx`'s
`lynx.config.ts` — not a stub that can only ever contain
`setupRenderer()`, just one that never had a reason to import anything
else before now):

```js
// main-thread.ts
import { setupRenderer } from "mithril-lynx/main-thread";
import { registerListRenderer } from "mithril-lynx/list-support";
import { renderProductRow } from "./lists.js"; // a plain, shared module — see below

registerListRenderer("products", renderProductRow);
setupRenderer();
```

`./lists.js` is an ordinary module BOTH `main-thread.ts` and
`background.ts` import — the render function itself is only ever defined
once; each thread's own bundle just ends up with its own compiled copy of
that same module (this project's build already produces two genuinely
separate bundles — one per thread — so importing the same source file from
both sides is not a new build capability, it falls out of the entry points
that already exist). `renderProductRow` has to be a pure function of
`(item, index)`: it can't close over background-thread-only state (a
variable from `background.ts`, another component instance, anything that
only exists where the app's own Mithril tree lives), since it also has to
run standalone with nothing but the data it's given.

## The real, implemented design

`mithril-lynx-ui`'s `List` component no longer takes a `renderItem` prop —
it takes a `rendererKey` (the same string passed to
`registerListRenderer`). Everything else — `items`, `scrollOrientation`,
`style`, gaps — is still ordinary data, passed normally.

On the mithril-lynx side (2.5.0+), a new patch op, `Op.CreateList`,
triggers `apply-patch.js` to:

1. Look up the registered render function for that `rendererKey`.
2. Call the real, unmodified native `__CreateList`, with
   `componentAtIndex`/`enqueueComponent` implemented right there.
3. For each requested cell: run a REAL, self-contained Mithril render pass
   — the exact same pieces `background.js` uses for the app's own tree
   (`mithril-runtime`'s real `render()`, `fake-dom.js`, a virtual backend)
   — but applied to itself immediately, via a nested patch applier, on
   THIS thread, instead of crossing a channel. Each cell keeps its own
   persistent fake-dom document, so recycling a cell for a different item
   is a real Mithril diff against its previous content, not a
   teardown-and-rebuild — the same reason a normal redraw doesn't rebuild
   an app's whole tree from scratch either.

This is deliberately not a predictive buffer/window system — there's
nothing to predict. `componentAtIndex` runs the real render, synchronously,
the moment native asks, so it works correctly regardless of list size: a
10-item list and a 10,000-item list cost exactly the same per visible
cell, because nothing is ever pre-rendered ahead of need.

`src/internal/gesture.js`-style thinness doesn't apply here — this
genuinely needed a new primitive in mithril-lynx core
(`src/list-support.js`), not just a userspace wrapper, because nothing in
mithril-lynx-ui's own code runs early enough or on the right thread to
register a main-thread render function itself.

Real usage, `src/list/list.js`:

```js
oncreate(vnode) {
	const s = vnode.state;
	const { items = [], rendererKey, className, style, scrollOrientation, listType, spanCount, mainAxisGap = 0, crossAxisGap = 0 } = vnode.attrs;
	if (typeof rendererKey !== "string") {
		throw new Error("mithril-lynx-ui: <List> requires a `rendererKey`.");
	}

	// Same "outside Mithril's own reconciliation" escape hatch every other
	// native-gesture/native-ref component in this project already uses —
	// a native <list> isn't something render.js knows how to diff.
	s.list = vnode.dom.ownerDocument.createNativeList(rendererKey, { scrollOrientation, listType, spanCount });
	s.list.setAttribute("id", s.refId); // for scrollTo's own native ref — manual 1
	if (className != null) s.list.className = className;
	vnode.dom.appendChild(s.list);

	if (style != null) s.list.style = style;
	s.list.setAttribute("list-main-axis-gap", mainAxisGap);
	s.list.setAttribute("list-cross-axis-gap", crossAxisGap);
	s.list.setListItems(items);
},

onupdate(vnode) {
	const s = vnode.state;
	const { items = [], style } = vnode.attrs;
	s.list.setListItems(items); // re-sends the count delta as insert/remove — see below
	if (style != null && Object.keys(style).length > 0) s.list.style = style;
},
```

`s.list` is a real fake-dom element (`LynxDocument#createNativeList()`,
new alongside `createElement()`), not a selector-query-based ref — since
this runs on the background thread with a direct object reference already
in hand (no async gap to bridge), style/attribute writes on it go through
its own ordinary `setAttribute`/`style` setter, pushing the exact same ops
as any other element. Only the imperative `scrollTo` (an `invoke()` call
made later, from arbitrary app code, not from this component's own
render) needs manual 1's id-based bridge.

`items` crosses as plain JSON (`Op.SetListItems`) — it must be
JSON-serializable, the same constraint `renderItem`'s own `item` argument
carries. `List` doesn't support a custom `itemKey` function anymore, for
the identical reason `renderItem` itself had to move: a key-deriving
closure can't cross the boundary either. Every cell keys by its own index.

## Known, real gap this doesn't solve

An event handler inside a `rendererKey`'s own vnode tree (a tap on a list
row) fires entirely on the main thread, with whatever `renderProductRow`
closed over there — which can't include the app's own state, by the same
constraint that put it there in the first place. There is no
background-thread fake-dom node for list cell content to dispatch an event
through, unlike every other element in the app. Reaching back into app
state from inside a list cell (e.g. "tapping a row selects it") needs a
deliberate reporting convention on top of this — not built yet. `List`
today is correct and complete for read-only, scrollable content; making a
cell's own interactions reach the app is the next real piece of work here,
not a device-verification question like manual 5's open items.

## How to test this without a device

Driving `componentAtIndex`/`enqueueComponent` directly, exactly as the
native side would call them, needs no hardware and needs no mock — the
real chain runs for real in tests, the same way `mithril-lynx` core's own
`test/list.test.ts` and `mithril-lynx-ui`'s `test/list.test.ts` both do:

```ts
import { registerListRenderer } from "mithril-lynx/list-support";

registerListRenderer("my-list", (item, index) => m("text", {}, `${index}:${item}`));

function requestCell(app, listNode, index, opId = 1) {
	const handle = app.applier.getHandle(listNode._id);
	const listId = __GetElementUniqueID(handle);
	return handle.componentAtIndex(handle, listId, index, opId);
}
```

One real wrinkle, not present anywhere else in this manual set: list cell
content is real PAPI elements created directly by `componentAtIndex`, so
it never touches the background thread's own fake-dom tree at all — read
it off the REAL handle (`app.applier.getHandle(listNode._id).firstChild`,
walking real DOM nodes), not off a fake-dom `TestNode`'s own
`.firstChild`, which will always be `null` for list content.

## A real finding: `List`'s own top-level node is a placeholder, not the list

`List`'s `view()` returns a plain `m("view")` — the real native `<list>` is
appended to it imperatively, in `oncreate`, as that placeholder's own
`firstChild`. Reading `List`'s rendered node directly (as `list.test.ts`
does, mounting `List` on its own) gets you the placeholder; its `firstChild`
is the actual list. This is easy to get wrong one level up: a caller that
composes `List` inside its own tree (`feed-list.js` does, wrapping it in a
`<refresh>`) and walks the fake-dom tree to find it has to account for BOTH
levels — the composing parent's own child pointer lands on `List`'s
placeholder `<view>`, not the list. `feed-list.test.ts`'s own "pushes
`<refresh>`'s own measured layout size..." test got exactly this wrong
first (asserted on the placeholder's un-styled handle and silently read back
`''` instead of a real error, since the placeholder legitimately has no
style of its own) — fixed by walking one level deeper
(`...nextSibling!.firstChild!`) to reach the real list handle. Any consumer
reading a real list's PAPI handle off a `List` composed inside another
component needs the same extra hop.

## Where this pattern is used

- `src/list/list.js` — reference case for this manual.
- `src/feed-list/feed-list.js` — composes `List`, plus its own refresh invocation (manual 1).
