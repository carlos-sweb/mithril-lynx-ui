// slider.js
//
// Mithril port of @lynx-js/lynx-ui-slider (Apache-2.0 — see ./NOTICE): a
// compound SliderRoot/SliderTrack/SliderThumb/SliderIndicator, supporting
// both a plain 0..1 value and a two-thumb range (a `[number, number]`
// tuple) off the same value model — internal/slider-utils.js, ported
// close to verbatim since the original is already framework-agnostic there.
//
// Two adaptations, both forced rather than chosen:
//
// - The original attaches `catchtouchstart`/`catchtouchmove`/etc (Lynx's
//   "catch" event modifier — stops the gesture from also reaching an
//   ancestor, e.g. a surrounding <scroll-view>). mithril-lynx's shim has no
//   equivalent: any "on*" key maps to a plain addEventListener via its
//   Mithril-render.js-derived contract (see CONTRACT.md), with no capture
//   or stop-propagation concept. So this uses `on*` and accepts that a
//   Slider inside a <scroll-view> may need the app to intervene (e.g. the
//   scroll-view's own nested-scroll config) if the two gestures conflict —
//   verified NOT to conflict in this project's own demo gallery, but that's
//   one scroll-view/one Slider, not a guarantee for every layout.
// - Web-platform mouse-event handling (isWebPlatform, catchmousedown/move/
//   up, global-bindmouseup) is dropped — this project targets Android only.
//
// Track width isn't known synchronously on the first touch, so bounds are
// measured async (the same NodesRef.invoke("boundingClientRect", ...) call
// internal/native-ref.js's createRef().invoke() wraps — see
// docs/native-papi/papi-03-async-geometry-measurement.md) and any move that
// arrives before that resolves is queued and replayed once it does — ported
// as-is, this queuing is genuinely necessary, not paranoia.
//
// Position is written straight to the thumb/indicator nodes on every move
// (a redraw per touchmove would be wasted work — the same call this project
// already made for Draggable), and Track/Thumb/Indicator ALSO compute their
// position from the shared `currentValue` in their own view(), so a redraw
// from any cause never clobbers it — the exact bug Draggable's port hit on
// device, avoided here from the start instead of found the same way twice.

import m from "mithril-runtime";
import { redraw } from "mithril-lynx/mount-redraw";
import { ensureId, createRef } from "../internal/native-ref.js";
import { cx } from "../internal/cx.js";
import {
	areSliderValuesEqual,
	clamp01,
	cloneSliderValue,
	getInitialSliderThumbIndex,
	getSliderIndicatorGeometry,
	getSliderThumbValue,
	getTouchX,
	getVisualRatio,
	isSliderValueCollapsed,
	normalizeSliderValue,
	resolveSliderDrag,
} from "./slider-utils.js";
import { createScope } from "../scope/scope.js";

const sliderScope = createScope();

function useSliderContext() {
	const api = sliderScope.useScope();
	if (api == null) {
		throw new Error("mithril-lynx-ui: Slider parts must be used inside a <SliderRoot>");
	}
	return api;
}

export const SliderRoot = {
	oninit(vnode) {
		const s = vnode.state;
		const isControlled = vnode.attrs.value !== undefined;

		s.trackEl = null;
		s.indicatorEl = null;
		s.thumbEls = [null, null];
		s.bounds = { width: 0, left: 0, measured: false, measuring: false };
		s.pendingMoveX = null;
		s.pendingEnd = false;
		s.interaction = {
			pointerActive: false,
			dragging: false,
			pendingThumbIndex: null,
			activeThumbIndex: null,
			lastActiveThumbIndex: null,
			startedCollapsed: false,
		};
		s.currentValue = normalizeSliderValue(
			isControlled ? vnode.attrs.value : vnode.attrs.defaultValue ?? 0,
			vnode.attrs.step,
		);
		s.renderedActive = false;
		s.renderedActiveThumbIndex = null;
		s.lastControlledValue = vnode.attrs.value;

		const applyNativeValue = (next) => {
			const enableRTL = vnode.attrs.enableRTL === true;
			const { offset, size } = getSliderIndicatorGeometry(next);

			if (s.indicatorEl != null) {
				s.indicatorEl.setStyleProperties(
					enableRTL ? { right: `${offset * 100}%`, width: `${size * 100}%` } : { left: `${offset * 100}%`, width: `${size * 100}%` },
				);
			}

			const lower = getSliderThumbValue(next, 0);
			if (s.thumbEls[0] != null) s.thumbEls[0].setStyleProperty("left", `${getVisualRatio(lower, enableRTL) * 100}%`);

			const upper = getSliderThumbValue(next, 1);
			if (s.thumbEls[1] != null) s.thumbEls[1].setStyleProperty("left", `${getVisualRatio(upper, enableRTL) * 100}%`);
		};

		const syncCurrentValue = (next) => {
			if (areSliderValuesEqual(s.currentValue, next)) return false;
			s.currentValue = next;
			applyNativeValue(next);
			return true;
		};

		const setDragging = (nextDragging, value) => {
			if (s.interaction.dragging === nextDragging) return;
			s.interaction.dragging = nextDragging;
			if (typeof vnode.attrs.onDragging === "function") vnode.attrs.onDragging(cloneSliderValue(value));
		};

		const updateValue = (value, options) => {
			const opts = options || {};
			const next = normalizeSliderValue(value, vnode.attrs.step);
			const source = opts.source ?? "external";

			if (s.interaction.dragging && !opts.force && source === "external") return;
			if (!syncCurrentValue(next)) return;

			if (typeof vnode.attrs.onValueChange === "function") vnode.attrs.onValueChange(cloneSliderValue(next), source);
			redraw();
		};

		const setRenderedInteraction = (active, activeThumbIndex) => {
			if (s.renderedActive === active && s.renderedActiveThumbIndex === activeThumbIndex) return;
			s.renderedActive = active;
			s.renderedActiveThumbIndex = activeThumbIndex;
			redraw();
		};

		const resolveNextDrag = (targetValue) => {
			const it = s.interaction;
			const resolution = resolveSliderDrag(s.currentValue, targetValue, {
				activeThumbIndex: it.activeThumbIndex ?? undefined,
				preferredThumbIndex: it.lastActiveThumbIndex ?? undefined,
				startedCollapsed: it.startedCollapsed,
				step: vnode.attrs.step,
			});

			const previousIndex = it.activeThumbIndex;
			it.activeThumbIndex = resolution.activeThumbIndex;
			it.lastActiveThumbIndex = resolution.activeThumbIndex;
			it.startedCollapsed = resolution.startedCollapsed;
			if (previousIndex !== resolution.activeThumbIndex) setRenderedInteraction(true, resolution.activeThumbIndex);

			return resolution;
		};

		const valueFromX = (x) => {
			const b = s.bounds;
			if (!Number.isFinite(x) || b.width <= 0) return null;
			const ratio = (x - b.left) / b.width;
			return clamp01(vnode.attrs.enableRTL === true ? 1 - ratio : ratio);
		};

		const applyMeasuredMoveX = (x) => {
			const value = valueFromX(x);
			if (value == null) return;
			const resolution = resolveNextDrag(value);
			setDragging(true, resolution.dragStartValue);
			updateValue(resolution.value, { source: "drag", force: true });
		};

		const resetInteraction = () => {
			const it = s.interaction;
			it.pointerActive = false;
			it.pendingThumbIndex = null;
			it.activeThumbIndex = null;
			it.startedCollapsed = false;
			s.pendingEnd = false;
			s.pendingMoveX = null;
			setRenderedInteraction(false, null);
		};

		const finishInteraction = () => {
			resetInteraction();
			if (!s.interaction.dragging) return;
			setDragging(false, s.currentValue);
			if (typeof vnode.attrs.onValueCommit === "function") vnode.attrs.onValueCommit(cloneSliderValue(s.currentValue));
		};

		const flushPendingMoveX = () => {
			if (s.pendingMoveX == null || !s.bounds.measured) return;
			const x = s.pendingMoveX;
			const shouldFinish = s.pendingEnd;
			s.pendingMoveX = null;
			applyMeasuredMoveX(x);
			if (shouldFinish) finishInteraction();
		};

		const measureBounds = () => {
			if (s.bounds.measuring || s.trackEl == null) return;
			s.bounds.measuring = true;

			s.trackEl
				.invoke("boundingClientRect", { relativeTo: "" })
				.then((res) => {
					s.bounds.measuring = false;
					// internal/native-ref.js's invoke() resolves with the
					// unwrapped value already — see docs/native-papi/papi-01-imperative-refs.md.
					const data = res || {};
					const width = typeof data.width === "number" ? data.width : Number.NaN;
					const left = typeof data.left === "number" ? data.left : Number.NaN;

					if (Number.isFinite(width) && Number.isFinite(left) && width > 0) {
						s.bounds.width = width;
						s.bounds.left = left;
						s.bounds.measured = true;
						flushPendingMoveX();
					} else {
						s.bounds.width = 0;
						s.bounds.measured = false;
						if (s.pendingEnd) finishInteraction();
					}
				})
				.catch(() => {
					s.bounds.measuring = false;
					if (s.pendingEnd) finishInteraction();
				});
		};

		const handleMoveX = (x) => {
			if (vnode.attrs.disabled === true || !s.interaction.pointerActive) return;
			if (!Number.isFinite(x)) return;

			if (!s.bounds.measured || s.bounds.width <= 0) {
				s.pendingMoveX = x;
				measureBounds();
				return;
			}
			applyMeasuredMoveX(x);
		};

		const handleInteractionStart = (x) => {
			const it = s.interaction;
			const requestedThumbIndex = it.pendingThumbIndex;
			it.pendingThumbIndex = null;

			if (vnode.attrs.disabled === true || !Number.isFinite(x)) {
				resetInteraction();
				return;
			}

			const initialThumbIndex = getInitialSliderThumbIndex(s.currentValue, requestedThumbIndex);
			it.pointerActive = true;
			it.activeThumbIndex = initialThumbIndex;
			it.startedCollapsed = isSliderValueCollapsed(s.currentValue);
			s.pendingEnd = false;
			setRenderedInteraction(true, initialThumbIndex);
			s.pendingMoveX = x;
			s.bounds.measured = false;
			measureBounds();
		};

		const handleEnd = () => {
			s.interaction.pointerActive = false;
			if (s.pendingMoveX != null && !s.bounds.measured && s.bounds.measuring) {
				s.pendingEnd = true;
				return;
			}
			finishInteraction();
		};

		s.api = {
			get active() {
				return s.renderedActive && vnode.attrs.disabled !== true;
			},
			get activeThumbIndex() {
				return s.renderedActiveThumbIndex;
			},
			get disabled() {
				return vnode.attrs.disabled === true;
			},
			get enableRTL() {
				return vnode.attrs.enableRTL === true;
			},
			get currentValue() {
				return s.currentValue;
			},
			registerTrack: (el) => {
				s.trackEl = el;
			},
			registerThumb: (index, el) => {
				s.thumbEls[index] = el;
			},
			registerIndicator: (el) => {
				s.indicatorEl = el;
			},
			onTrackLayoutChange: (event) => {
				const detail = (event && event.detail) || {};
				const width = Number(detail.width);
				if (Number.isFinite(width) && width > 0) {
					s.bounds.width = width;
					s.bounds.measured = false;
					measureBounds();
				} else {
					s.bounds.width = 0;
					s.bounds.measured = false;
				}
			},
			onThumbInteractionStart: (index) => {
				s.interaction.pendingThumbIndex = index;
			},
			ontouchstart: (event) => {
				handleInteractionStart(getTouchX(event));
			},
			ontouchmove: (event) => {
				handleMoveX(getTouchX(event));
			},
			ontouchend: () => handleEnd(),
			ontouchcancel: () => handleEnd(),
		};

		// Public imperative handle — only meaningful (and only permitted, same
		// rule as upstream) in uncontrolled mode.
		s.updateValue = (value, options) => {
			if (isControlled) {
				throw new Error("mithril-lynx-ui: SliderRoot.updateValue() must not be called in controlled mode. Update the `value` attr instead.");
			}
			updateValue(value, options);
		};
		s.getValue = () => {
			if (isControlled) {
				throw new Error("mithril-lynx-ui: SliderRoot.getValue() must not be called in controlled mode. Read the `value` attr instead.");
			}
			return cloneSliderValue(s.currentValue);
		};
		s.updateValueInternal = updateValue;

		// Mithril's equivalent of upstream's useImperativeHandle(ref, ...): fill
		// in a caller-supplied plain object, same convention as ./input.js's
		// inputRef.
		if (vnode.attrs.sliderRef != null) {
			Object.assign(vnode.attrs.sliderRef, { updateValue: s.updateValue, getValue: s.getValue });
		}
	},

	onupdate(vnode) {
		const s = vnode.state;
		const isControlled = vnode.attrs.value !== undefined;
		if (!isControlled || vnode.attrs.value === undefined) return;
		if (vnode.attrs.value === s.lastControlledValue) return;
		s.lastControlledValue = vnode.attrs.value;
		s.updateValueInternal(vnode.attrs.value, { source: "external", force: true });
	},

	view(vnode) {
		const s = vnode.state;
		const { className, style, disabled = false } = vnode.attrs;

		return m(
			"view",
			{
				class: cx(className, { "ui-active": s.api.active, "ui-disabled": disabled }),
				style,
				ontouchstart: s.api.ontouchstart,
				ontouchmove: s.api.ontouchmove,
				ontouchend: s.api.ontouchend,
				ontouchcancel: s.api.ontouchcancel,
			},
			m(sliderScope.Provider, { value: s.api }, vnode.children),
		);
	},
};

export const SliderTrack = {
	oninit(vnode) {
		vnode.state.refId = ensureId(null);
	},

	// useScope() is only valid from view() — it's popped again (see
	// scope.js's header) before oncreate's deferred queue flushes. So view()
	// stashes the api on this vnode's own state, and oncreate reads it back
	// from there instead of asking the scope a second time, too late.
	oncreate(vnode) {
		vnode.state.api.registerTrack(createRef(vnode.state.refId));
	},

	view(vnode) {
		const api = useSliderContext();
		vnode.state.api = api;
		return m(
			"view",
			{
				id: vnode.state.refId,
				style: {
					position: "relative",
					width: "100%",
					height: "100%",
					display: "flex",
					"align-items": "center",
					overflow: "visible",
				},
				onlayoutchange: api.onTrackLayoutChange,
			},
			[
				m("view", { class: cx(vnode.attrs.className, { "ui-active": api.active, "ui-disabled": api.disabled }), style: vnode.attrs.style }),
				vnode.children,
			],
		);
	},
};

export const SliderThumb = {
	oninit(vnode) {
		vnode.state.refId = ensureId(null);
	},

	oncreate(vnode) {
		vnode.state.api.registerThumb(vnode.attrs.index || 0, createRef(vnode.state.refId));
	},

	view(vnode) {
		const api = useSliderContext();
		vnode.state.api = api;
		const index = vnode.attrs.index || 0;
		const value = getSliderThumbValue(api.currentValue, index);

		return m(
			"view",
			{
				id: vnode.state.refId,
				style: {
					position: "absolute",
					top: "50%",
					left: `${getVisualRatio(value, api.enableRTL) * 100}%`,
					transform: "translate(-50%, -50%)",
				},
				ontouchstart: () => api.onThumbInteractionStart(index),
			},
			m(
				"view",
				{
					class: cx(vnode.attrs.className, {
						"ui-active": api.active && api.activeThumbIndex === index,
						"ui-disabled": api.disabled,
					}),
					style: vnode.attrs.style,
				},
				vnode.children,
			),
		);
	},
};

export const SliderIndicator = {
	oninit(vnode) {
		vnode.state.refId = ensureId(null);
	},

	oncreate(vnode) {
		vnode.state.api.registerIndicator(createRef(vnode.state.refId));
	},

	view(vnode) {
		const api = useSliderContext();
		vnode.state.api = api;
		const { offset, size } = getSliderIndicatorGeometry(api.currentValue);

		return m(
			"view",
			{
				id: vnode.state.refId,
				style: Object.assign(
					{ position: "absolute", top: "0px", bottom: "0px", overflow: "visible" },
					api.enableRTL ? { right: `${offset * 100}%` } : { left: `${offset * 100}%` },
					{ width: `${size * 100}%` },
				),
			},
			m("view", { class: cx(vnode.attrs.className, { "ui-active": api.active, "ui-disabled": api.disabled }), style: vnode.attrs.style }),
		);
	},
};
