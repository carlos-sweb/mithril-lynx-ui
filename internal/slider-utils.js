// internal/slider-utils.js
//
// Direct port of @lynx-js/lynx-ui-slider's utils/index.ts (Apache-2.0 — see
// ../NOTICE). Every function here is already framework-agnostic in the
// original — no React import at all — so this file is close to a literal
// translation, not a redesign. It's what makes both a plain 0..1 slider and
// a two-thumb range slider work off the same value model: a range value is
// just a [number, number] tuple, and everything below either branches on
// Array.isArray or works uniformly on a plain number via the thumb-index-0
// convention.

const VALUE_EPSILON = 1e-12;

export function clamp01(value) {
	if (!Number.isFinite(value)) return 0;
	return Math.min(Math.max(value, 0), 1);
}

export function getVisualRatio(value, enableRTL) {
	return enableRTL ? 1 - value : value;
}

export function snapToStep(value, step) {
	if (step === undefined || !Number.isFinite(step) || step <= 0) return value;
	const snapped = Math.round(value / step) * step;
	const decimalCount = (String(step).split(".")[1] || "").length;
	return clamp01(Number.parseFloat(snapped.toFixed(decimalCount)));
}

export function isSliderRangeValue(value) {
	return Array.isArray(value) && value.length === 2 && typeof value[0] === "number" && typeof value[1] === "number";
}

export function cloneSliderValue(value) {
	return isSliderRangeValue(value) ? [value[0], value[1]] : value;
}

export function normalizeSliderRangeValue(value, step) {
	const first = snapToStep(clamp01(value[0]), step);
	const second = snapToStep(clamp01(value[1]), step);
	return first <= second ? [first, second] : [second, first];
}

export function isSliderValueCollapsed(value) {
	if (!isSliderRangeValue(value)) return false;
	const [lower, upper] = normalizeSliderRangeValue(value);
	return Math.abs(upper - lower) <= VALUE_EPSILON;
}

export function normalizeSliderValue(value, step) {
	if (isSliderRangeValue(value)) return normalizeSliderRangeValue(value, step);
	return snapToStep(clamp01(value), step);
}

export function areSliderValuesEqual(first, second) {
	const firstIsRange = isSliderRangeValue(first);
	const secondIsRange = isSliderRangeValue(second);
	if (firstIsRange !== secondIsRange) return false;
	if (!firstIsRange || !secondIsRange) return first === second;
	return first[0] === second[0] && first[1] === second[1];
}

export function getSliderThumbValue(value, index) {
	return isSliderRangeValue(value) ? value[index || 0] : value;
}

export function getInitialSliderThumbIndex(value, requestedIndex) {
	if (!isSliderRangeValue(value)) return 0;
	return requestedIndex;
}

export function getClosestSliderThumbIndex(value, targetValue, preferredIndex) {
	if (!isSliderRangeValue(value)) return 0;

	const [lower, upper] = normalizeSliderRangeValue(value);
	const target = clamp01(targetValue);

	if (lower === upper) {
		if (target < lower) return 0;
		if (target > upper) return 1;
		return preferredIndex ?? 0;
	}

	const lowerDistance = Math.abs(target - lower);
	const upperDistance = Math.abs(target - upper);

	if (Math.abs(lowerDistance - upperDistance) <= VALUE_EPSILON) return preferredIndex ?? 0;
	return lowerDistance < upperDistance ? 0 : 1;
}

export function getDraggedSliderThumbIndex(value, targetValue, activeIndex, preferredIndex, allowCollapsedDirectionChange) {
	if (!isSliderRangeValue(value)) return 0;

	const [lower, upper] = normalizeSliderRangeValue(value);
	const target = clamp01(targetValue);
	const movedAway = Math.abs(target - lower) > VALUE_EPSILON;

	if (allowCollapsedDirectionChange && isSliderValueCollapsed([lower, upper]) && movedAway) {
		return target < lower ? 0 : 1;
	}

	return activeIndex ?? getClosestSliderThumbIndex(value, target, preferredIndex);
}

export function updateSliderValue(value, index, nextValue, step) {
	if (!isSliderRangeValue(value)) return normalizeSliderValue(nextValue, step);

	const [lower, upper] = normalizeSliderRangeValue(value, step);
	const next = snapToStep(clamp01(nextValue), step);

	// The active thumb may meet the other thumb, but never crosses, swaps
	// with, or pushes it — thumb 0 is always <= thumb 1 by construction.
	if (index === 0) return [Math.min(next, upper), upper];
	return [lower, Math.max(next, lower)];
}

export function resolveSliderDrag(value, targetValue, options) {
	const opts = options || {};
	const activeThumbIndex = getDraggedSliderThumbIndex(
		value,
		targetValue,
		opts.activeThumbIndex,
		opts.preferredThumbIndex,
		opts.startedCollapsed,
	);
	const nextValue = updateSliderValue(value, activeThumbIndex, targetValue, opts.step);

	return {
		value: nextValue,
		dragStartValue: isSliderRangeValue(nextValue) ? nextValue : clamp01(targetValue),
		activeThumbIndex,
		startedCollapsed: isSliderRangeValue(nextValue) && isSliderValueCollapsed(nextValue) && opts.startedCollapsed === true,
	};
}

export function getSliderIndicatorGeometry(value) {
	if (isSliderRangeValue(value)) {
		const [lower, upper] = normalizeSliderRangeValue(value);
		return { offset: lower, size: Number.parseFloat((upper - lower).toFixed(12)) };
	}
	return { offset: 0, size: clamp01(value) };
}

/** Unwraps a touch/mouse event's x — Lynx nests it under `detail`, matching every other native element here. */
export function getTouchX(event) {
	const detail = event && typeof event === "object" ? event.detail : undefined;
	const x = detail && typeof detail === "object" ? detail.x : undefined;
	return Number(x);
}
