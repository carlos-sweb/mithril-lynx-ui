// Ambient declaration for the ESM swiper.js (the file itself is not
// type-checked; this describes its runtime export shape for TS consumers).

import type { Component } from "mithril";

/** A plain object to receive the imperative API on mount. */
export interface SwiperRef {
  swipeNext(): void;
  swipePrev(): void;
  swipeTo(index: number): void;
}

export interface SwiperAttrs<T = unknown> {
  className?: string;
  style?: Record<string, string | number>;
  trackClassName?: string;
  trackStyle?: Record<string, string | number>;
  items: T[];
  renderItem(item: T, index: number): unknown;
  itemKey?(item: T, index: number): string | number;
  /** Required — no auto-measurement (see the file header for why). */
  itemWidth: number;
  /** Required — no auto-measurement (see the file header for why). */
  itemHeight: number;
  /** Visible viewport width. Defaults to itemWidth (one item visible at a time). */
  containerWidth?: number;
  spaceBetween?: number;
  initialIndex?: number;
  /** Fraction of itemWidth a drag must cross to advance/retreat one item. Default 0.2. */
  swipeThreshold?: number;
  /** Settle-animation duration in ms (a plain CSS transition — see the file header). Default 300. */
  duration?: number;
  autoPlay?: boolean;
  autoPlayInterval?: number;
  onChange?: (index: number) => void;
  onSwipeStart?: () => void;
  onSwipeEnd?: () => void;
  /** A plain object to receive the imperative API on mount. */
  swiperRef?: Partial<SwiperRef>;
}

export declare const Swiper: Component<SwiperAttrs>;
