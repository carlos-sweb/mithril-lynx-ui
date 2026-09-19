// list.js
//
// Mithril port of @lynx-js/lynx-ui-list's List (Apache-2.0 — see ./NOTICE) —
// but NOT a line-by-line one. Real source (513 lines) read in full first,
// and it turns out to be mostly a very large, direct pass-through of native
// `<list>` attributes (exposure props, iOS-only touch/gesture knobs, a
// MTS-driven `main-thread:bindlayoutchange`-based auto-max-size feature,
// a three-step MTS `scrollIntoID` that measures a target cell and computes
// an aligned offset by hand) on top of a SINGLE real primitive: native's
// own recycling `<list>` element. mithril-lynx CORE has that primitive,
// real and device-verified — mithril-lynx's own Op.CreateList (2.6.0+, see
// docs/native-papi/papi-06-virtualized-lists.md). This file is the
// DECLARATIVE MITHRIL WRAPPER around it, not a rebuild of everything
// upstream layers on top.
//
// `renderItem` runs HERE, on the background thread, same as everything else
// this component does — mithril-lynx/list-cell's renderListCell() computes
// each item's real construction ops through this SAME document (the one
// `vnode.dom` already belongs to), so a cell's own event handlers dispatch
// through a real background-thread fake-dom node exactly like any other
// element's. The main thread (mithril-lynx's own list-support.js) never
// calls renderItem() itself — it only replays those already-computed ops
// when native's componentAtIndex asks for a given cell.
//
// Known, deliberate gap: no custom `itemKey` function. A key-deriving
// closure has the same real constraint as anything else that runs
// per-render — it CAN run on the background thread fine, but native's own
// list-item identity (`item-key`) is what drives its recycling contract,
// and mithril-lynx's Op.CreateList always keys by the item's own index
// (`String(cellIndex)`). Not attempted here.
//
// What IS carried over faithfully: native requires scroll-orientation/
// list-type/span-count unconditionally — Op.CreateList already enforces
// exactly that; this wrapper's job is exposing that as ordinary attrs and
// re-pushing the current items on every update so native's own recycling
// knows how many cells exist to ask for, and any already-visible cell whose
// content changed gets refreshed in place (see list-support.js's
// refreshAttachedCells).

import m from "mithril-runtime";
import renderFactory from "mithril-runtime/render/render.js";
import { renderListCell } from "mithril-lynx/list-cell";
import { redraw } from "mithril-lynx/mount-redraw";
import { ensureId, createRef } from "../internal/native-ref.js";

function buildCells(document, render, renderItem, items) {
	return items.map((item, index) => renderListCell(document, render, redraw, renderItem, item, index));
}

export const List = {
	oninit(vnode) {
		vnode.state.listRef = {};
		vnode.state.refId = ensureId(vnode.attrs.id);
	},

	oncreate(vnode) {
		const s = vnode.state;
		const { items = [], renderItem, className, style, scrollOrientation, listType, spanCount, mainAxisGap = 0, crossAxisGap = 0 } = vnode.attrs;
		if (typeof renderItem !== "function") {
			throw new Error("mithril-lynx-ui: <List> requires a `renderItem` function.");
		}

		// One render() instance per List, reused for every cell — see
		// mithril-lynx's list-cell.js for why that's safe (render() manages
		// multiple independent containers fine) and preferred over creating a
		// fresh one per cell.
		s.render = renderFactory();

		// Imperative escape hatch, same "outside Mithril's own reconciliation"
		// contract mithril-lynx's own createGesture()/native refs already use
		// — a native <list> isn't something render.js knows how to diff, it's
		// created directly via the owning document's own factory method and
		// attached as a plain child of this component's placeholder view.
		s.list = vnode.dom.ownerDocument.createNativeList({ scrollOrientation, listType, spanCount });
		s.list.setAttribute("id", s.refId);
		if (className != null) s.list.className = className;
		vnode.dom.appendChild(s.list);

		// Op.CreateList sets scroll-orientation/list-type/span-count itself
		// but knows nothing about style or item spacing. width/height (or a
		// flex ancestor) is what actually gives the list a scrollable area,
		// so style is pushed here directly rather than left for a consumer to
		// discover the hard way that nothing scrolls without it. Gaps are
		// real native attributes (confirmed against the real
		// @lynx-js/lynx-ui-list source), not CSS.
		if (style != null) s.list.style = style;
		s.list.setAttribute("list-main-axis-gap", mainAxisGap);
		s.list.setAttribute("list-cross-axis-gap", crossAxisGap);
		s.list.setListItems(buildCells(vnode.dom.ownerDocument, s.render, renderItem, items));

		const ref = createRef(s.refId);
		s.listRef.scrollTo = (index, options) =>
			ref.invoke("scrollToPosition", Object.assign({ position: index, index, useScroller: true }, options));
		if (vnode.attrs.listRef != null) Object.assign(vnode.attrs.listRef, s.listRef);
	},

	onupdate(vnode) {
		const s = vnode.state;
		const { items = [], renderItem, style } = vnode.attrs;
		s.list.setListItems(buildCells(vnode.dom.ownerDocument, s.render, renderItem, items));
		// Skips a genuinely EMPTY style object: onupdate's hook can run twice
		// for a single redraw() call (a real, reproducible mithril-lynx
		// vnode-diffing quirk, unrelated to this file). Harmless either way —
		// a native prop write merges, it doesn't replace — but skipping it
		// avoids a wasted cross-thread call on every redraw.
		if (style != null && Object.keys(style).length > 0) s.list.style = style;
	},

	// A plain placeholder view Mithril creates and diffs normally; the real
	// native <list> is appended to it imperatively in oncreate and is
	// otherwise invisible to Mithril's own tree (same "escape hatch"
	// contract as this project's other native-gesture/native-ref
	// components). No style here — it exists only to give oncreate
	// somewhere to hang the real list off of, and sizes to wrap that single
	// child.
	view() {
		return m("view");
	},
};
