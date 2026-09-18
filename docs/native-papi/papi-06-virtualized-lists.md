# 6 — Virtualized lists

## What this solves

A list with thousands of items can't render all of them at once — it needs
to recycle a small number of native cells, handing each one new content as
it scrolls into view. Unlike every previous pattern, the native side owns
scroll position and cell lifecycle: it decides when a cell needs content
and asks the application to provide it, on demand, as the user scrolls.
This is the most complex case in this set because that request is
synchronous — the native side calls in and expects a ready cell back,
immediately, with no round trip possible.

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

## What an implementation looks like

```js
function typeKeyOf(vnode) {
	return typeof vnode.tag === "string" ? vnode.tag : (vnode.tag && vnode.tag.name) || "default";
}

function createList(parentNode, options) {
	const {
		itemCount, renderItem, itemKey, className,
		scrollOrientation = "vertical", listType = "single", spanCount = 1,
	} = options;
	let count = itemCount;
	const pageId = parentNode.ownerDocument._pageId;
	const keyOf = typeof itemKey === "function" ? itemKey : (index) => String(index);

	const recycleMap = new Map();
	const signMap = new Map();

	function bindFreshItem(listHandle, listId, cellIndex, opId, vnode, typeKey) {
		const itemWrapper = parentNode.ownerDocument.createElement("list-item");
		__SetAttribute(itemWrapper._handle, "item-key", keyOf(cellIndex));
		__AppendElement(listHandle, itemWrapper._handle);
		renderItemContent(itemWrapper, vnode); // a dedicated render pass for this cell's content

		const sign = __GetElementUniqueID(itemWrapper._handle);
		signMap.set(sign, { wrapper: itemWrapper, typeKey });
		__FlushElementTree(itemWrapper._handle, { triggerLayout: true, operationID: opId, elementID: sign, listID: listId });
		return sign;
	}

	function bindRecycledItem(listId, cellIndex, opId, vnode, pool) {
		const [sign, entry] = pool.entries().next().value;
		pool.delete(sign);
		__SetAttribute(entry.wrapper._handle, "item-key", keyOf(cellIndex));
		renderItemContent(entry.wrapper, vnode);
		signMap.set(sign, entry);
		__FlushElementTree(entry.wrapper._handle, { triggerLayout: true, operationID: opId, elementID: sign, listID: listId });
		return sign;
	}

	function componentAtIndex(listHandle, listId, cellIndex, opId) {
		if (cellIndex < 0 || cellIndex >= count) {
			throw new Error(`list: cellIndex ${cellIndex} out of range (itemCount=${count})`);
		}
		const vnode = renderItem(cellIndex);
		const typeKey = typeKeyOf(vnode);
		const pool = recycleMap.get(typeKey);
		if (pool && pool.size > 0) return bindRecycledItem(listId, cellIndex, opId, vnode, pool);
		return bindFreshItem(listHandle, listId, cellIndex, opId, vnode, typeKey);
	}

	function enqueueComponent(_listHandle, _listId, sign) {
		const entry = signMap.get(sign);
		if (entry == null) return;
		signMap.delete(sign);
		if (!recycleMap.has(entry.typeKey)) recycleMap.set(entry.typeKey, new Map());
		recycleMap.get(entry.typeKey).set(sign, entry);
	}

	function sendListInfo(insertAction, removeAction, updateAction) {
		__SetAttribute(listHandle, "update-list-info", { insertAction, removeAction, updateAction });
		__UpdateListCallbacks(listHandle, componentAtIndex, enqueueComponent);
	}

	const listHandle = __CreateList(pageId, componentAtIndex, enqueueComponent, {});
	__SetAttribute(listHandle, "scroll-orientation", scrollOrientation);
	__SetAttribute(listHandle, "list-type", listType);
	__SetAttribute(listHandle, "span-count", String(spanCount));
	if (className != null) __SetClasses(listHandle, className);

	sendListInfo(
		Array.from({ length: count }, (_, position) => ({ position, type: "cell", "item-key": keyOf(position) })),
		[], [],
	);

	return {
		_handle: listHandle,
		nodeType: 1,
		setItemCount(nextCount) {
			if (nextCount === count) return;
			if (nextCount > count) {
				sendListInfo(
					Array.from({ length: nextCount - count }, (_, i) => ({ position: count + i, type: "cell", "item-key": keyOf(count + i) })),
					[], [],
				);
			} else {
				sendListInfo([], Array.from({ length: count - nextCount }, (_, i) => nextCount + i), []);
			}
			count = nextCount;
		},
	};
}
```

Real usage, `src/list/list.js` — adapting an `items` array + a
`renderItem(item, index)` shape into the index-based `renderItem(index)`
shape `createList()` expects, plus attributes and an imperative
`scrollTo`:

```js
oncreate(vnode) {
	const s = vnode.state;
	const { items = [], renderItem, itemKey, className, style, scrollOrientation, listType, spanCount, mainAxisGap = 0, crossAxisGap = 0 } = vnode.attrs;
	s.items = items;
	s.renderItem = renderItem;
	s.itemKey = itemKey;

	s.list = createList(vnode.dom, {
		itemCount: items.length,
		renderItem: (index) => s.renderItem(s.items[index], index),
		itemKey: s.itemKey ? (index) => s.itemKey(s.items[index], index) : undefined,
		className, scrollOrientation, listType, spanCount,
	});
	vnode.dom.appendChild(s.list);

	const ref = wrapElement(s.list);
	if (style != null) ref.setStyleProperties(style);
	ref.setAttribute("list-main-axis-gap", mainAxisGap);
	ref.setAttribute("list-cross-axis-gap", crossAxisGap);
	s.listRef.scrollTo = (index, options) =>
		ref.invoke("scrollToPosition", Object.assign({ position: index, index, useScroller: true }, options));
	if (vnode.attrs.listRef != null) Object.assign(vnode.attrs.listRef, s.listRef);
},

onupdate(vnode) {
	const s = vnode.state;
	const { items = [], renderItem, itemKey, style } = vnode.attrs;
	s.items = items;
	s.renderItem = renderItem;
	s.itemKey = itemKey;
	s.list.setItemCount(items.length);
	if (style != null && Object.keys(style).length > 0) wrapElement(s.list).setStyleProperties(style);
},
```

`src/feed-list/feed-list.js` composes `List` for the scrollable content and
adds a native `<refresh>` wrapper plus an infinite-scroll footer sentinel
(the refresh part is the manual 1 pattern — `invoke("autoStartRefresh")` /
`invoke("finishRefresh")`).

## Applying this in mithril-lynx

This is the hardest case in the set. `componentAtIndex` is a **synchronous**
callback — the native side calls it and expects the cell back already
rendered, right there, with no way to "ask the background thread and wait"
without blocking the native side. None of the async-bridge patterns from
the earlier manuals apply here: there's no promise to return, no time to
cross a thread boundary and come back.

What this needs isn't a translation of the API but a different design: the
background thread would have to keep a pre-rendered buffer of cells — a
window around the currently visible index, the way React Native's
`VirtualizedList` works — instead of responding on demand.
`componentAtIndex` on the main thread would then read from an already
populated local cache, never asking live. This means:

1. The background thread tracks scroll position (or a reasonable
   approximation of it) and proactively renders a window of items ahead of
   time, shipping them as ordinary patches before they're needed.
2. The main thread's `componentAtIndex` implementation looks up the
   requested index in that local cache. If it's there, it uses it
   synchronously, exactly like today. If it's not there yet (a fast scroll
   outrunning the buffer), it has no async option — it has to either serve
   a placeholder or accept a visible pop-in once the real content catches
   up.
3. `enqueueComponent` (a cell scrolling out of view) also needs to inform
   the background thread the buffer window moved, so it can render the
   next batch and discard cells that are no longer needed.

This is documented as a design proposal, not a ready-made recipe: the right
buffer window size, prefetch strategy, and what happens on a fast fling
that outruns the buffer are all things that need to be measured on a real
device, not decided by reading code. This is a bigger redesign than any
other pattern in this set — it's fair to treat list virtualization as its
own project, not a quick port.

## How to test this without a device

Driving `componentAtIndex`/`enqueueComponent` directly, exactly as the
native side would call them, is already possible today and needs no
hardware:

```ts
function requestCell(list, index, opId = 1) {
	const listId = __GetElementUniqueID(list._handle);
	return list._handle.componentAtIndex(list._handle, listId, index, opId);
}
```

Usage:

```ts
it("renderItem(item, index) receives the actual item, not just the index", () => {
	const items = ["Alpha", "Bravo", "Charlie"];
	const root = mount(() => m(List, { items, renderItem: (item) => m("text", {}, item) }));
	const list = root.firstChild.firstChild;

	requestCell(list, 1);
	const listItem = list.firstChild;
	expect(listItem._tag).toBe("list-item");
	expect(listItem.textContent).toBe("Bravo");
});
```

`list._handle` here is `createList()`'s own returned `listHandle` object,
with `componentAtIndex`/`enqueueComponent` attached directly onto it by the
test environment's `__CreateList` implementation — the test calls
`list._handle.componentAtIndex(...)` as if the native side were requesting
that cell. This same helper is exactly what should be used to validate any
future buffer-based prototype: it doesn't care whether the cell came from
an on-demand render or from a pre-filled cache, only that the right content
comes back for a given index.

## Where this pattern is used

- `src/list/list.js` — reference case for this manual.
- `src/feed-list/feed-list.js` — composes `List`, plus its own refresh invocation (manual 1).
