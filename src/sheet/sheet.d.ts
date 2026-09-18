// Ambient declaration for the ESM sheet.js (the file itself is not
// type-checked; this describes its runtime export shape for TS consumers).

import type { Component } from "mithril";
import type { PresenceStatus } from "../presence/presence.js";

export type SheetSide = "top" | "bottom" | "left" | "right" | "start" | "end";

export interface SheetRootAttrs {
  /** Which edge the content slides in from. "start"/"end" resolve against enableRTL. @defaultValue "bottom" */
  side?: SheetSide;
  /** @defaultValue false */
  enableRTL?: boolean;
  /** Controlled mode when provided — defaultShow has no effect and you own show/close yourself. */
  show?: boolean;
  /** Uncontrolled starting value. Ignored when `show` is provided. */
  defaultShow?: boolean;
  /** Keep SheetView's children mounted even while closed (internal state stays "closed"). */
  forceMount?: boolean;
  /** Fires before the sheet closes (backdrop click, SheetClose, or a drag past dismissThreshold). Update your own `show` state here in controlled mode. */
  onShowChange?: (show: boolean) => void;
  /** Fires once the sheet is actually shown and any enter animation has finished. */
  onOpen?: () => void;
  /** Fires once the sheet is actually closed and any leave animation has finished. */
  onClose?: () => void;
  /**
   * Drag the content toward its closing edge to dismiss it. @defaultValue true
   * Not upstream's snap-point/rubber-band/spring physics system (not
   * ported — see sheet.js's own header) — a real native gesture (so it can
   * win against an ancestor scroll-view's own vertical scroll) that snaps
   * back instantly if `dismissThreshold` isn't met, no spring.
   */
  enableDragToClose?: boolean;
  /** Pixel distance (not upstream's fraction-of-sheet-size) past which a drag closes the sheet. @defaultValue 80 */
  dismissThreshold?: number;
  /** Plain children, or a function receiving the sheet's overall {entering, leaving, animating, open, closed} status. */
  children?: unknown | ((status: PresenceStatus) => unknown);
}

interface SheetButtonAttrs {
  className?: string;
  style?: Record<string, string | number>;
  disabled?: boolean;
  /** Include ui-entering/ui-leaving/ui-animating alongside ui-open/ui-closed — off by default. */
  transition?: boolean;
  /** Plain children, or a function receiving {busy, active, disabled}. */
  children?: unknown | ((state: { busy: boolean; active: boolean; disabled: boolean }) => unknown);
}

export type SheetTriggerAttrs = SheetButtonAttrs;
export type SheetCloseAttrs = SheetButtonAttrs;

export interface SheetViewAttrs {
  className?: string;
  style?: Record<string, string | number>;
  /** Spread onto the underlying view — z-index, native props, etc. */
  sheetViewProps?: Record<string, unknown>;
  /** SheetBackdrop and/or SheetContent — each becomes its own Presence, tracked and combined into one group state. */
  children?: unknown;
}

export interface SheetBackdropAttrs {
  className?: string;
  style?: Record<string, string | number>;
  transition?: boolean;
  /** @defaultValue true */
  clickToClose?: boolean;
  sheetBackdropProps?: Record<string, unknown>;
  onClick?: () => void;
  children?: unknown;
}

export interface SheetContentAttrs {
  className?: string;
  style?: Record<string, string | number>;
  transition?: boolean;
  /** CSS class for the inner (draggable, when enableDragToClose) layer — layout/sizing, not visuals. */
  innerClassName?: string;
  /** Inline styles for the inner layer — layout/sizing, not visuals (those go on `style`, applied to the moving/animated outer surface). */
  innerStyle?: Record<string, string | number>;
  sheetContentProps?: Record<string, unknown>;
  children?: unknown;
}

export interface SheetHandleAttrs {
  className?: string;
  style?: Record<string, string | number>;
  children?: unknown;
}

export declare const SheetRoot: Component<SheetRootAttrs>;
export declare const SheetTrigger: Component<SheetTriggerAttrs>;
export declare const SheetClose: Component<SheetCloseAttrs>;
export declare const SheetView: Component<SheetViewAttrs>;
export declare const SheetBackdrop: Component<SheetBackdropAttrs>;
export declare const SheetContent: Component<SheetContentAttrs>;
export declare const SheetHandle: Component<SheetHandleAttrs>;
