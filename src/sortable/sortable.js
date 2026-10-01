// sortable.js
//
// Mithril port of @lynx-js/lynx-ui-sortable (Apache-2.0 — see ./NOTICE): a
// vertical, drag-to-reorder list. Built on Draggable (already ported) for
// the per-item drag mechanics — the original's default `as: 'Draggable'`
// item mode maps almost exactly onto it already (`trigger: 'immediate'`,
// `allowedDirection: ['up', 'down']`, onDragStart/onDragging/onDragEnd).
// sortable-utils.js uses each row's layout position for swap tracking; this
// keeps gaps and unequal row heights from distorting the threshold. This file wires
// it to Draggable and to a Scope (this project's Context substitute) that
// carries shared list state down to each SortableItem.
//
// *** RESOLVED (2026-09-12) — was flagged here as an unresolved core bug;
// re-tested on device and no longer reproduces *** . The original report
// (2026-09-11): calling redraw() from a Draggable's onDragStart or
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
//   owns a vertical view with a stable native stacking context. Callers
//   configure its layout through class/style and supply any scroll-view.
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
// `layoutchange` provides a cheap initial size, but this Android host reports
// `top: 0` for every row. The actual positions are read through each row's
// native `boundingClientRect` method and cached before the drag begins.

import m from "mithril-runtime";
import { redraw } from "mithril-lynx/mount-redraw";
import { Draggable } from "../draggable/draggable.js";
import { cx, classOf } from "../internal/cx.js";
import { createRef, ensureId } from "../internal/native-ref.js";
import { createSwapTracker, resetSwapTracker, sortKeyArray, updateSwapTracking } from "./sortable-utils.js";
import { createScope } from "../scope/scope.js";

const sortableScope = createScope();

function keyArrayOf(attrs) {
	const data = attrs.data;
	return Array.isArray(data) ? data.map((item) => item.getSortingKey()) : [];
}

function usableSlots(keys, slots) {
	let previousBottom = -Infinity;
	for (const key of keys) {
		const slot = slots[key];
		if (!slot || !Number.isFinite(slot.top) || !Number.isFinite(slot.height) || slot.height <= 0 || slot.top < previousBottom - 0.5) return false;
		previousBottom = slot.top + slot.height;
	}
	return true;
}

function clamp(value, min, max) {
	return Math.min(Math.max(value, min), max);
}

function dragBoundsFor(container, item) {
	if (container == null || item == null || !Number.isFinite(container.top) || !Number.isFinite(container.bottom) ||
		!Number.isFinite(item.top) || !Number.isFinite(item.height) || item.height <= 0) return null;
	const minY = container.top - item.top;
	const maxY = container.bottom - (item.top + item.height);
	// A row taller than its container cannot fit inside it; keep it at its
	// starting position instead of producing an inverted clamp range.
	return maxY < minY ? { minY: 0, maxY: 0 } : { minY, maxY };
}

function makeApi(vnode) {
	const s = vnode.state;
	s.slotMap = {};
	s.layoutSlots = {};
	s.dragSlots = null;
	s.disabledKeys = {};
	s.itemRefs = {};
	s.appliedTransforms = {};
	s.tracker = createSwapTracker();
	s.activeKey = null;
	s.containerRef = null;
	s.containerRect = null;
	s.dragBounds = null;
	s.boundsReady = false;
	// Sibling transforms animate only while a pointer is actively sorting.
	// Keep transforms transition-free after release: resetting transforms and
	// committing the new data order are separate native operations, so letting
	// CSS animate both can make them race and produce a bounce.
	s.settling = false;
	s.lastDeltaY = 0;
	s.pendingEnd = false;
	s.measurePending = false;
	s.dragGeneration = 0;
	s.currentAttrs = vnode.attrs;

	function writeTransform(key, translate) {
		const ref = s.itemRefs[key];
		if (ref != null && typeof ref.setTransform === "function") ref.setTransform(0, translate);
	}

	function measureSlots(keys) {
		const reads = Promise.all(keys.map((key) => {
			const ref = s.itemRefs[key];
			return ref && typeof ref.getRect === "function" ? ref.getRect() : Promise.reject(new Error("Sortable item is not mounted"));
		})).then((rects) => {
			const slots = {};
			for (let i = 0; i < keys.length; i++) slots[keys[i]] = { top: rects[i].top, height: rects[i].height };
			if (!usableSlots(keys, slots)) throw new Error("Sortable item geometry is unavailable");
			return slots;
		});
		return Promise.race([reads, new Promise((_, reject) => setTimeout(() => reject(new Error("Sortable measurement timed out")), 500))]);
	}

	function measureContainerRect() {
		if (s.containerRef == null) return Promise.resolve(null);
		return s.containerRef.invoke("boundingClientRect", { relativeTo: "", androidEnableTransformProps: false }).then((rect) => {
			if (rect && Number.isFinite(rect.top) && Number.isFinite(rect.bottom) && rect.bottom >= rect.top) {
				s.containerRect = { top: rect.top, bottom: rect.bottom };
				return s.containerRect;
			}
			return null;
		});
	}

	function updateDragBounds(key) {
		// Only native rects are in the same coordinate space as the root. The
		// Android layoutchange event can report top=0 for every row, so it is
		// useful for swap fallback but unsafe for containment calculations.
		const item = s.slotMap[key];
		const bounds = dragBoundsFor(s.containerRect, item);
		s.dragBounds = bounds || { minY: 0, maxY: 0 };
		return bounds != null;
	}

	function applyMove(key, deltaY) {
		if (s.activeKey !== key || s.dragSlots == null) return;
		const writes = updateSwapTracking(s.tracker, {
			keyArray: keyArrayOf(s.currentAttrs),
			slotMap: s.dragSlots,
			disabledKeys: s.disabledKeys,
			sortingKey: key,
			movingDistance: deltaY,
		});
		for (const write of writes) {
			if (s.appliedTransforms[write.key] !== write.translate) {
				writeTransform(write.key, write.translate);
				s.appliedTransforms[write.key] = write.translate;
			}
		}
	}

	function finishDrag(key) {
		if (s.activeKey !== key) return;
		s.settling = true;
		const keyArray = keyArrayOf(s.currentAttrs);
		const sortedKeys = sortKeyArray(keyArray, s.disabledKeys, key, s.tracker.lastSwappedKey);
		if (s.dragSlots != null) {
			const projectedSlots = {};
			for (let index = 0; index < sortedKeys.length; index++) {
				const itemSlot = s.dragSlots[sortedKeys[index]];
				const destination = s.dragSlots[keyArray[index]];
				if (itemSlot && destination) projectedSlots[sortedKeys[index]] = { top: destination.top, height: itemSlot.height };
			}
			s.slotMap = projectedSlots;
		}
		for (const itemKey of Object.keys(s.appliedTransforms)) writeTransform(itemKey, 0);
		writeTransform(key, 0);
		resetSwapTracker(s.tracker);
		s.activeKey = null;
		s.dragSlots = null;
		s.boundsReady = false;
		s.appliedTransforms = {};
		s.pendingEnd = false;
		s.measurePending = false;
		if (typeof s.currentAttrs.onSortEnd === "function") {
			const dataByKey = new Map((s.currentAttrs.data || []).map((item, i) => [keyArray[i], item]));
			const sortedData = sortedKeys.map((k) => dataByKey.get(k)).filter((item) => item != null);
			s.currentAttrs.onSortEnd(sortedData);
		}
		redraw();
	}

	return {
		isEnabled: () => s.currentAttrs.enableSorting !== false,
		activeKey: () => s.activeKey,
		isSettling: () => s.settling,
		dragBoundsFor: (key) => s.activeKey === key ? (s.dragBounds || { minY: 0, maxY: 0 }) : null,
		registerContainer: (ref) => {
			s.containerRef = ref;
			return measureContainerRect().catch(() => null);
		},
		refreshContainerBounds: () => measureContainerRect().then((rect) => {
			if (rect != null && s.activeKey != null) {
				s.boundsReady = updateDragBounds(s.activeKey);
				const boundedY = s.boundsReady ? clamp(s.lastDeltaY, s.dragBounds.minY, s.dragBounds.maxY) : 0;
				if (boundedY !== s.lastDeltaY) writeTransform(s.activeKey, boundedY);
				s.lastDeltaY = boundedY;
				applyMove(s.activeKey, boundedY);
				redraw();
			}
			return rect;
		}).catch(() => null),
		setDisabled: (key, value) => {
			s.disabledKeys[key] = value;
		},
		updateSlot: (key, detail) => {
			if (s.activeKey != null || detail == null) return;
			const top = detail.top;
			const height = detail.height;
			if (Number.isFinite(top) && Number.isFinite(height) && height > 0) {
				s.layoutSlots[key] = { top, height };
			}
			const ref = s.itemRefs[key];
			if (ref && typeof ref.getRect === "function") {
				ref.getRect().then((rect) => {
					if (s.activeKey == null && s.itemRefs[key] === ref && Number.isFinite(rect.top) && Number.isFinite(rect.height)) {
						s.slotMap[key] = { top: rect.top, height: rect.height };
					}
				}).catch(() => {});
			}
		},
		registerItem: (key, ref) => {
			s.itemRefs[key] = ref;
		},
		unregisterItem: (key) => {
			delete s.itemRefs[key];
			delete s.slotMap[key];
			delete s.layoutSlots[key];
			delete s.disabledKeys[key];
		},

		onItemDragStart(key) {
			s.settling = false;
			s.activeKey = key;
			const generation = ++s.dragGeneration;
			const keys = keyArrayOf(s.currentAttrs);
			s.dragSlots = usableSlots(keys, s.slotMap) ? Object.assign({}, s.slotMap) : usableSlots(keys, s.layoutSlots) ? Object.assign({}, s.layoutSlots) : null;
			s.boundsReady = updateDragBounds(key);
			s.appliedTransforms = {};
			s.lastDeltaY = 0;
			s.pendingEnd = false;
			s.measurePending = true;
			resetSwapTracker(s.tracker);
			const containerMeasurement = measureContainerRect().catch(() => null);
			measureSlots(keys).then((slots) => containerMeasurement.then(() => slots)).then((slots) => {
				if (s.activeKey !== key || s.dragGeneration !== generation) return;
				s.measurePending = false;
				s.dragSlots = slots;
				s.slotMap = slots;
				s.boundsReady = updateDragBounds(key);
				const boundedY = s.boundsReady ? clamp(s.lastDeltaY, s.dragBounds.minY, s.dragBounds.maxY) : 0;
				if (boundedY !== s.lastDeltaY) writeTransform(key, boundedY);
				s.lastDeltaY = boundedY;
				applyMove(key, boundedY);
				if (s.pendingEnd) finishDrag(key);
				else redraw();
			}).catch(() => {
				if (s.dragGeneration !== generation) return;
				s.measurePending = false;
				s.boundsReady = false;
				s.lastDeltaY = 0;
				writeTransform(key, 0);
				if (s.activeKey === key && s.pendingEnd) finishDrag(key);
			});
			if (typeof s.currentAttrs.onSortStart === "function") s.currentAttrs.onSortStart();
			redraw();
		},

		onItemDragMove(key, deltaY) {
			// Until both native measurements resolve, keep the row stationary and
			// remember the latest pointer delta. Applying an unbounded first move
			// would let the item escape the root before its bounds arrive.
			if (s.activeKey === key && !s.boundsReady) {
				s.lastDeltaY = deltaY;
				writeTransform(key, 0);
				return;
			}
			const bounds = s.activeKey === key ? (s.dragBounds || { minY: 0, maxY: 0 }) : null;
			const boundedY = bounds == null ? deltaY : clamp(deltaY, bounds.minY, bounds.maxY);
			if (boundedY !== deltaY) writeTransform(key, boundedY);
			s.lastDeltaY = boundedY;
			applyMove(key, boundedY);
		},

		onItemDragEnd(key) {
			if (s.activeKey !== key) return;
			// Turn off sibling transform transitions in the touchend render,
			// before any async measurement can finish and reset/reorder the rows.
			s.settling = true;
			if (s.measurePending) s.pendingEnd = true;
			else finishDrag(key);
		},
	};
}

export const SortableRoot = {
	oninit(vnode) {
		vnode.state.containerId = ensureId();
		vnode.state.api = makeApi(vnode);
	},

	view(vnode) {
		vnode.state.currentAttrs = vnode.attrs;
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

		return m("view", {
			id: vnode.state.containerId,
			class: classOf(vnode.attrs),
			onlayoutchange: () => vnode.state.api.refreshContainerBounds(),
			// Establish the drag layer's native stacking context before touch.
			// A dynamically elevated row otherwise changes coordinate space.
			style: Object.assign({ display: "flex", flexDirection: "column" }, vnode.attrs.style, { zIndex: "0" }),
		}, m(
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
		));
	},
	oncreate(vnode) {
		vnode.state.api.registerContainer(createRef(vnode.state.containerId));
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

		const { style, sortingKey, disabled = false } = vnode.attrs;
		const className = classOf(vnode.attrs);
		const activeKey = api.activeKey();
		const dragBounds = api.dragBoundsFor(sortingKey);
		if (sortingKey == null) {
			throw new Error("mithril-lynx-ui: <SortableItem> requires a sortingKey");
		}
		api.setDisabled(sortingKey, disabled === true);

		return m(
			Draggable,
			{
				className: cx(className, {
					"ui-sorting": activeKey === sortingKey,
					"ui-sortable-shifting": activeKey != null && activeKey !== sortingKey && !api.isSettling(),
					"ui-sortable-settling": api.isSettling(),
				}),
				style,
				trigger: "immediate",
				allowedDirection: ["up", "down"],
				minTranslateY: dragBounds && dragBounds.minY,
				maxTranslateY: dragBounds && dragBounds.maxY,
				enableDragging: api.isEnabled() && disabled !== true,
				draggableRef: vnode.state.draggableRef,
				draggableProps: {
					onlayoutchange: (e) => api.updateSlot(sortingKey, e && (e.detail || e.params)),
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
