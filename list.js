// list.js
//
// Mithril port of @lynx-js/lynx-ui-list's List (Apache-2.0 — see ./NOTICE) —
// but NOT a line-by-line one. Real source (513 lines) read in full first,
// and it turns out to be mostly a very large, direct pass-through of native
// `<list>` attributes (exposure props, iOS-only touch/gesture knobs, a
// MTS-driven `main-thread:bindlayoutchange`-based auto-max-size feature,
// a three-step MTS `scrollIntoID` that measures a target cell and computes
// an aligned offset by hand) on top of a SINGLE real primitive: native's
// own recycling `<list>` element. mithril-lynx CORE already has that
// primitive, real and device-verified — `mithril-lynx/list`'s
// `createList()` (project plan Phase 8, Tier 2). This file is the
// DECLARATIVE MITHRIL WRAPPER the project plan asked for around it, not a
// rebuild of everything upstream layers on top.
//
// Scope cuts, deliberate and documented rather than silently dropped:
//   - No MTS `listMaxSize`/`useMaxSize` (shrink-to-content-up-to-a-max,
//     computed from bindlayoutchange on the main thread). Opt-in even
//     upstream (only active when `listMaxSize` is passed) — add a
//     registerHandler-based port here if a real need for it shows up.
//   - No `scrollIntoID` (the three-step "measure a specific cell, compute
//     an aligned offset, scroll to it" dance) — `scrollTo(index)` (below)
//     covers the common "jump to position" case; scrolling to align a
//     SPECIFIC element's edge is a real but narrower need.
//   - No autoScroll/getVisibleCells/exposure-id/exposure-scene/iOS-only
//     touch-propagation knobs. All straightforward to add later as plain
//     passthrough attrs if something needs them; core's own createList()
//     doesn't expose a generic "extra native attrs" bag today, so adding
//     one there is the right place, not re-deriving list wiring here.
//
// What IS carried over faithfully: native requires scroll-orientation/
// list-type/span-count and each item's item-key unconditionally (see
// mithril-lynx's own list.js header, itself sourced from a real device
// trace) — createList() already enforces exactly that; this wrapper's job
// is turning an ordinary `items` array + `renderItem(item, index)` into
// the index-based `renderItem(index)` shape createList() itself expects,
// and re-attaching the SAME list instance's renderItem/items closures
// fresh every render so a later native recycling call always sees current
// data — a fresh createList() per render would tear down and rebuild
// native's entire scroll position and cell pool for no reason.

import m from "mithril";
import { createList } from "mithril-lynx/list";
import { wrapElement } from "mithril-lynx/element";

export const List = {
	oninit(vnode) {
		vnode.state.listRef = {};
	},

	oncreate(vnode) {
		const s = vnode.state;
		const { items = [], renderItem, itemKey, className, style, scrollOrientation, listType, spanCount, mainAxisGap = 0, crossAxisGap = 0 } = vnode.attrs;
		// Refreshed on every render (onupdate below) — createList()'s own
		// renderItem/itemKey callbacks close over THESE fields rather than
		// the attrs available at creation time, so native recycling a cell
		// long after a data change still sees the current items/renderItem.
		s.items = items;
		s.renderItem = renderItem;
		s.itemKey = itemKey;

		s.list = createList(vnode.dom, {
			itemCount: items.length,
			renderItem: (index) => s.renderItem(s.items[index], index),
			itemKey: s.itemKey ? (index) => s.itemKey(s.items[index], index) : undefined,
			className,
			scrollOrientation,
			listType,
			spanCount,
		});
		vnode.dom.appendChild(s.list);

		const ref = wrapElement(s.list);

		// createList() sets scroll-orientation/list-type/span-count/className
		// itself but knows nothing about style or item spacing.
		// width/height (or a flex ancestor) is what actually gives the list a
		// scrollable area, so style is pushed here directly rather than left
		// for a consumer to discover the hard way that nothing scrolls
		// without it. Gaps are real native attributes (confirmed against the
		// real @lynx-js/lynx-ui-list source), not CSS — core's createList()
		// doesn't set them itself, so this wrapper does.
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
		if (style != null) wrapElement(s.list).setStyleProperties(style);
	},

	// A plain placeholder view Mithril creates and diffs normally; the real
	// native <list> is appended to it imperatively in oncreate and is
	// otherwise invisible to Mithril's own tree (same "escape hatch"
	// contract as core's own createList()/createGesture()). No style here —
	// it exists only to give oncreate somewhere to hang the real list off
	// of, and sizes to wrap that single child.
	view() {
		return m("view");
	},
};
