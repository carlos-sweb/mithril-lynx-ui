// feed-list.js
//
// Mithril port of @lynx-js/lynx-ui-feed-list's FeedList (Apache-2.0 — see
// ./NOTICE) — but a deliberately narrow slice of it. Real source read in
// full first: `index.tsx` (505 lines) turns out to be a thin composition
// over its OWN `useRefreshAndBounce` hook, which is 1266 lines of custom
// Main-Thread-Scripting drag physics reimplementing pull-to-refresh AND
// elastic edge-bounce decorations by hand. Lynx already ships a native
// `<refresh>`/`<refresh-header>` element pair that does the common
// "pull down to refresh a list" job natively — confirmed real and
// documented (`lynx-api-docs/elements/refresh.md`), not guessed — and the
// real FeedList itself already has a `mode: 'native'` escape hatch onto
// exactly that element for when the custom hook isn't needed.
//
// This port ships ONLY the native-refresh path, built on this project's own
// already-shipped `./list.js`, plus a genuinely useful, much smaller
// addition of its own: infinite-scroll "load more", via a sentinel footer
// item using the SAME per-node `uiappear` exposure mechanism already
// established (and device-verified) in `./lazy-component.js` — no global
// event bus, no scroll-position math.
//
// Deliberate, documented scope cut: the entire `useRefreshAndBounce` hook —
// custom MTS-driven pull-to-refresh physics (`mode: 'hook'`, the upstream
// default) and elastic `bounceableOptions` edge decorations. Both are real
// features, but reimplementing 1266 lines of hand-rolled drag physics that
// native's own `<refresh>` element already solves for the common case is a
// cost this project isn't paying speculatively — revisit if a real need for
// a fully custom (non-native) refresh header/animation or edge-bounce
// decoration shows up. `refreshOptions.mode` therefore has no effect here;
// this file always behaves as upstream's `mode: 'native'`.
//
// Known, real, core-level gap worth knowing before wiring `onStartRefresh`:
// `./list.js`'s underlying `createList()` (mithril-lynx core) only diffs an
// `items` COUNT INCREASE as new entries appended at the END — confirmed on
// device by PREPENDING a "pull to refresh" result, which left the
// already-bound first cell showing its OLD content instead of the new item.
// A refresh handler that wants NEW items to appear at the top needs to
// either replace the whole `items` array with a fresh reference (forces
// every visible cell to re-render) or accept append-only growth; this file
// doesn't attempt to work around a core list-diffing limitation.

import m from "mithril";
import shim from "mithril-lynx";
import { wrapElement } from "mithril-lynx/element";
import { nativeBool } from "./internal/native.js";
import { List } from "./list.js";

const FOOTER_KEY = "__mithril-lynx-ui-feed-list-footer__";

function detailOf(e) {
	return (e && e.detail) || {};
}

export const FeedList = {
	oninit(vnode) {
		const s = vnode.state;
		s.baseListRef = {};
		s.refreshDom = null;
		s.headerHeight = 0;
		s.refreshSize = null;
		s.hasMoreData = true;
		s.footerAppeared = false;

		s.feedListRef = {
			scrollTo: (...args) => s.baseListRef.scrollTo(...args),
			startRefresh: () => {
				if (s.refreshDom == null) return Promise.resolve();
				return wrapElement(s.refreshDom).invoke("autoStartRefresh");
			},
			finishRefresh: () => {
				if (s.refreshDom == null) return Promise.resolve();
				return wrapElement(s.refreshDom).invoke("finishRefresh");
			},
			changeHasMoreStatus: (hasMore) => {
				s.hasMoreData = hasMore;
				// Reset so scrolling the footer back into view (e.g. after
				// prepending items) can request another page again.
				if (hasMore) s.footerAppeared = false;
			},
		};
	},

	view(vnode) {
		const s = vnode.state;
		const {
			items = [],
			renderItem,
			itemKey,
			className,
			style,
			listId = "feedList",
			refreshOptions = false,
			onLoadMore,
			loadMoreFooter,
			noMoreDataFooter,
			listRef,
			...listAttrs
		} = vnode.attrs;

		const refreshProps = typeof refreshOptions === "object" ? refreshOptions : {};
		const enableRefresh = typeof refreshOptions === "object" ? refreshOptions.enableRefresh === true : refreshOptions === true;

		if (listRef != null) Object.assign(listRef, s.feedListRef);

		const showFooter = typeof onLoadMore === "function";
		const footerIndex = items.length;
		const combinedItems = showFooter ? [...items, null] : items;

		const combinedRenderItem = (item, index) => {
			if (showFooter && index === footerIndex) {
				return m(
					"view",
					{
						// A real, reproducible mithril-lynx CORE bug, not this file's own:
						// the shim's own removeAttribute("class") calls
						// __SetClasses(handle, undefined) instead of an empty string
						// (lynx-mithril-shim.js, LynxNodeWrapper.prototype.removeAttribute)
						// — native rejects that with "FiberSetClasses param 1 should be
						// String". Confirmed on device: THIS wrapper (no class) recycled
						// into the SAME native list-item wrapper a real row (renderItem's
						// own output, which usually has one) previously occupied, or vice
						// versa, hits exactly that class-attr removal path. A stable,
						// always-present class on this wrapper sidesteps it — it never
						// transitions to/from "no class" during recycling.
						class: "ui-feed-list-footer-item",
						"exposure-id": `${listId}-loadMoreFooter`,
						"exposure-scene": listId,
						onuiappear: () => {
							if (!s.hasMoreData || s.footerAppeared) return;
							s.footerAppeared = true;
							onLoadMore();
						},
						onuidisappear: () => {
							s.footerAppeared = false;
						},
					},
					// loadMoreFooter/noMoreDataFooter are FUNCTIONS, called fresh here,
					// not raw vnodes passed straight through — the same "must return a
					// fresh vnode, may be called more than once for the same item"
					// contract list.js's own renderItem already documents. Confirmed on
					// device: passing a single pre-built vnode object straight through
					// rendered the footer BLANK once native recycling re-requested that
					// same cell a second time — Mithril treats a vnode object it has
					// already mounted once as an update-in-place, not fresh content, so
					// the SECOND wrapper never actually got the content.
					(s.hasMoreData ? loadMoreFooter : noMoreDataFooter)?.(),
				);
			}
			return renderItem(item, index);
		};

		// Keyed by POSITION, not a shared constant: the footer's own logical
		// index moves every time `items` grows (it's always `items.length`),
		// but `./list.js`'s `setItemCount` only ever tells native about COUNT
		// growth at the tail — it has no way to tell native "the item-key at
		// an already-bound index changed identity". A shared FOOTER_KEY
		// therefore collided on device: after onLoadMore grew the list, the
		// OLD footer position (still holding that key, per native's own last
		// known binding) and the NEWLY inserted footer at the new tail
		// position both carried the same key, and native's own diffing
		// rejected it outright ("Error for duplicated list item-key").
		// Deriving the key from `index` makes every historical footer
		// position unique, so no two inserts ever collide — the STALE cell
		// (still showing old footer content at its old position until the
		// user scrolls it out of view and back, letting native recycle and
		// re-request it) is a separate, milder, self-correcting UX nuance of
		// the same underlying tail-only diffing limitation, not something
		// this file works around further.
		const combinedItemKey = showFooter
			? (item, index) => (index === footerIndex ? `${FOOTER_KEY}-${index}` : (itemKey ? itemKey(item, index) : String(index)))
			: itemKey;

		// Sizing this took two real, device-confirmed findings to get right,
		// neither guessable from the docs:
		//
		// 1. <refresh> itself DOES take an explicit width/height from its own
		//    style (confirmed by temporarily giving it a background-color and
		//    watching it fill the full box on device) — the outer wrapper
		//    below just needs a real size (from the caller's `style`, or
		//    100% as a fallback) for <refresh> to inherit via its own
		//    width:100%/height:100%.
		// 2. But a PERCENTAGE style on the inner ./list.js List — which
		//    appends its native <list> imperatively via createList()/
		//    appendChild rather than through Lynx's own declarative element
		//    tree (see list.js's own header) — does NOT reliably resolve
		//    against <refresh> as a percentage parent: on device this
		//    rendered the list's items shrink-wrapped to content width
		//    (a ~215px sliver) while <refresh> itself correctly filled the
		//    ~660px box around it. A literal pixel width on the SAME List in
		//    the SAME position rendered correctly, isolating this to
		//    percentage resolution through this specific imperative-native
		//    boundary, not a general <refresh> layout problem. Fix: measure
		//    <refresh>'s real box via its own onlayoutchange and push that
		//    to List as explicit pixels — sidesteps the percentage path
		//    entirely, the same "measure, then push real pixels" pattern
		//    already used for the header via headerHeight below.
		const listStyle = enableRefresh && s.refreshSize
			? { width: `${s.refreshSize.width}px`, height: `${s.refreshSize.height}px` }
			: style;

		const list = m(
			List,
			Object.assign({}, listAttrs, {
				items: combinedItems,
				renderItem: combinedRenderItem,
				itemKey: combinedItemKey,
				className,
				style: listStyle,
				listRef: s.baseListRef,
			}),
		);

		if (!enableRefresh) return list;

		return m(
			"view",
			{
				style: {
					display: "flex",
					"flex-direction": "column",
					overflow: "hidden",
					height: (style && style.height) ?? "100%",
					width: (style && style.width) ?? "100%",
				},
			},
			m(
				"refresh",
				{
					id: `${listId}-refreshView`,
					class: "ui-feed-list-refresh",
					style: { display: "flex", "flex-direction": "column", width: "100%", height: "100%" },
					"enable-refresh": nativeBool(true),
					oncreate: (child) => { s.refreshDom = child.dom; },
					onupdate: (child) => { s.refreshDom = child.dom; },
					onlayoutchange: (e) => {
						const d = detailOf(e);
						if (d.width == null || d.height == null) return;
						if (s.refreshSize && s.refreshSize.width === d.width && s.refreshSize.height === d.height) return;
						s.refreshSize = { width: d.width, height: d.height };
						shim.redraw();
					},
					onstartrefresh: (e) => {
						if (typeof refreshProps.onStartRefresh === "function") {
							refreshProps.onStartRefresh({ triggeredBy: detailOf(e).isManual ? "drag" : "startRefresh" });
						}
					},
					onheaderoffset: (e) => {
						const d = detailOf(e);
						if (typeof refreshProps.onRefreshOffsetChange === "function") {
							refreshProps.onRefreshOffsetChange({
								offset: (d.offsetPercent || 0) * s.headerHeight,
								headerSize: s.headerHeight,
								isDragging: d.isDragging === true,
							});
						}
					},
					onrefreshstatechange: (e) => {
						if (typeof refreshProps.onRefreshStateChange === "function") {
							refreshProps.onRefreshStateChange({ state: detailOf(e).state });
						}
					},
					// `bindheadershow`/`bindheaderreleased` deliberately not wired: the
					// real docs (lynx-api-docs/elements/refresh.md "Safe Guidance") call
					// these compatibility signals with platform-dependent timing and no
					// detail payload, and name bindstartrefresh/bindheaderoffset/
					// bindrefreshstatechange as the actual business events to build on.
				},
				[
					m(
						"refresh-header",
						{
							class: "ui-feed-list-refresh-header",
							// position:absolute (matching the real .lynx-ui-feed-list__refresh-header
							// rule) takes the header out of <refresh>'s own flex-column flow, so it
							// doesn't compete with the list below it for the 100% height — native
							// reveals it by translating the visible area down as the user drags,
							// not by giving it a reserved flex slot.
							style: { position: "absolute", overflow: "visible" },
							// `onlayoutchange`/`bindlayoutchange` isn't documented specifically
							// for `<refresh-header>` in refresh.md, but it's the same generic
							// layout event already used (and device-verified) on a plain
							// `<view>` in lazy-component.js — assumed to work the same way
							// here since refresh-header is just another native element in the
							// layout tree. Not yet confirmed on THIS element specifically;
							// only used to convert onRefreshOffsetChange's percent into a
							// pixel offset; onHeaderOffset's own offsetPercent still works if
							// this never fires.
							onlayoutchange: (e) => { s.headerHeight = detailOf(e).height || 0; },
						},
						refreshProps.headerContent,
					),
					list,
				],
			),
		);
	},
};
