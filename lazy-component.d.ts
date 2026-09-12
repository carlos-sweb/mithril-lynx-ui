// Ambient declaration for the ESM lazy-component.js (the file itself is not
// type-checked; this describes its runtime export shape for TS consumers).

import type { Component } from "mithril";

export interface LazyComponentAttrs {
  className?: string;
  style?: Record<string, string | number>;
  /** Unique exposure id — must be unique across the whole page. */
  pid: string;
  /** Exposure scene name — pairs with pid to identify this node's exposure events. */
  scene: string;
  /** Size reserved for the placeholder before the real content has ever loaded. */
  estimatedStyle: Record<string, string | number>;
  /** Extends the node's own viewport-intersection margin. Defaults to "10px". */
  top?: string;
  bottom?: string;
  left?: string;
  right?: string;
  /** Unmount children again on exit, to save memory. Defaults to false. */
  unmountOnExit?: boolean;
  /** @deprecated Use unmountOnExit instead. */
  unloadable?: boolean;
  /** Not part of the original's API — added for observability. Fires every time the node appears, including re-appearances after unmountOnExit. */
  onAppear?: () => void;
  /**
   * Not part of the original's API — added for observability.
   * Without unmountOnExit, the exposure-tracking node disappears from the
   * tree entirely once shown (same as the original) — so this only ever
   * fires with unmountOnExit: true, which keeps that node mounted.
   */
  onDisappear?: () => void;
}

export declare const LazyComponent: Component<LazyComponentAttrs>;
