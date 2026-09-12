// sortable.js
//
// Mithril port of @lynx-js/lynx-ui-sortable (Apache-2.0 — see ./NOTICE): a
// vertical, drag-to-reorder list. Built on Draggable (already ported) for
// the per-item drag mechanics — the original's default `as: 'Draggable'`
// item mode maps almost exactly onto it already (`trigger: 'immediate'`,
// `allowedDirection: ['up', 'down']`, onDragStart/onDragging/onDragEnd).
// internal/sortable-utils.js ports the actual swap-tracking algorithm (pure
// logic, close to verbatim, like internal/slider-utils.js); this file wires
// it to Draggable and to a Scope (this project's Context substitute) that
// carries shared list state down to each SortableItem.
//
// *** RESOLVED (2026-09-12) — was flagged here as an unresolved core bug;
// re-tested on device and no longer reproduces *** . The original report
// (2026-09-11): calling shim.redraw() from a Draggable's onDragStart or
// onDragEnd callback crashed with "TypeError: not a function" inside a
// LATER, seemingly unrelated component's view() call, and simply mounting
// any real SortableItem also broke the separately-shipped SwipeAction
// component on the same page. That signature — a generic "not a function"
// inside some other component's view(), only once the interaction actually
// produced a NEW value somewhere — turned out, in the unrelated Form
// component's crash the same week, to be `Array.prototype.at()` not being
// implemented by Lynx's main-thread JS engine (see AGENTS.md). The demo's
// own SORTABLE section had the exact same `state.sortLog.at(-1)` pattern,
// only reachable once a drag actually completed — matching this bug's own
// "`data: []` (never drags) is fine; any real item (which does) breaks"
// symptom exactly. Fixed there (`[len-1]` instead of `.at(-1)`) and
// re-verified end to end on the real device: dragged an item to reorder
// (onDragStart/onDragEnd redraws, from touchstart/touchend, no crash),
// then swiped and deleted a SwipeAction row on the SAME page right
// afterward (no regression) — both previously-crashing paths, now clean.
// Left the demo section enabled. Note: an earlier isolated two-Draggable
// test harness (since deleted) reportedly reproduced the same signature
// OUTSIDE Sortable entirely, without going through this `.at()` call — if
// that observation was accurate, there may still be a narrower core issue
// nobody has since reproduced; nothing else has been able to reproduce a
// crash here since the `.at()` fix, so treat this as resolved unless a new
// device repro shows up.
//
// Real device-only surprise, found while WRITING this (not guessed from the
// original): moving a sibling item's transform from OUTSIDE that item's own
// drag gesture — which the swap algorithm needs to do constantly, to slide
// the item the dragged one is passing over — is something nothing on
// Draggable's public API exposed. Fixed by adding an optional imperative
// `draggableRef` to draggable.js itself (setTransform/getTranslate, same
// convention as inputRef/sliderRef/actionRef), rather than duplicating
// Draggable's transform-writing logic here.
//
// Four scope cuts from the original, each substantial on its own and each
// deliberate — the core drag-to-reorder interaction (drag an item, watch
// siblings shift live, release, get a correctly re-sorted onSortEnd) works
// and is what's tested (unit tests only — see the device-bug note above for
// why this isn't device-verified yet); these are what's NOT here for v1:
//
// - No `as: 'DraggableRoot'` per-item mode (a DraggableRoot/DraggableArea
//   split, for when only PART of an item's content should be a drag
//   handle). Only the default whole-item-is-a-handle mode is supported —
//   DraggableRoot/DraggableArea have no port in this repo yet.
// - No `as: 'ScrollView'` owned-scroll-view convenience. SortableRoot
//   renders NO element of its own (same as radio-group.js's RadioGroup) —
//   just the Scope Provider wrapping the mapped items — so the caller
//   supplies whatever container/layout (a plain `<view>`, or their own
//   `<scroll-view>`) the items live inside.
// - No autoscroll near a scrollable container's edges. The original's
//   version of this is ~200 lines on its own (edge-distance tracking, a
//   sticky-direction state machine, a dedicated animation loop calling
//   `scrollBy`). A drag that reaches the edge of the visible area here just
//   stops there — the list doesn't scroll to follow it.
// - No drag-overlay (the original detaches the dragged item into a separate
//   layer via a ref map, elevated above every sibling, so dragging near a
//   list edge doesn't get visually clipped by a scroll-view's own bounds).
//   The active item instead gets a `ui-sorting` state class (default CSS:
//   a z-index bump) applied in place — correct as long as nothing else in
//   the layout clips it, same caveat SwipeAction's device-verified `<scroll-
//   view>` interop note already carries for this project generally.
//
// One further simplification, in internal/sortable-utils.js itself: the
// original scales a swap target's translate to avoid a visual jump when the
// dragged item has crossed a DISABLED sibling to reach it. That one frame
// of extra easing is dropped — disabled items are still correctly skipped
// as swap targets, still keep their own absolute position in the final
// order, and are still correctly accounted for in the drag distance math.
//
// Sizing each item relies on the native `layoutchange` event (`e.detail.
// height`) — a plain `on*` listener works the same way it does for every
// other native event this project already uses (touchstart, tap, ...), per
// the shim's generic on*-maps-to-addEventListener contract.

import m from "mithril";
import shim from "mithril-lynx";
import { Draggable } from "./draggable.js";
import { cx } from "./internal/cx.js";
import { createSwapTracker, resetSwapTracker, sortKeyArray, updateSwapTracking } from "./internal/sortable-utils.js";
import { createScope } from "./scope.js";

const sortableScope = createScope();

function keyArrayOf(vnode) {
	const data = vnode.attrs.data;
	return Array.isArray(data) ? data.map((item) => item.getSortingKey()) : [];
}

function makeApi(vnode) {
	const s = vnode.state;
	s.sizeMap = {};
	s.disabledKeys = {};
	s.itemRefs = {};
	s.tracker = createSwapTracker();
	s.activeKey = null;

	function writeTransform(key, translate) {
		const ref = s.itemRefs[key];
		if (ref != null && typeof ref.setTransform === "function") ref.setTransform(0, translate);
	}

	return {
		isEnabled: () => vnode.attrs.enableSorting !== false,
		activeKey: () => s.activeKey,
		setDisabled: (key, value) => {
			s.disabledKeys[key] = value;
		},
		updateSize: (key, size) => {
			if (typeof size === "number" && size > 0) s.sizeMap[key] = size;
		},
		registerItem: (key, ref) => {
			s.itemRefs[key] = ref;
		},
		unregisterItem: (key) => {
			delete s.itemRefs[key];
			delete s.sizeMap[key];
			delete s.disabledKeys[key];
		},

		onItemDragStart(key) {
			s.activeKey = key;
			resetSwapTracker(s.tracker);
			if (typeof vnode.attrs.onSortStart === "function") vnode.attrs.onSortStart();
			shim.redraw(); // see this file's header — confirmed to crash on device
		},

		onItemDragMove(key, deltaY) {
			const writes = updateSwapTracking(s.tracker, {
				keyArray: keyArrayOf(vnode),
				sizeMap: s.sizeMap,
				disabledKeys: s.disabledKeys,
				sortingKey: key,
				movingDistance: deltaY,
			});
			for (const write of writes) writeTransform(write.key, write.translate);
		},

		onItemDragEnd(key) {
			const keyArray = keyArrayOf(vnode);
			const sortedKeys = sortKeyArray(keyArray, s.disabledKeys, key, s.tracker.lastSwappedKey);

			// Snap every touched item's imperative transform back to 0. If the
			// caller reorders `data` in response to onSortEnd below, Mithril's
			// own keyed diff keeps each DOM node (by sortingKey) and just moves
			// it to its new slot — with the transform already at 0, that's a
			// clean settle, not a residual double-offset.
			for (const itemKey of Object.keys(s.itemRefs)) writeTransform(itemKey, 0);
			resetSwapTracker(s.tracker);
			s.activeKey = null;

			// Always reported, whether the order actually changed or not —
			// matches the original: the app gets a definitive final order after
			// every drag, not just the ones that moved something.
			if (typeof vnode.attrs.onSortEnd === "function") {
				const dataByKey = new Map((vnode.attrs.data || []).map((item, i) => [keyArray[i], item]));
				const sortedData = sortedKeys.map((k) => dataByKey.get(k)).filter((item) => item != null);
				vnode.attrs.onSortEnd(sortedData);
			}
			shim.redraw(); // see this file's header — confirmed to crash on device
		},
	};
}

export const SortableRoot = {
	oninit(vnode) {
		vnode.state.api = makeApi(vnode);
	},

	view(vnode) {
		const data = Array.isArray(vnode.attrs.data) ? vnode.attrs.data : [];
		// A named attr, not a positional child — matches the original's own
		// prop shape (`children: (item) => ReactNode` was already a named prop
		// there, not JSX children) and, unlike a positional function child,
		// type-checks cleanly through Mithril's own m() typings from a .ts
		// consumer (see demo/src/index.ts's SORTABLE section).
		const renderItem = vnode.attrs.children;
		if (typeof renderItem !== "function") {
			throw new Error("mithril-lynx-ui: <SortableRoot> requires a `children` function attr: (item) => vnode");
		}

		return m(
			sortableScope.Provider,
			{ value: vnode.state.api },
			data.map((item) => {
				const rendered = renderItem(item);
				// Keying by sortingKey isn't optional here — without it, a reorder
				// would let Mithril's diff reuse DOM nodes across the wrong items,
				// breaking every Draggable's own internal drag state. Set directly
				// on the returned vnode so a caller can't forget it.
				if (rendered != null && typeof rendered === "object") rendered.key = item.getSortingKey();
				return rendered;
			}),
		);
	},
};

export const SortableItem = {
	oninit(vnode) {
		vnode.state.draggableRef = {};
	},

	view(vnode) {
		const api = sortableScope.useScope();
		if (api == null) {
			throw new Error("mithril-lynx-ui: <SortableItem> must be used inside a <SortableRoot>");
		}
		vnode.state.api = api; // stash — oncreate/onremove can't call useScope() themselves, see scope.js

		const { className, style, sortingKey, disabled = false } = vnode.attrs;
		if (sortingKey == null) {
			throw new Error("mithril-lynx-ui: <SortableItem> requires a sortingKey");
		}
		api.setDisabled(sortingKey, disabled === true);

		return m(
			Draggable,
			{
				className: cx(className, { "ui-sorting": api.activeKey() === sortingKey }),
				style,
				trigger: "immediate",
				allowedDirection: ["up", "down"],
				enableDragging: api.isEnabled() && disabled !== true,
				draggableRef: vnode.state.draggableRef,
				draggableProps: {
					onlayoutchange: (e) => api.updateSize(sortingKey, e && e.detail && e.detail.height),
				},
				onDragStart: () => api.onItemDragStart(sortingKey),
				onDragging: (translate) => api.onItemDragMove(sortingKey, translate.y),
				onDragEnd: () => api.onItemDragEnd(sortingKey),
			},
			vnode.children,
		);
	},

	oncreate(vnode) {
		const api = vnode.state.api;
		if (api != null) api.registerItem(vnode.attrs.sortingKey, vnode.state.draggableRef);
	},

	onremove(vnode) {
		const api = vnode.state.api;
		if (api != null) api.unregisterItem(vnode.attrs.sortingKey);
	},
};
