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
// already-shipped `./list.js`.
//
// Deliberate, documented scope cut: the entire `useRefreshAndBounce` hook —
// custom MTS-driven pull-to-refresh physics (`mode: 'hook'`, the upstream
// default) and elastic `bounceableOptions` edge decorations. Both are real
// features, but reimplementing 1266 lines of hand-rolled drag physics that
// native's own `<refresh>` element already solves for the common case is a
// cost this project isn't paying speculatively.
//
// A SECOND scope cut, unrelated to the above: the infinite-scroll "load
// more" footer sentinel this file used to ship (a footer item whose own
// onuiappear/onuidisappear triggered `onLoadMore()`) is not (re)built here.
// `./list.js`'s cell content now renders on the background thread through
// the app's own document (mithril-lynx's list-cell.js), so an event handler
// inside a cell CAN reach this app's own state — the constraint that used
// to block a footer sentinel from calling `onLoadMore()` is gone. Rebuilding
// the sentinel itself is separate, not-yet-done work; until then, an app
// wanting "load more" needs its own mechanism outside the list's own cell
// content (e.g. a scroll-position listener on an ancestor `<scroll-view>`,
// or a manual "load more" button below the list).
//
// Known, real, core-level nuance worth knowing before wiring
// `onStartRefresh`: `./list.js`'s underlying native list signals a COUNT
// INCREASE as cells inserted at the END (`sendListInfo`'s own
// `position: count + i`), regardless of where the new items actually are —
// unchanged from the pre-migration version of this file. Every currently
// visible cell's CONTENT does stay correct even when new items are
// PREPENDED (list-support.js's refreshAttachedCells re-flushes every
// attached cell's content on any items change, not just on count changes),
// but the native insert-position signal itself still assumes append. A
// refresh handler that wants new items to appear at the top and get the
// insert ANIMATION/positioning right too still needs to replace the whole
// `items` array with a fresh reference; this file doesn't attempt to work
// around the position-signal mismatch beyond that.

import m from "mithril-runtime";
import { redraw } from "mithril-lynx/mount-redraw";
import { ensureId, createRef } from "../internal/native-ref.js";
import { nativeBool } from "../internal/native.js";
import { List } from "../list/list.js";

function detailOf(e) {
	return (e && e.detail) || {};
}

export const FeedList = {
	oninit(vnode) {
		const s = vnode.state;
		s.baseListRef = {};
		s.refreshRefId = ensureId(null);
		s.headerHeight = 0;
		s.refreshSize = null;

		s.feedListRef = {
			scrollTo: (...args) => s.baseListRef.scrollTo(...args),
			startRefresh: () => createRef(s.refreshRefId).invoke("autoStartRefresh"),
			finishRefresh: () => createRef(s.refreshRefId).invoke("finishRefresh"),
		};
	},

	view(vnode) {
		const s = vnode.state;
		const { items = [], renderItem, className, style, listId = "feedList", refreshOptions = false, listRef, ...listAttrs } = vnode.attrs;

		const refreshProps = typeof refreshOptions === "object" ? refreshOptions : {};
		const enableRefresh = typeof refreshOptions === "object" ? refreshOptions.enableRefresh === true : refreshOptions === true;

		if (listRef != null) Object.assign(listRef, s.feedListRef);

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
		//    appends its native <list> imperatively rather than through
		//    Lynx's own declarative element tree (see list.js's own header)
		//    — does NOT reliably resolve against <refresh> as a percentage
		//    parent: on device this rendered the list's items shrink-wrapped
		//    to content width (a ~215px sliver) while <refresh> itself
		//    correctly filled the ~660px box around it. A literal pixel
		//    width on the SAME List in the SAME position rendered correctly,
		//    isolating this to percentage resolution through this specific
		//    imperative-native boundary, not a general <refresh> layout
		//    problem. Fix: measure <refresh>'s real box via its own
		//    onlayoutchange and push that to List as explicit pixels —
		//    sidesteps the percentage path entirely, the same "measure, then
		//    push real pixels" pattern already used for the header via
		//    headerHeight below.
		const listStyle = enableRefresh && s.refreshSize ? { width: `${s.refreshSize.width}px`, height: `${s.refreshSize.height}px` } : style;

		const list = m(List, Object.assign({}, listAttrs, { items, renderItem, className, style: listStyle, listRef: s.baseListRef }));

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
					id: s.refreshRefId,
					class: "ui-feed-list-refresh",
					style: { display: "flex", "flex-direction": "column", width: "100%", height: "100%" },
					"enable-refresh": nativeBool(true),
					onlayoutchange: (e) => {
						const d = detailOf(e);
						if (d.width == null || d.height == null) return;
						if (s.refreshSize && s.refreshSize.width === d.width && s.refreshSize.height === d.height) return;
						s.refreshSize = { width: d.width, height: d.height };
						redraw();
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
							onlayoutchange: (e) => {
								s.headerHeight = detailOf(e).height || 0;
							},
						},
						refreshProps.headerContent,
					),
					list,
				],
			),
		);
	},
};
