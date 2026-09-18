// Ambient declaration for the ESM layout.js (the file itself is not
// type-checked; this describes its runtime export shape for TS consumers).

import type { Component } from "mithril-runtime";

type StyleAttrs = Record<string, string | number>;
type Align = "start" | "end" | "center" | "flex-start" | "flex-end" | "stretch" | "baseline";
type Justify = "start" | "end" | "center" | "flex-start" | "flex-end" | "space-between" | "space-around" | "space-evenly";

export interface BoxAttrs {
  className?: string;
  style?: StyleAttrs;
  /** Extra raw <view> attributes, spread onto the root element. */
  boxProps?: Record<string, unknown>;
}

export declare const Box: Component<BoxAttrs>;

export interface StackAttrs {
  className?: string;
  style?: StyleAttrs;
  /** Defaults to "column". */
  direction?: "row" | "column";
  /** Appends "-reverse" to the resolved direction. Defaults to false. */
  reverse?: boolean;
  /** Switches the container from `display: linear` (default, no wrapping) to `display: flex` so `flex-wrap: wrap` can take effect. Defaults to false. */
  wrap?: boolean;
  /** Pixels. Sets `gap` on both axes unless rowGap/columnGap override one. */
  gap?: number;
  rowGap?: number;
  columnGap?: number;
  /** Cross-axis alignment (`align-items`). */
  align?: Align;
  /** Main-axis alignment (`justify-content`). */
  justify?: Justify;
  stackProps?: Record<string, unknown>;
}

export declare const Stack: Component<StackAttrs>;
/** `Stack` pinned to `direction: "row"`. */
export declare const Row: Component<Omit<StackAttrs, "direction">>;
/** `Stack` pinned to `direction: "column"` (Stack's own default). */
export declare const Column: Component<Omit<StackAttrs, "direction">>;

export interface CenterAttrs {
  className?: string;
  style?: StyleAttrs;
  centerProps?: Record<string, unknown>;
}

/** Centers its single child on both axes. */
export declare const Center: Component<CenterAttrs>;

export interface SpacerAttrs {
  className?: string;
  style?: StyleAttrs;
  spacerProps?: Record<string, unknown>;
}

/** A flexible filler that grows to push its Stack siblings apart. Works inside both a plain (linear) and a `wrap`-enabled (flex) Stack. */
export declare const Spacer: Component<SpacerAttrs>;

export interface ZStackAttrs {
  className?: string;
  /** The container needs an explicit width/height here (or from a non-absolutely-positioned sibling) — see the .js file's own header for why. */
  style?: StyleAttrs;
  zStackProps?: Record<string, unknown>;
}

/** Overlapping (z-index-style) children, stacked in DOM order — last child on top. Each layer fills the container. */
export declare const ZStack: Component<ZStackAttrs>;

export interface GridAttrs {
  className?: string;
  style?: StyleAttrs;
  /** A track count (shorthand for `repeat(n, 1fr)`) or a raw `grid-template-columns` string. */
  columns?: number | string;
  /** A track count (shorthand for `repeat(n, 1fr)`) or a raw `grid-template-rows` string. */
  rows?: number | string;
  autoColumns?: string;
  autoRows?: string;
  autoFlow?: "row" | "column" | "dense" | "row dense" | "column dense";
  /** Pixels. Sets `gap` on both axes unless rowGap/columnGap override one. */
  gap?: number;
  rowGap?: number;
  columnGap?: number;
  /** Aligns the whole track set when it doesn't fill the container (inline/horizontal axis). */
  justifyContent?: Justify | "stretch";
  /** Aligns the whole track set when it doesn't fill the container (block/vertical axis). */
  alignContent?: Justify | "stretch";
  /** Per-item default alignment within its own cell (inline/horizontal axis). */
  justifyItems?: "stretch" | "start" | "center" | "end";
  /** Per-item default alignment within its own cell (block/vertical axis). */
  alignItems?: "stretch" | "start" | "center" | "end" | "flex-start" | "flex-end";
  gridProps?: Record<string, unknown>;
}

export declare const Grid: Component<GridAttrs>;

export interface GridItemAttrs {
  className?: string;
  style?: StyleAttrs;
  /** Explicit grid line number — the docs-verified placement path. */
  colStart?: number;
  /** Explicit grid line number. Takes precedence over colSpan when both are set. */
  colEnd?: number;
  /** Emits `grid-column-end: span N` — see the .js file's own header for the one caveat on this. */
  colSpan?: number;
  rowStart?: number;
  rowEnd?: number;
  rowSpan?: number;
  gridItemProps?: Record<string, unknown>;
}

/** Placement for one child of a Grid. */
export declare const GridItem: Component<GridItemAttrs>;

export interface DividerAttrs {
  className?: string;
  style?: StyleAttrs;
  /** Defaults to "horizontal" (fills width). "vertical" fills height instead. */
  orientation?: "horizontal" | "vertical";
  /** Pixels. Defaults to 1. */
  thickness?: number;
  dividerProps?: Record<string, unknown>;
}

export declare const Divider: Component<DividerAttrs>;

export interface AspectRatioAttrs {
  className?: string;
  style?: StyleAttrs;
  /** width / height. Defaults to 1 (square). */
  ratio?: number;
  aspectRatioProps?: Record<string, unknown>;
}

/** Reserves space by aspect ratio — image/video/card frames. */
export declare const AspectRatio: Component<AspectRatioAttrs>;
