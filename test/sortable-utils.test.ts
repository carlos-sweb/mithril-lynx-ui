import { describe, expect, it } from "@rstest/core";
import { createSwapTracker, findSwapTarget, sortKeyArray, updateSwapTracking } from "../internal/sortable-utils.js";

const KEYS = ["a", "b", "c", "d"];
const SIZES = { a: 100, b: 100, c: 100, d: 100 };

describe("internal/sortable-utils.js", () => {
  describe("findSwapTarget", () => {
    it("targets the immediate neighbor while still within its own size", () => {
      expect(findSwapTarget(KEYS, SIZES, {}, "a", 40)).toEqual({ index: 1, distance: 0 });
      expect(findSwapTarget(KEYS, SIZES, {}, "a", 100)).toEqual({ index: 1, distance: 0 });
    });

    it("skips past a fully-crossed neighbor onto the next one", () => {
      expect(findSwapTarget(KEYS, SIZES, {}, "a", 150)).toEqual({ index: 2, distance: 100 });
    });

    it("works in the negative (upward) direction too", () => {
      const result = findSwapTarget(KEYS, SIZES, {}, "b", -40);
      expect(result.index).toBe(0);
      expect(Math.abs(result.distance)).toBe(0); // may be -0, arithmetically equal
    });

    it("reports no target when dragged past the end of the list", () => {
      expect(findSwapTarget(KEYS, SIZES, {}, "a", -40).index).toBe(-1);
      expect(findSwapTarget(KEYS, SIZES, {}, "d", 40).index).toBe(-1);
    });

    it("lets the dragged item cross a disabled sibling without targeting it", () => {
      const disabled = { b: true };
      // Still within disabled b's own span — no target yet.
      expect(findSwapTarget(KEYS, SIZES, disabled, "a", 50).index).toBe(-1);
      // Crosses all of b (100) and lands inside c — targets c, accounting for b's size.
      expect(findSwapTarget(KEYS, SIZES, disabled, "a", 150)).toEqual({ index: 2, distance: 100 });
    });
  });

  describe("updateSwapTracking", () => {
    it("confirms a swap once dragged past half the target's size, not before", () => {
      const tracker = createSwapTracker();
      const opts = { keyArray: KEYS, sizeMap: SIZES, disabledKeys: {}, sortingKey: "a" };

      updateSwapTracking(tracker, { ...opts, movingDistance: 40 });
      expect(tracker.lastSwappedKey).toBe(""); // 40 <= 50% of 100: not yet confirmed

      const writes = updateSwapTracking(tracker, { ...opts, movingDistance: 60 });
      expect(tracker.lastSwappedKey).toBe("b");
      expect(writes).toEqual([{ key: "b", translate: -60 }]);
    });

    it("un-confirms a swap when dragged back below the threshold", () => {
      const tracker = createSwapTracker();
      const opts = { keyArray: KEYS, sizeMap: SIZES, disabledKeys: {}, sortingKey: "a" };

      updateSwapTracking(tracker, { ...opts, movingDistance: 80 });
      expect(tracker.lastSwappedKey).toBe("b");

      updateSwapTracking(tracker, { ...opts, movingDistance: 10 });
      expect(tracker.lastSwappedKey).toBe(""); // back near the origin, not the neighbor before b either
    });

    it("clamps a since-passed target back to 0 once the drag moves on without confirming it", () => {
      const tracker = createSwapTracker();
      const opts = { keyArray: KEYS, sizeMap: SIZES, disabledKeys: {}, sortingKey: "a" };

      updateSwapTracking(tracker, { ...opts, movingDistance: 80 }); // confirms swap with b
      expect(tracker.lastSwappedKey).toBe("b");

      updateSwapTracking(tracker, { ...opts, movingDistance: 150 }); // now tracking c, not yet confirmed (50 <= 50%)
      expect(tracker.lastSwappingKey).toBe("c");
      expect(tracker.lastSwappedKey).toBe("b"); // still b — c was never confirmed

      const writes = updateSwapTracking(tracker, { ...opts, movingDistance: 10 }); // back near origin
      // c (tracked but never confirmed) clamps back to 0; the newly-retargeted b gets un-confirmed.
      expect(writes.find((w) => w.key === "c")).toEqual({ key: "c", translate: 0 });
      expect(tracker.lastSwappedKey).toBe("");
    });
  });

  describe("sortKeyArray", () => {
    it("moves the dragged item to sit where the swapped item is, pushing it forward", () => {
      expect(sortKeyArray(KEYS, {}, "a", "c")).toEqual(["b", "c", "a", "d"]);
    });

    it("is a no-op when there's no confirmed swap target", () => {
      expect(sortKeyArray(KEYS, {}, "a", "")).toEqual(KEYS);
    });

    it("keeps a disabled item's absolute index in the result", () => {
      expect(sortKeyArray(KEYS, { b: true }, "a", "c")).toEqual(["c", "b", "a", "d"]);
    });
  });
});
