import { describe, expect, it } from "@rstest/core";
import { cubicBezier, easeInOut } from "../src/swipe-action/easing.js";

describe("internal/easing.js", () => {
  it("easeInOut anchors both endpoints", () => {
    expect(easeInOut(0)).toBeCloseTo(0, 5);
    expect(easeInOut(1)).toBeCloseTo(1, 5);
  });

  it("easeInOut is the cubic-bezier(0, 0, 0.4, 1) curve — bows above the diagonal (fast start)", () => {
    expect(easeInOut(0.25)).toBeCloseTo(0.4635, 3);
    expect(easeInOut(0.5)).toBeCloseTo(0.766, 3);
    expect(easeInOut(0.75)).toBeCloseTo(0.9420, 3);
  });

  it("cubicBezier(t, 0, 0, 1, 1) is linear (identity)", () => {
    expect(cubicBezier(0.3, 0, 0, 1, 1)).toBeCloseTo(0.3, 5);
    expect(cubicBezier(0.7, 0, 0, 1, 1)).toBeCloseTo(0.7, 5);
  });
});
