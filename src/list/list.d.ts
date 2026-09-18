// Ambient declaration for the ESM list.js (the file itself is not
// type-checked; this describes its runtime export shape for TS consumers).

import type { Component } from "mithril";

/** Imperative handle, filled in on mount. Pass a plain object as `listRef`. */
export interface ListRef {
  /** Jumps to the given item index. Always resolves { code, data } — check `code` yourself. */
  scrollTo(index: number, options?: { smooth?: boolean; offset?: number; alignTo?: "top" | "bottom" | "middle" }): Promise<{ code: number; data: unknown }>;
}

export interface ListAttrs<T = unknown> {
  className?: string;
  /** Required in practice: a native <list> only scrolls once it has an explicit size. */
  style?: Record<string, string | number>;
  items: T[];
  /** Must return a fresh vnode for the item's content; may be called more than once for the same item (native recycling). */
  renderItem(item: T, index: number): unknown;
  /** Defaults to String(index). Set on every item's native "item-key" — required by native, not just an identity hint. */
  itemKey?(item: T, index: number): string;
  /** @defaultValue "vertical" */
  scrollOrientation?: "vertical" | "horizontal";
  /** @defaultValue "single" */
  listType?: "single" | "flow";
  /** @defaultValue 1 */
  spanCount?: number;
  /** Pixel gap between items along the scroll direction. @defaultValue 0 */
  mainAxisGap?: number;
  /** Pixel gap between items across the scroll direction (columns, when spanCount > 1). @defaultValue 0 */
  crossAxisGap?: number;
  /** A plain object to receive the imperative API on mount. */
  listRef?: Partial<ListRef>;
}

export declare const List: Component<ListAttrs>;
