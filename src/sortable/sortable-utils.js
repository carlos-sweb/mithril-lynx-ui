// Geometry-based sorting for a vertical list. Layout positions, not summed
// item heights, determine when a row crosses another row's midpoint. This
// keeps CSS gaps and unequal row heights from changing the drop threshold.

export function createSwapTracker() {
	return { lastSwappedKey: "" };
}

export function resetSwapTracker(tracker) {
	tracker.lastSwappedKey = "";
}

export function findSwapTarget(keyArray, slotMap, disabledKeys, sortingKey, movingDistance) {
	const originIndex = keyArray.indexOf(sortingKey);
	const origin = slotMap[sortingKey];
	if (originIndex < 0 || !origin || !Number.isFinite(origin.top) || !Number.isFinite(origin.height)) return "";

	const center = origin.top + origin.height / 2 + movingDistance;
	const direction = movingDistance > 0 ? 1 : -1;
	if (movingDistance === 0) return "";

	let target = "";
	for (let index = originIndex + direction; index >= 0 && index < keyArray.length; index += direction) {
		const key = keyArray[index];
		const slot = slotMap[key];
		if (!slot || !Number.isFinite(slot.top) || !Number.isFinite(slot.height)) break;
		const midpoint = slot.top + slot.height / 2;
		if (direction > 0 ? center < midpoint : center > midpoint) break;
		if (!disabledKeys[key]) target = key;
	}
	return target;
}

export function updateSwapTracking(tracker, { keyArray, slotMap, disabledKeys, sortingKey, movingDistance }) {
	tracker.lastSwappedKey = findSwapTarget(keyArray, slotMap, disabledKeys, sortingKey, movingDistance);
	const projected = sortKeyArray(keyArray, disabledKeys, sortingKey, tracker.lastSwappedKey);
	const writes = [];
	for (let index = 0; index < keyArray.length; index++) {
		const key = keyArray[index];
		if (key === sortingKey || disabledKeys[key]) continue;
		const targetIndex = projected.indexOf(key);
		const from = slotMap[key];
		const to = slotMap[keyArray[targetIndex]];
		writes.push({ key, translate: from && to ? to.top - from.top : 0 });
	}
	return writes;
}

/** Disabled rows retain their absolute slots; only movable rows reorder. */
export function sortKeyArray(keyArray, disabledKeys, sortingKey, swappedKey) {
	const draggingIndex = keyArray.indexOf(sortingKey);
	const swappedIndex = keyArray.indexOf(swappedKey);
	if (draggingIndex === -1 || swappedIndex === -1 || draggingIndex === swappedIndex) return keyArray.slice();

	const disabledAt = {};
	const movable = [];
	for (let i = 0; i < keyArray.length; i++) {
		const key = keyArray[i];
		if (disabledKeys[key]) disabledAt[i] = key;
		else movable.push(key);
	}
	const draggedIndex = movable.indexOf(sortingKey);
	const targetIndex = movable.indexOf(swappedKey);
	if (draggedIndex < 0 || targetIndex < 0) return keyArray.slice();
	const [dragged] = movable.splice(draggedIndex, 1);
	movable.splice(targetIndex, 0, dragged);

	const result = [];
	let cursor = 0;
	for (let i = 0; i < keyArray.length; i++) {
		result.push(disabledAt[i] === undefined ? movable[cursor++] : disabledAt[i]);
	}
	return result;
}
