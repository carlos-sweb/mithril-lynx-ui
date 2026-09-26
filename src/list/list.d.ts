// Ambient declaration for the ESM list.js (the file itself is not
// type-checked; this describes its runtime export shape for TS consumers).

import type { Component } from "mithril";

/** One entry of `getVisibleCells()` / scroll events' `attachedCells`. */
export interface ListCellInfo {
  id: number;
  itemKey: string;
  index: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Imperative handle, filled in on mount. Pass a plain object as `listRef`. */
export interface ListRef {
  /** Native `scrollToPosition`. `itemKey`, when given, wins over `position`. */
  scrollToPosition(params: { position: number; alignTo: "top" | "bottom" | "middle"; offset?: number; itemKey?: string; smooth?: boolean }): Promise<unknown>;
  /** Scrolls by `offset` px from the current position. */
  scrollBy(offset: number): Promise<{ consumedX: number; consumedY: number; unconsumedX: number; unconsumedY: number }>;
  /** Starts or pauses auto-scrolling. `rate` is a distance per second, e.g. "60px". */
  autoScroll(params: { rate: string; start: boolean; autoStop?: boolean }): Promise<unknown>;
  /** The currently attached (visible) cells. */
  getVisibleCells(): Promise<{ attachedCells: ListCellInfo[] } | ListCellInfo[]>;
  /** Shorthand kept from the previous API: scrolls to `index`. */
  scrollTo(index: number, options?: { smooth?: boolean; offset?: number; alignTo?: "top" | "bottom" | "middle" }): Promise<unknown>;
}

/** Per-item native attributes, sent to native before the item renders. */
export interface ListItemAttrs {
  "full-span"?: boolean;
  "sticky-top"?: boolean;
  "sticky-bottom"?: boolean;
  "estimated-main-axis-size-px"?: number;
  /** Items only reuse native cells with the same identifier. */
  "reuse-identifier"?: string;
  /** `false` keeps the item alive when it scrolls out of view. */
  recyclable?: boolean;
  [attr: string]: unknown;
}

export interface ListAttrs<T = unknown> {
  /** Mithril-style class; combined with `className` when both are given. */
  class?: string;
  className?: string;
  /** Required in practice: a native <list> only scrolls once it has an explicit size. */
  style?: Record<string, string | number>;
  items: T[];
  /** Returns the vnode for one item. Runs on the background thread, like view(). */
  renderItem: (item: T, index: number) => unknown;
  /** A unique, stable key per item — becomes both the Mithril `key` and native `item-key`.
   * Without it items are keyed by index (a warning is logged once). */
  getItemKey?: (item: T, index: number) => string | number;
  /** Per-item native attributes (full-span, sticky-top, estimated size, reuse-identifier, …). */
  getItemAttrs?: (item: T, index: number) => ListItemAttrs | null | undefined;
  /** @defaultValue "vertical" */
  scrollOrientation?: "vertical" | "horizontal";
  /** @defaultValue "single" */
  listType?: "single" | "flow" | "waterfall";
  /** @defaultValue 1 */
  spanCount?: number;
  /** Pixel gap between items along the scroll direction. @defaultValue 0 */
  mainAxisGap?: number;
  /** Pixel gap between items across the scroll direction. @defaultValue 0 */
  crossAxisGap?: number;
  /** A plain object to receive the imperative API on mount. */
  listRef?: Partial<ListRef>;
  /** Stable native id for selector queries; one is generated if omitted. */
  id?: string;

  // Every other native <list> attribute passes straight through, with its real type.
  "enable-scroll"?: boolean;
  "enable-nested-scroll"?: boolean;
  sticky?: boolean;
  "sticky-offset"?: number;
  bounces?: boolean;
  "initial-scroll-index"?: number;
  "need-visible-item-info"?: boolean;
  "upper-threshold-item-count"?: number;
  "lower-threshold-item-count"?: number;
  "scroll-event-throttle"?: number;
  "item-snap"?: { factor: number; offset: number };
  "update-animation"?: "default" | "none";
  "need-layout-complete-info"?: boolean;
  "layout-id"?: number;
  "preload-buffer-count"?: number;
  "scroll-bar-enable"?: boolean;
  "harmony-scroll-edge-effect"?: boolean;
  "experimental-recycle-sticky-item"?: boolean;

  // Native events (the `detail` shapes are documented in lynxjs.org's <list> reference).
  onscroll?: (e: { detail: unknown }) => void;
  onscrolltoupper?: (e: { detail: unknown }) => void;
  onscrolltolower?: (e: { detail: unknown }) => void;
  onscrollstatechange?: (e: { detail: { state: 1 | 2 | 3 | 4 } }) => void;
  onlayoutcomplete?: (e: { detail: unknown }) => void;
  onsnap?: (e: { detail: unknown }) => void;

  [attr: string]: unknown;
}

export declare const List: Component<ListAttrs>;
