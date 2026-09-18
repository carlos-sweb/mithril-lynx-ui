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
// real and device-verified — mithril-lynx's own Op.CreateList (2.5.0+, see
// docs/native-papi/papi-06-virtualized-lists.md). This file is the
// DECLARATIVE MITHRIL WRAPPER around it, not a rebuild of everything
// upstream layers on top.
//
// A real API change from every other component in this project, forced by
// mithril-lynx's own architecture: `renderItem` is NOT a prop here. Native
// calls a list's cell-rendering callback SYNCHRONOUSLY, on the main
// thread, based on real scroll position — a cross-thread round trip to
// where this component's own code runs (the background thread) can never
// satisfy that, and a raw JS closure can't cross that boundary anyway (main
// and background are separate JS engine instances on a real device, not
// just separate global scopes). So the render function has to be
// registered on the MAIN thread instead, once, by a string key
// (`mithril-lynx/list-support`'s `registerListRenderer(key, fn)`, called
// from the app's own main-thread.ts) — `<List rendererKey="...">` just
// references that same key. `items` still comes through normally as a
// prop, since it's plain data, not code — it crosses the boundary fine.
//
// Known, deliberate gaps carried from this same constraint:
//   - No custom `itemKey` function — same cross-thread-closure problem as
//     renderItem. Every cell keys by its own index (a String(cellIndex)),
//     matching what mithril-lynx's Op.CreateList already does by default.
//   - An event handler inside a rendererKey's own vnode tree (e.g. a tap
//     on a list item) has no way back to this app's state — there's no
//     background-thread fake-dom node for list cell content to dispatch
//     through. Needs a deliberate reporting convention, not built yet.
//   - No MTS `listMaxSize`/`useMaxSize`, no `scrollIntoID`, no
//     autoScroll/getVisibleCells/exposure-id/exposure-scene/iOS-only
//     touch-propagation knobs — same scope cuts as before this migration,
//     unrelated to the rendererKey change.
//
// What IS carried over faithfully: native requires scroll-orientation/
// list-type/span-count unconditionally — Op.CreateList already enforces
// exactly that; this wrapper's job is exposing that as ordinary attrs and
// re-pushing the current item COUNT on every update (content changes to an
// already-bound, already-visible cell don't automatically refresh — same
// limitation the pre-migration version already had, unrelated to this
// change) so native's own recycling knows how many cells exist to ask for.

import m from "mithril-runtime";
import { ensureId, createRef } from "../internal/native-ref.js";

export const List = {
	oninit(vnode) {
		vnode.state.listRef = {};
		vnode.state.refId = ensureId(vnode.attrs.id);
	},

	oncreate(vnode) {
		const s = vnode.state;
		const { items = [], rendererKey, className, style, scrollOrientation, listType, spanCount, mainAxisGap = 0, crossAxisGap = 0 } = vnode.attrs;
		if (typeof rendererKey !== "string") {
			throw new Error(
				"mithril-lynx-ui: <List> requires a `rendererKey` — register its renderer with registerListRenderer() from your app's main-thread.ts (see docs/native-papi/papi-06-virtualized-lists.md).",
			);
		}

		// Imperative escape hatch, same "outside Mithril's own reconciliation"
		// contract mithril-lynx's own createGesture()/native refs already use
		// — a native <list> isn't something render.js knows how to diff, it's
		// created directly via the owning document's own factory method and
		// attached as a plain child of this component's placeholder view.
		s.list = vnode.dom.ownerDocument.createNativeList(rendererKey, { scrollOrientation, listType, spanCount });
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
		s.list.setListItems(items);

		const ref = createRef(s.refId);
		s.listRef.scrollTo = (index, options) =>
			ref.invoke("scrollToPosition", Object.assign({ position: index, index, useScroller: true }, options));
		if (vnode.attrs.listRef != null) Object.assign(vnode.attrs.listRef, s.listRef);
	},

	onupdate(vnode) {
		const s = vnode.state;
		const { items = [], style } = vnode.attrs;
		s.list.setListItems(items);
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
