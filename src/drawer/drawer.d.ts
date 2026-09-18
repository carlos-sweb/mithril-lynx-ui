// Ambient declaration for the ESM drawer.js (the file itself is not
// type-checked; this describes its runtime export shape for TS consumers).
//
// drawer.js's own components are thin wrappers over sheet.js — these
// attrs interfaces mirror SheetRootAttrs/SheetBackdropAttrs/
// SheetContentAttrs from sheet.d.ts (see that file for the full
// explanation of each option); DrawerTrigger/DrawerClose/DrawerView are
// literally SheetTrigger/SheetClose/SheetView re-exported, so they use
// sheet.d.ts's own attrs types directly.

import type { Component } from "mithril";
import type { PresenceStatus } from "../presence/presence.js";
import type { SheetCloseAttrs, SheetTriggerAttrs, SheetViewAttrs } from "../sheet/sheet.js";

/** Drawers are edge navigation panels — top/bottom is Sheet's own territory, not exposed here. */
export type DrawerSide = "left" | "right" | "start" | "end";

export interface DrawerRootAttrs {
  /** Which edge the content slides in from. "start"/"end" resolve against enableRTL. @defaultValue "left" (Sheet's own default is "bottom" — this is the one thing Drawer overrides, still overridable by you). */
  side?: DrawerSide;
  /** @defaultValue false */
  enableRTL?: boolean;
  /** Controlled mode when provided — defaultShow has no effect and you own show/close yourself. */
  show?: boolean;
  /** Uncontrolled starting value. Ignored when `show` is provided. */
  defaultShow?: boolean;
  /** Keep DrawerView's children mounted even while closed (internal state stays "closed"). */
  forceMount?: boolean;
  /** Fires before the drawer closes (backdrop click, DrawerClose, or a drag past dismissThreshold). Update your own `show` state here in controlled mode. */
  onShowChange?: (show: boolean) => void;
  /** Fires once the drawer is actually shown and any enter animation has finished. */
  onOpen?: () => void;
  /** Fires once the drawer is actually closed and any leave animation has finished. */
  onClose?: () => void;
  /** Drag the content toward its closing edge to dismiss it — a real native gesture, snaps back instantly (no spring) short of dismissThreshold. @defaultValue true */
  enableDragToClose?: boolean;
  /** Pixel distance past which a drag closes the drawer. @defaultValue 80 */
  dismissThreshold?: number;
  /** Plain children, or a function receiving the drawer's overall {entering, leaving, animating, open, closed} status. */
  children?: unknown | ((status: PresenceStatus) => unknown);
}

export type DrawerTriggerAttrs = SheetTriggerAttrs;
export type DrawerCloseAttrs = SheetCloseAttrs;
export type DrawerViewAttrs = SheetViewAttrs;

export interface DrawerBackdropAttrs {
  className?: string;
  style?: Record<string, string | number>;
  transition?: boolean;
  /** @defaultValue true */
  clickToClose?: boolean;
  sheetBackdropProps?: Record<string, unknown>;
  onClick?: () => void;
  children?: unknown;
}

export interface DrawerContentAttrs {
  className?: string;
  /** Width lives here (or on innerStyle) — a left/right Sheet's own positioning never sets one; css/drawer.css's "ui-drawer-content" class gives you a sensible 280px default. */
  style?: Record<string, string | number>;
  transition?: boolean;
  /** CSS class for the inner (draggable, when enableDragToClose) layer — layout/sizing, not visuals. */
  innerClassName?: string;
  /** Inline styles for the inner layer — layout/sizing, not visuals (those go on `style`). */
  innerStyle?: Record<string, string | number>;
  sheetContentProps?: Record<string, unknown>;
  children?: unknown;
}

export declare const DrawerRoot: Component<DrawerRootAttrs>;
export declare const DrawerTrigger: Component<DrawerTriggerAttrs>;
export declare const DrawerClose: Component<DrawerCloseAttrs>;
export declare const DrawerView: Component<DrawerViewAttrs>;
export declare const DrawerBackdrop: Component<DrawerBackdropAttrs>;
export declare const DrawerContent: Component<DrawerContentAttrs>;
