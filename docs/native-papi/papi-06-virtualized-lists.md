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

## Why this doesn't need code to cross the boundary after all

Real Lynx main and background threads are separate JS engine instances —
that's the fact behind every bridge in this whole manual set: no shared
memory, no shared closures, only serializable messages. Every other
pattern in this manual set works around that by sending DATA across (a
method name and params, a style object, touch coordinates) while the CODE
that decides what to do with that data — the app's own component logic —
stays put on the background thread, the only place it ever needs to run.

The first version of this design broke that rule: it ran `renderItem`
itself on the main thread, registered there by a string key
(`registerListRenderer`), because `componentAtIndex` fires on the main
thread and native needs an answer for it. Checking how `@lynx-js/react`
solves the exact same native contract (its own `componentAtIndex`
implementations, `runtime/lib/snapshot/list/list.js` and
`runtime/lib/element-template/runtime/list/list.js`) shows it never runs
render logic inside `componentAtIndex` at all: an item's content is
computed once, as part of the app's own normal render pass, and
`componentAtIndex` only attaches/materializes what's already there.

mithril-lynx now does the analogous thing. `renderItem` runs on the
BACKGROUND thread, through the app's own document — same as every other
component in the app — via `mithril-lynx/list-cell`'s `renderListCell()`.
It produces a self-contained set of construction ops (this project's own
existing flat op format, the same one every other patch already uses) for
that one item, using an off-tree container in the SAME document as the
rest of the app (so the item's real fake-dom nodes land in the same
`document._nodesById` map — a forwarded native event for one of them
dispatches through the normal channel, exactly like any other element's).
The main thread's `componentAtIndex` (mithril-lynx's own
`list-support.js`) never calls `renderItem()` itself; it only replays
those already-computed ops into a real native cell when native asks for a
given index.

## The real, implemented design

`mithril-lynx-ui`'s `List` component takes a plain `renderItem` prop again
— it runs on the background thread, same as `view()`. `items`,
`scrollOrientation`, `style`, gaps are still ordinary data, passed
normally.

On the mithril-lynx side (2.6.0+):

1. `Op.CreateList` creates the real, unmodified native `__CreateList`, with
   `componentAtIndex`/`enqueueComponent` implemented in `list-support.js`.
2. `List`'s own `oncreate`/`onupdate` call `renderListCell()` once per
   item (background thread), each producing `{ typeKey, containerId, ops,
   rootChildIds }`, and ship the whole array via `Op.SetListItems`.
3. `componentAtIndex` looks up the cell for the requested index and
   replays its `ops` into a real native `list-item` wrapper (via the SAME
   `createPatchApplier` every other patch uses, just seeded so the ops'
   root id aliases that wrapper — see `apply-patch.js`'s `registerRoot`).
   Recycling a cell for a different item clears its real children (using
   `rootChildIds`) and replays the new item's ops — a teardown-and-rebuild
   of that cell's content, not a diff against what was there before (a
   real trade-off against the first version's per-cell persistent-document
   diff, made because a diff on recycle would need to know, at the time
   background renders an item, which native cell will end up reusing it —
   information only native has, on the main thread).
4. Any already-attached (currently visible) cell gets re-flushed with its
   newest ops on every `Op.SetListItems` — so a redraw triggered by a tap
   inside a cell (or any other state change reaching this list's items)
   updates what's on screen, not just future `componentAtIndex` calls.

`src/internal/gesture.js`-style thinness doesn't apply here — this
genuinely needed a new primitive in mithril-lynx core
(`src/list-cell.js` + `src/list-support.js`), not just a userspace
wrapper, because a native list's synchronous `componentAtIndex` contract
still needs SOMETHING ready to hand back immediately; it's just that
"ready" now means "already computed by the last render pass," not
"computed fresh, in a second isolated render engine, on this thread."

Real usage, `src/list/list.js`:

```js
oncreate(vnode) {
	const s = vnode.state;
	const { items = [], renderItem, className, style, scrollOrientation, listType, spanCount, mainAxisGap = 0, crossAxisGap = 0 } = vnode.attrs;
	if (typeof renderItem !== "function") {
		throw new Error("mithril-lynx-ui: <List> requires a `renderItem` function.");
	}

	// Same "outside Mithril's own reconciliation" escape hatch every other
	// native-gesture/native-ref component in this project already uses —
	// a native <list> isn't something render.js knows how to diff.
	s.render = renderFactory(); // one render() instance, reused for every cell
	s.list = vnode.dom.ownerDocument.createNativeList({ scrollOrientation, listType, spanCount });
	s.list.setAttribute("id", s.refId); // for scrollTo's own native ref — manual 1
	if (className != null) s.list.className = className;
	vnode.dom.appendChild(s.list);

	if (style != null) s.list.style = style;
	s.list.setAttribute("list-main-axis-gap", mainAxisGap);
	s.list.setAttribute("list-cross-axis-gap", crossAxisGap);
	s.list.setListItems(buildCells(vnode.dom.ownerDocument, s.render, renderItem, items));
},

onupdate(vnode) {
	const s = vnode.state;
	const { items = [], renderItem, style } = vnode.attrs;
	s.list.setListItems(buildCells(vnode.dom.ownerDocument, s.render, renderItem, items)); // re-sends the count delta as insert/remove, and refreshes any attached cell in place — see below
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

`items` still crosses as plain JSON — `renderListCell()`'s output
(`cells`, one entry per item) is what actually goes out over
`Op.SetListItems` now, computed fresh each time from `items`/`renderItem`.
`List` doesn't support a custom `itemKey` function: native's own list-item
identity is what drives its recycling contract, and mithril-lynx's
`Op.CreateList` always keys by the item's own index (`String(cellIndex)`)
— not attempted here.

## What used to be a known gap, and isn't anymore

The first version of this design ran `renderItem` on the main thread, so a
tap handler inside a cell had no background-thread fake-dom node to
dispatch through — no way to reach the app's own state. Since `renderItem`
now runs on the background thread, through the app's own document (see
above), a cell's event handlers are ordinary handlers on ordinary
background-thread nodes, dispatched exactly like any other element's — no
separate reporting convention needed.

What IS still a real, documented trade-off: recycling a cell for a
different item is a teardown-and-rebuild of that cell's real children, not
a diff against what was there before (see mithril-lynx's own
`list-support.js`) — a real cost for content-heavy cells on very large
lists, not attempted to be minimized yet.

## How to test this without a device

Driving `componentAtIndex`/`enqueueComponent` directly, exactly as the
native side would call them, needs no hardware and needs no mock — the
real chain runs for real in tests, the same way `mithril-lynx` core's own
`test/list.test.ts` and `mithril-lynx-ui`'s `test/list.test.ts` both do:

```ts
import { renderListCell } from "mithril-lynx/list-cell";
import { createLynxDocument } from "mithril-lynx"; // or reuse an app's own document
import { createVirtualBackend } from "mithril-lynx"; // see mithril-lynx/test/list.test.ts for the real imports

const document = createLynxDocument(createVirtualBackend());
const render = renderFactory();
const cells = items.map((item, index) => renderListCell(document, render, () => {}, (item, index) => m("text", {}, `${index}:${item}`), item, index));

function requestCell(app, listNode, index, opId = 1) {
	const handle = app.applier.getHandle(listNode._id);
	const listId = __GetElementUniqueID(handle);
	return handle.componentAtIndex(handle, listId, index, opId);
}
```

One real wrinkle, not present anywhere else in this manual set: a list
cell's real, DISPLAYED content is real PAPI elements the main thread
materialized by replaying `renderListCell()`'s ops (list-support.js), so
it never touches the background thread's own visible fake-dom tree — read
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
