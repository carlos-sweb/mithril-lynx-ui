# 7 — Native `<list>`, redesigned (mithril-lynx 3.0.0)

Supersedes [papi-06](./papi-06-virtualized-lists.md), which describes the
2.x design this replaces.

## What changed and why

The 2.x list re-rendered every item into a fresh off-tree container on every
redraw, shipped those ops through a list-specific protocol
(`Op.CreateList`/`Op.SetListItems`), keyed native items by index, and only
told native about items added or removed at the end. That design:

- misidentified items on any middle insert, removal or reorder, which the
  official docs name as the cause of "disorder and flickering";
- never sent `updateAction` or any `<list-item>` platform info (`full-span`,
  sticky slots, estimated size, reuse pools);
- exposed 7 of the list's attributes and none of its events;
- could not express typed attributes (`bounces: false`, the `item-snap`
  object), because Mithril turns `false` into an attribute removal and
  fake-dom stringified everything;
- leaked on both threads on every redraw and never ran `onremove`;
- never neutralized native callbacks after the list was destroyed.

In 3.0.0, `list` and `list-item` are **ordinary Mithril elements**. This
follows the model @lynx-js/react adopted for its element-template runtime
(`runtime/lib/element-template/runtime/list/list.js`).

## How it works

```js
m("list", { "list-type": "single", "span-count": 1, "scroll-orientation": "vertical",
            "lower-threshold-item-count": 2, onscrolltolower: loadMore },
  items.map((it) => m("list-item", { key: it.id, "item-key": it.id }, row(it))))
```

- **Background thread.** Items are normal keyed children. Mithril's own
  keyed diff produces the inserts, removes, moves and content updates;
  items get their normal lifecycle hooks, events and gestures.
- **Typed attributes.** fake-dom exposes every catalogued `list`/`list-item`
  attribute (mithril-lynx `src/list-attributes.js`) as a real property on
  the element. That makes Mithril take its property path
  (`key in vnode.dom` → `vnode.dom[key] = value`), so raw values reach
  native: `false`, numbers, objects. Unchanged object attributes are not
  re-sent on redraw.
- **Main thread** (mithril-lynx `src/list-runtime.js`):
  - `list` is created with `__CreateList(pageId, componentAtIndex,
    enqueueComponent, {}, componentAtIndexes)`.
  - Ops that insert or remove a list's child do **not** touch the native
    tree. They update the list's logical item order and record the change.
  - At the end of every patch, each list that changed gets
    `__SetAttribute(list, "update-list-info", { insertAction, removeAction,
    updateAction })` and `__UpdateListCallbacks(...)`, before the page flush.
    Insert and update actions carry the item's platform info.
  - `componentAtIndex(index)` attaches that item's **existing** element
    tree before the next attached item and flushes it; `componentAtIndexes`
    does the same for a batch with one list flush; `enqueueComponent`
    detaches it. Nothing is rendered inside a native callback.
  - Removing the list, or the page's `__DestroyLifetime`, calls
    `__UpdateListCallbacks(list, () => -1, () => {}, () => {})`.

Trade-off: every item keeps its element tree for its whole life; only the
attached ones have native UI views. That is the same trade-off ReactLynx
makes, and is sized for lists up to a few thousand items.

## Verified on a real device

Android (Samsung SM-A075M, Lynx Go), with `non-contact`'s country picker
migrated to `list` (sticky letter headers added for the test):

- Fast scrolling in both directions keeps items in order (2.x scrambled them).
- Search filtering — bulk middle removals and re-insertions, typed fast and
  repeatedly — renders correctly, with no crash and no stale cells.
- `sticky` + `sticky-top` + `full-span` + `reuse-identifier` headers stick
  and hand over correctly.
- `scrollstatechange` (states 2 → 3 → 1), `layoutcomplete` (with
  `diffResult`) and `scrolltolower` (with `lower-threshold-item-count`) reach
  the background handlers.
- `scrollToPosition` with `itemKey` jumps to the right item.
- Process memory (PSS): +12 MB for ~250 rows, +77 MB for ~2,000 rows
  (each row has an SVG flag), no crash.

**The removal contract native expects** (found on the device, encoded in
`list-runtime.js` and its tests): an on-screen item that is removed must be
detached from the list element only **after** the patch's
`update-list-info` has been flushed. Detaching it before crashes native
(SIGSEGV after `[List] Fail to erase item holder`); never detaching it leaves
its element as an orphan child of the list, because native never calls
`enqueueComponent` for removed items.

## Known limitation: `update-animation`

With `update-animation="default"`, native animates removed cells and crashes
when the animation ends if their elements were detached. mithril-lynx
therefore leaves removed items attached on such lists (no crash, but their
elements accumulate as orphans, and stale cells were seen on screen) and
logs a warning. Don't use `update-animation` in production until this is
solved. Full evidence, hypotheses and next steps: mithril-lynx's
[`UPDATE_ANIMATION_GAP.md`](https://github.com/carlos-sweb/mithril-lynx/blob/main/UPDATE_ANIMATION_GAP.md).

Native also logs `[List] Fail to erase item holder at pos = N` (non-fatal)
during bulk removals, with or without mithril-lynx detaching anything.

## Coverage

| Area | Supported |
|---|---|
| `<list>` attributes (21) | `list-type`, `span-count`, `scroll-orientation`, `enable-scroll`, `enable-nested-scroll`, `sticky`, `sticky-offset`, `bounces`, `initial-scroll-index`, `need-visible-item-info`, `upper-threshold-item-count`, `lower-threshold-item-count`, `scroll-event-throttle`, `item-snap`, `update-animation`, `need-layout-complete-info`, `layout-id`, `preload-buffer-count`, `scroll-bar-enable`, `harmony-scroll-edge-effect`, `experimental-recycle-sticky-item` |
| List CSS | `list-main-axis-gap`, `list-cross-axis-gap` (in `style`, or List's `mainAxisGap`/`crossAxisGap`) |
| `<list-item>` attributes | `item-key`, `full-span`, `sticky-top`, `sticky-bottom`, `estimated-main-axis-size-px` (and legacy `estimated-height`, `estimated-height-px`), `reuse-identifier`, `recyclable` |
| Events | `onscroll`, `onscrolltoupper`, `onscrolltolower`, `onscrollstatechange`, `onlayoutcomplete`, `onsnap` (`onscroll` redraws are coalesced to one per frame) |
| Methods | `scrollToPosition`, `scrollBy`, `autoScroll`, `getVisibleCells` (List's `listRef`, or a selector query on the list's `id`) |

## Using `List` (mithril-lynx-ui)

```js
m(List, {
  items,
  renderItem: (item) => m(Row, { item }),
  getItemKey: (item) => item.id,                      // required for correct updates
  getItemAttrs: (item) => (item.header ? { "full-span": true, "sticky-top": true } : null),
  style: { height: "100%" },
  sticky: true,
  "lower-threshold-item-count": 3,
  onscrolltolower: loadMore,
  listRef,                                            // scrollToPosition / scrollBy / autoScroll / getVisibleCells / scrollTo
});
```

`List` now renders the `<list>` itself (no wrapper `<view>`).

## Migrating an app

1. Update `mithril-lynx` to `3.x` (pin the exact version) and rebuild **both
   bundles** together — the patch `PROTOCOL_VERSION` changed.
2. If you used `mithril-lynx/list-cell`, `mithril-lynx/list-support`,
   `document.createNativeList()` or `setListItems()`: render
   `m("list", …)` / `m("list-item", …)` instead (or use `List`).
3. Give every item a unique, stable key and use it for both `key` and
   `item-key` (`getItemKey` in `List`).
4. Replace a `scroll-view` that renders many repeated rows with a `list`:
   give the list a resolved size, and wrap each row in a `list-item`.
5. Booleans for list attributes can now be real booleans (`bounces: false`);
   `nativeBool()` is no longer needed for them.
6. Check on a device: scrolling and recycling, filtering/reordering,
   `sticky`, `item-snap`, `scrolltolower`, `scrollToPosition` with
   `itemKey`. Avoid `update-animation` for now (see above).
