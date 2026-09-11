// Ambient declaration for the ESM slider.js (the file itself is not
// type-checked; this describes its runtime export shape for TS consumers).

import type { Component } from "mithril";

export type SliderThumbIndex = 0 | 1;
export type SliderRangeValue = [number, number];
export type SliderValue = number | SliderRangeValue;
export type SliderValueChangeSource = "drag" | "external";

export interface SliderUpdateValueOptions {
  source?: SliderValueChangeSource;
  /** Bypass the "ignore external updates while dragging" guard. */
  force?: boolean;
}

/** Imperative handle, filled in on mount. Only usable in uncontrolled mode (throws otherwise). */
export interface SliderRef {
  updateValue(value: SliderValue, options?: SliderUpdateValueOptions): void;
  getValue(): SliderValue;
}

export interface SliderRootAttrs {
  className?: string;
  style?: Record<string, string | number>;
  /** Supplying this makes the Slider controlled; `defaultValue` is then ignored. */
  value?: SliderValue;
  /** Initial value in uncontrolled mode. A plain number for a single thumb, a [lower, upper] tuple for a range. */
  defaultValue?: SliderValue;
  /** Snaps to multiples of this (0..1 scale). */
  step?: number;
  disabled?: boolean;
  enableRTL?: boolean;
  onDragging?: (value: SliderValue) => void;
  onValueChange?: (value: SliderValue, source: SliderValueChangeSource) => void;
  onValueCommit?: (value: SliderValue) => void;
  /** A plain object to receive the imperative API on mount. */
  sliderRef?: Partial<SliderRef>;
}

export interface SliderPartAttrs {
  className?: string;
  style?: Record<string, string | number>;
}

export interface SliderThumbAttrs extends SliderPartAttrs {
  /** Which thumb this is in range mode. Defaults to 0. */
  index?: SliderThumbIndex;
}

export declare const SliderRoot: Component<SliderRootAttrs>;
export declare const SliderTrack: Component<SliderPartAttrs>;
export declare const SliderThumb: Component<SliderThumbAttrs>;
export declare const SliderIndicator: Component<SliderPartAttrs>;
