// Ambient declaration for the ESM sortable.js (the file itself is not
// type-checked; this describes its runtime export shape for TS consumers).

import type { Component } from "mithril";

export interface SortableData<T> {
  getSortingKey: () => string;
  dataItem: T;
}

export interface SortableRootAttrs<T> {
  data: SortableData<T>[];
  /** Renders one item. A named attr (not a JSX/positional child) — see sortable.js's header. */
  children: (item: SortableData<T>) => unknown;
  /** Whether sorting is enabled at all. Defaults to true. */
  enableSorting?: boolean;
  onSortStart?: () => void;
  /** Always called after a drag ends, whether the order changed or not. */
  onSortEnd: (sortedData: SortableData<T>[]) => void;
}

export interface SortableItemAttrs {
  className?: string;
  style?: Record<string, string | number>;
  sortingKey: string;
  /** Locks this item from being dragged or displaced; keeps its absolute position in the sorted result. Defaults to false. */
  disabled?: boolean;
}

/** Renders no element of its own — a Scope Provider wrapping `data.map(item => attrs.children(item))`. */
export declare const SortableRoot: Component<SortableRootAttrs<unknown>>;
export declare const SortableItem: Component<SortableItemAttrs>;
