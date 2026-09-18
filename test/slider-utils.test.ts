import { describe, expect, it } from "@rstest/core";
import {
  areSliderValuesEqual,
  getClosestSliderThumbIndex,
  getDraggedSliderThumbIndex,
  getSliderIndicatorGeometry,
  isSliderRangeValue,
  isSliderValueCollapsed,
  normalizeSliderValue,
  resolveSliderDrag,
  snapToStep,
  updateSliderValue,
} from "../src/slider/slider-utils.js";

describe("slider-utils.js", () => {
  it("snapToStep rounds to the nearest multiple", () => {
    expect(snapToStep(0.23, 0.1)).toBeCloseTo(0.2, 5);
    expect(snapToStep(0.27, 0.1)).toBeCloseTo(0.3, 5);
    expect(snapToStep(0.5, undefined)).toBe(0.5);
  });

  it("normalizeSliderValue handles both plain and range values", () => {
    expect(normalizeSliderValue(1.5)).toBe(1);
    expect(normalizeSliderValue(-0.5)).toBe(0);
    expect(normalizeSliderValue([0.6, 0.2])).toEqual([0.2, 0.6]); // swapped into order
  });

  it("isSliderRangeValue distinguishes a tuple from a plain number", () => {
    expect(isSliderRangeValue([0.2, 0.6])).toBe(true);
    expect(isSliderRangeValue(0.5)).toBe(false);
    expect(isSliderRangeValue([0.2])).toBe(false);
  });

  it("isSliderValueCollapsed is true only when a range's thumbs coincide", () => {
    expect(isSliderValueCollapsed([0.3, 0.3])).toBe(true);
    expect(isSliderValueCollapsed([0.3, 0.5])).toBe(false);
    expect(isSliderValueCollapsed(0.3)).toBe(false);
  });

  it("updateSliderValue never lets a thumb cross the other", () => {
    expect(updateSliderValue([0.3, 0.6], 0, 0.9)).toEqual([0.6, 0.6]);
    expect(updateSliderValue([0.3, 0.6], 1, 0.1)).toEqual([0.3, 0.3]);
  });

  it("getClosestSliderThumbIndex picks whichever thumb the target is nearer to", () => {
    expect(getClosestSliderThumbIndex([0.2, 0.8], 0.3)).toBe(0);
    expect(getClosestSliderThumbIndex([0.2, 0.8], 0.7)).toBe(1);
  });

  it("getClosestSliderThumbIndex prefers the given index on an exact tie", () => {
    expect(getClosestSliderThumbIndex([0.2, 0.8], 0.5, 1)).toBe(1);
    expect(getClosestSliderThumbIndex([0.2, 0.8], 0.5, 0)).toBe(0);
  });

  it("a collapsed range picks a thumb by which direction it's dragged", () => {
    // Both thumbs sit at 0.5; dragging left/right decides which one moves.
    expect(getDraggedSliderThumbIndex([0.5, 0.5], 0.3, undefined, undefined, true)).toBe(0);
    expect(getDraggedSliderThumbIndex([0.5, 0.5], 0.7, undefined, undefined, true)).toBe(1);
  });

  it("resolveSliderDrag reports the resolved value and which thumb moved", () => {
    const resolution = resolveSliderDrag([0.2, 0.8], 0.3);
    expect(resolution.activeThumbIndex).toBe(0);
    expect(resolution.value).toEqual([0.3, 0.8]);
  });

  it("getSliderIndicatorGeometry: a plain value fills from 0; a range fills between thumbs", () => {
    expect(getSliderIndicatorGeometry(0.4)).toEqual({ offset: 0, size: 0.4 });
    expect(getSliderIndicatorGeometry([0.2, 0.7])).toEqual({ offset: 0.2, size: 0.5 });
  });

  it("areSliderValuesEqual doesn't confuse a range with a plain value", () => {
    expect(areSliderValuesEqual(0.5, 0.5)).toBe(true);
    expect(areSliderValuesEqual([0.2, 0.6], [0.2, 0.6])).toBe(true);
    expect(areSliderValuesEqual(0.5, [0.5, 0.5] as never)).toBe(false);
  });
});
