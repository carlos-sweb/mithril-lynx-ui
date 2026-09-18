// Ambient declaration for the ESM draggable.js (the file itself is not
// type-checked; this describes its runtime export shape for TS consumers).

import type { Component } from "mithril";

export interface Point {
  x: number;
  y: number;
}

export type BasicDirection = "left" | "right" | "up" | "down";
export type AllowedDirection = "all" | "none" | BasicDirection | BasicDirection[];

/** Imperative handle, filled in on mount. */
export interface DraggableRef {
  setTransform(x: number, y: number): void;
  getTranslate(): Point;
}

export interface DraggableAttrs {
  className?: string;
  style?: Record<string, string | number>;
  /** A plain object to receive the imperative API on mount. */
  draggableRef?: Partial<DraggableRef>;
  /** Defaults to true. When false no handlers are attached at all. */
  enableDragging?: boolean;
  /** What begins a drag. Defaults to "longpress", matching lynx-ui. */
  trigger?: "longpress" | "immediate";
  /** Snap back to the origin when the drag ends. Defaults to false. */
  resetOnEnd?: boolean;
  /** Which way it may move. Explicit min/max below override this. Defaults to "all". */
  allowedDirection?: AllowedDirection;
  minTranslateX?: number;
  maxTranslateX?: number;
  minTranslateY?: number;
  maxTranslateY?: number;
  onDragStart?: (pagePoint: Point) => void;
  /** Fires per move with the current translate — the position itself is applied directly to the node. */
  onDragging?: (translate: Point) => void;
  onDragEnd?: (translate: Point) => void;
  /** Extra raw <view> attributes. */
  draggableProps?: Record<string, unknown>;
}

export declare const Draggable: Component<DraggableAttrs>;
