// Ambient declaration for the ESM swipe-action.js (the file itself is not
// type-checked; this describes its runtime export shape for TS consumers).

import type { Component } from "mithril";

/** A plain object to receive the imperative API on mount. */
export interface SwipeActionRef {
  showActionArea(animated?: boolean): void;
  closeActionArea(animated?: boolean): void;
}

export interface SwipeActionAttrs {
  className?: string;
  style?: Record<string, string | number>;
  /** Content that stays visible; dragged horizontally to reveal actionArea. */
  displayArea?: unknown;
  /** Content revealed to the right as the user swipes left; tapping it fires onAction. */
  actionArea?: unknown;
  enableSwipe?: boolean;
  /** Rendered width before the real actionArea width is measured, to avoid a layout jump. */
  estimatedActionAreaSize?: number;
  iosEnableSimultaneousTouch?: boolean;
  onAction?: () => void;
  onSwipeStart?: () => void;
  onSwipeEnd?: () => void;
  /** A plain object to receive the imperative API on mount. */
  actionRef?: Partial<SwipeActionRef>;
}

export declare const SwipeAction: Component<SwipeActionAttrs>;
