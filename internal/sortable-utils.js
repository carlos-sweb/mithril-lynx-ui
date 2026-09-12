// internal/sortable-utils.js
//
// Port of lynx-ui-sortable's useSortable.tsx swap-tracking algorithm — the
// part that decides, as an item is dragged over its siblings, which sibling
// should visually swap places with it and by how much, plus the final
// re-sort once the drag ends. This is pure logic (no native calls), so it's
// ported close to verbatim, like internal/slider-utils.js.
//
// v1 simplification, documented here since it's the one real departure from
// the original: when the dragged item crosses over a DISABLED (locked)
// sibling, the original scales the eventual swap target's translate by a
// "speed multiplier" so it doesn't visually jump once the drag clears the
// disabled item. That easing is dropped here — disabled items are still
// correctly skipped as swap targets, still keep their own absolute position
// in the final sorted order, and the dragged item still correctly accounts
// for their size while walking past them (so the swap target found is the
// same one) — only that one frame of extra smoothing on the target's own
// translate is cut.

/**
 * Walks from `sortingKey`'s own position in `keyArray`, in the direction of
 * `movingDistance`, accumulating each neighbor's size (skipping disabled
 * ones without picking them) until the accumulated size reaches
 * `Math.abs(movingDistance)`. That neighbor is the swap candidate.
 *
 * @returns `{ index: -1 }` when no candidate is under the dragged item yet
 * (still within the first neighbor, or ran off the end of the list) — plus
 * `distance`, the unconsumed remainder for whichever item IS still being
 * tracked (see clampPrevious below).
 */
export function findSwapTarget(keyArray, sizeMap, disabledKeys, sortingKey, movingDistance) {
	const index = keyArray.indexOf(sortingKey);
	if (keyArray.length === 0 || index < 0) return { index: -1, distance: 0 };

	const absDistance = Math.abs(movingDistance);
	const direction = movingDistance > 0 ? 1 : -1;
	let currentIndex = index + direction;
	let accumulated = 0;

	while (true) {
		if (currentIndex < 0 || currentIndex >= keyArray.length) {
			return { index: -1, distance: direction * (absDistance - accumulated) };
		}
		const key = keyArray[currentIndex];
		const size = sizeMap[key];
		if (typeof size !== "number") {
			return { index: -1, distance: direction * accumulated };
		}
		if (disabledKeys[key]) {
			// The dragged item may cross a disabled item (consuming its size
			// toward the walk) but never picks it as the swap target.
			if (accumulated + size >= absDistance) {
				return { index: -1, distance: direction * accumulated };
			}
			accumulated += size;
			currentIndex += direction;
			continue;
		}
		accumulated += size;
		if (accumulated >= absDistance) {
			return { index: currentIndex, distance: direction * (accumulated - size) };
		}
		currentIndex += direction;
	}
}

export function createSwapTracker() {
	return { lastSwappingKey: "", lastSwappedKey: "", swappingItemTranslation: 0 };
}

export function resetSwapTracker(tracker) {
	tracker.lastSwappingKey = "";
	tracker.lastSwappedKey = "";
	tracker.swappingItemTranslation = 0;
}

/**
 * Advances the swap-tracking state machine by one drag-move sample, mutating
 * `tracker` in place. Returns the transform writes the caller should apply
 * this frame, as `{ key, translate }` pairs (the swap target's translate,
 * and — when the swap target just changed — a settle/clamp write for
 * whichever sibling was previously tracked).
 */
export function updateSwapTracking(tracker, { keyArray, sizeMap, disabledKeys, sortingKey, movingDistance, swapConfirmedPercentage = 0.5 }) {
	const writes = [];
	const draggingSize = sizeMap[sortingKey] ?? 0;
	const target = findSwapTarget(keyArray, sizeMap, disabledKeys, sortingKey, movingDistance);

	if (target.index < 0) {
		clampPrevious(tracker, target.distance, draggingSize, swapConfirmedPercentage, writes);
		return writes;
	}

	const swappingKey = keyArray[target.index];
	if (swappingKey !== tracker.lastSwappingKey) {
		clampPrevious(tracker, movingDistance, draggingSize, swapConfirmedPercentage, writes);
		tracker.lastSwappingKey = swappingKey;
	}

	const unconsumedDistance = movingDistance - target.distance;
	updateConfirmedSwap(tracker, keyArray, sortingKey, unconsumedDistance, draggingSize, swapConfirmedPercentage);

	writes.push({ key: swappingKey, translate: -unconsumedDistance });
	return writes;
}

function clampPrevious(tracker, movingDistance, draggingSize, threshold, writes) {
	if (!tracker.lastSwappingKey) return;
	const confirmed = Math.abs(tracker.swappingItemTranslation) > draggingSize * threshold;
	writes.push({ key: tracker.lastSwappingKey, translate: confirmed ? (movingDistance < 0 ? 1 : -1) * draggingSize : 0 });
}

function updateConfirmedSwap(tracker, keyArray, sortingKey, unconsumedDistance, draggingSize, threshold) {
	if (Math.abs(unconsumedDistance) > draggingSize * threshold) {
		tracker.lastSwappedKey = tracker.lastSwappingKey;
	} else if (tracker.lastSwappedKey === tracker.lastSwappingKey) {
		// Dragging back over an already-confirmed swap: re-derive the next
		// candidate one step closer to the drag's origin, so backing off
		// progressively un-confirms the swap instead of leaving it stuck.
		const swappingIndex = keyArray.indexOf(tracker.lastSwappingKey);
		const draggedIndex = keyArray.indexOf(sortingKey);
		const indexModifier = swappingIndex > draggedIndex ? -1 : 1;
		const newIndex = swappingIndex + indexModifier;
		if (newIndex >= 0 && newIndex < keyArray.length) {
			tracker.lastSwappedKey = newIndex === draggedIndex ? "" : keyArray[newIndex];
		} else {
			tracker.lastSwappedKey = "";
		}
	}
	tracker.swappingItemTranslation = unconsumedDistance;
}

/**
 * The final re-sort once a drag ends: moves `sortingKey` to sit where
 * `tracker.lastSwappedKey` is — the last CONFIRMED swap target, not
 * necessarily the one currently under the pointer (a drag that never
 * crossed the 50% threshold confirms nothing, and the list stays as-is).
 * Disabled items keep their absolute index in the result.
 */
export function sortKeyArray(keyArray, disabledKeys, sortingKey, swappedKey) {
	const draggingIndex = keyArray.indexOf(sortingKey);
	const swappedIndex = keyArray.indexOf(swappedKey);
	if (draggingIndex === -1 || swappedIndex === -1 || draggingIndex === swappedIndex) {
		return keyArray.slice();
	}

	const disabledAt = {};
	const movable = [];
	for (let i = 0; i < keyArray.length; i++) {
		const k = keyArray[i];
		if (disabledKeys[k]) disabledAt[i] = k;
		else movable.push(k);
	}
	const draggedMovableIndex = movable.indexOf(sortingKey);
	const swappedMovableIndex = movable.indexOf(swappedKey);
	if (draggedMovableIndex === -1 || swappedMovableIndex === -1) return keyArray.slice();

	const [dragged] = movable.splice(draggedMovableIndex, 1);
	movable.splice(swappedMovableIndex, 0, dragged);

	const result = [];
	let cursor = 0;
	for (let i = 0; i < keyArray.length; i++) {
		if (disabledAt[i] === undefined) {
			result.push(movable[cursor]);
			cursor++;
		} else {
			result.push(disabledAt[i]);
		}
	}
	return result;
}
