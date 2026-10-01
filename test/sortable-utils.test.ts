import { describe, expect, it } from "@rstest/core";
import { createSwapTracker, findSwapTarget, sortKeyArray, updateSwapTracking } from "../src/sortable/sortable-utils.js";

const keys = ["a", "b", "c", "d"];
const slots = {
  a: { top: 0, height: 64 },
  b: { top: 68, height: 64 },
  c: { top: 136, height: 64 },
  d: { top: 204, height: 64 },
};

describe("sortable geometry", () => {
  it("does not confirm in the gap or before the next row's midpoint", () => {
    expect(findSwapTarget(keys, slots, {}, "b", -34)).toBe("");
    expect(findSwapTarget(keys, slots, {}, "b", -67)).toBe("");
    expect(findSwapTarget(keys, slots, {}, "b", -68)).toBe("a");
    expect(findSwapTarget(keys, slots, {}, "a", 67)).toBe("");
    expect(findSwapTarget(keys, slots, {}, "a", 68)).toBe("b");
  });

  it("uses actual row midpoints when heights differ", () => {
    const unequal = { a: { top: 0, height: 40 }, b: { top: 44, height: 100 }, c: { top: 148, height: 60 } };
    expect(findSwapTarget(["a", "b", "c"], unequal, {}, "a", 73)).toBe("");
    expect(findSwapTarget(["a", "b", "c"], unequal, {}, "a", 74)).toBe("b");
  });

  it("projects siblings into their new slots and restores them on reversal", () => {
    const tracker = createSwapTracker();
    expect(updateSwapTracking(tracker, { keyArray: keys, slotMap: slots, disabledKeys: {}, sortingKey: "a", movingDistance: 140 }))
      .toEqual([{ key: "b", translate: -68 }, { key: "c", translate: -68 }, { key: "d", translate: 0 }]);
    expect(tracker.lastSwappedKey).toBe("c");
    expect(updateSwapTracking(tracker, { keyArray: keys, slotMap: slots, disabledKeys: {}, sortingKey: "a", movingDistance: 10 }))
      .toEqual([{ key: "b", translate: 0 }, { key: "c", translate: 0 }, { key: "d", translate: 0 }]);
    expect(tracker.lastSwappedKey).toBe("");
  });

  it("keeps disabled rows fixed while crossing them", () => {
    const tracker = createSwapTracker();
    const writes = updateSwapTracking(tracker, { keyArray: keys, slotMap: slots, disabledKeys: { b: true }, sortingKey: "a", movingDistance: 136 });
    expect(tracker.lastSwappedKey).toBe("c");
    expect(writes).toEqual([{ key: "c", translate: -136 }, { key: "d", translate: 0 }]);
    expect(sortKeyArray(keys, { b: true }, "a", "c")).toEqual(["c", "b", "a", "d"]);
  });
});
