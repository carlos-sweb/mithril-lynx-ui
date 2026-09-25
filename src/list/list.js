// list.js
//
// Mithril port of @lynx-js/lynx-ui-list's List (Apache-2.0 — see ./NOTICE),
// as a thin declarative wrapper over Lynx's native `<list>` element.
//
// Since mithril-lynx 3.0.0, `list` / `list-item` are ordinary Mithril
// elements: this component just renders them. Each item becomes a keyed
// `<list-item>`, so Mithril's own keyed diff produces the inserts, removes,
// moves and content updates, and mithril-lynx's main-thread list runtime
// turns them into native `update-list-info` actions and attaches each item
// only when native asks for it. Nothing here runs on the main thread, and
// nothing is re-rendered off-tree — items are part of the normal tree, with
// their normal lifecycle hooks and events.
//
// Coverage: every native `<list>` attribute and event can be passed straight
// through (`bounces`, `item-snap`, `sticky`, `lower-threshold-item-count`,
// `onscrolltolower`, `onlayoutcomplete`, …), with its real type — see
// mithril-lynx's src/list-attributes.js. Per-item platform attributes
// (`full-span`, `sticky-top`, `estimated-main-axis-size-px`,
// `reuse-identifier`, …) come from `getItemAttrs`. The four native methods
// are on `listRef`. See docs/native-papi/papi-07-list-redesign.md.
//
// `item-key` must be unique and stable per item (native uses it to track
// items across updates): pass `getItemKey`. Without it the index is used,
// which is only correct for lists that never insert, remove or reorder
// anywhere but the end.

import m from "mithril-runtime";
import { ensureId, createRef } from "../internal/native-ref.js";

/**
 * The imperative API, bound to one native list id.
 * @param {string} id - The list's native id.
 * @returns {Object} The `listRef` methods.
 */
function createListRef(id) {
	const ref = createRef(id);
	return {
		/** Native `scrollToPosition`: `{ position, alignTo, offset?, itemKey?, smooth? }`. */
		scrollToPosition: (params) => ref.invoke("scrollToPosition", params),
		/** Scrolls by `offset` px; resolves `{ consumedX, consumedY, unconsumedX, unconsumedY }`. */
		scrollBy: (offset) => ref.invoke("scrollBy", { offset }),
		/** Native `autoScroll`: `{ rate, start, autoStop? }`. */
		autoScroll: (params) => ref.invoke("autoScroll", params),
		/** Resolves the currently attached cells (`attachedCells`). */
		getVisibleCells: () => ref.invoke("getVisibleCells"),
		/** Shorthand kept from the previous API: scrolls to `index`. */
		scrollTo: (index, options) => ref.invoke("scrollToPosition", Object.assign({ position: index, index, useScroller: true }, options)),
	};
}

export const List = {
	oninit(vnode) {
		const s = vnode.state;
		s.refId = ensureId(vnode.attrs.id);
		s.listRef = createListRef(s.refId);
		s.warnedAboutKeys = false;
	},

	view(vnode) {
		const s = vnode.state;
		const {
			items = [],
			renderItem,
			getItemKey,
			getItemAttrs,
			listRef,
			id: _id,
			className,
			scrollOrientation = "vertical",
			listType = "single",
			spanCount = 1,
			mainAxisGap = 0,
			crossAxisGap = 0,
			...listAttrs
		} = vnode.attrs;

		if (typeof renderItem !== "function") {
			throw new Error("mithril-lynx-ui: <List> requires a `renderItem` function.");
		}
		if (typeof getItemKey !== "function" && !s.warnedAboutKeys && typeof console !== "undefined") {
			s.warnedAboutKeys = true;
			console.warn(
				"mithril-lynx-ui: <List> without `getItemKey` keys items by index — inserting, removing or " +
					"reordering anywhere but the end will make native misidentify items. Pass getItemKey(item, index).",
			);
		}
		if (listRef != null) Object.assign(listRef, s.listRef);

		return m(
			"list",
			Object.assign(
				{
					"scroll-orientation": scrollOrientation,
					"list-type": listType,
					"span-count": spanCount,
					"list-main-axis-gap": mainAxisGap,
					"list-cross-axis-gap": crossAxisGap,
				},
				listAttrs,
				{ id: s.refId, class: className },
			),
			items.map((item, index) => {
				const key = String(typeof getItemKey === "function" ? getItemKey(item, index) : index);
				const itemAttrs = typeof getItemAttrs === "function" ? getItemAttrs(item, index) : null;
				return m("list-item", Object.assign({}, itemAttrs, { key, "item-key": key }), renderItem(item, index));
			}),
		);
	},
};
