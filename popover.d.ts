// Ambient declaration for the ESM popover.js (the file itself is not
// type-checked; this describes its runtime export shape for TS consumers).

import type { Component } from "mithril";

export type PopoverSide = "top" | "bottom" | "left" | "right";
export type PopoverAlignment = "start" | "end";
export type PopoverPlacement = PopoverSide | `${PopoverSide}-${PopoverAlignment}`;

export interface PopoverRootAttrs {
  /** Controlled mode when provided — defaultShow has no effect and you own show/close yourself. */
  show?: boolean;
  /** Uncontrolled starting value. Ignored when `show` is provided. */
  defaultShow?: boolean;
  /** Keep the positioner's children mounted even while closed (internal state stays "closed"). */
  forceMount?: boolean;
  /** Fires before the popover closes (backdrop click) or opens/closes (trigger tap). Update your own `show` state here in controlled mode. */
  onShowChange?: (show: boolean) => void;
  /** Fires once the popover is actually shown, positioned, and any enter animation has finished. */
  onOpen?: () => void;
  /** Fires once the popover is actually closed and any leave animation has finished. */
  onClose?: () => void;
  children?: unknown;
}

export interface PopoverTriggerAttrs {
  className?: string;
  style?: Record<string, string | number>;
  disabled?: boolean;
  /** Include ui-entering/ui-leaving/ui-animating alongside ui-open/ui-closed — off by default. */
  transition?: boolean;
  onClick?: () => void;
  /** Plain children, or a function receiving {busy, active, disabled}. */
  children?: unknown | ((state: { busy: boolean; active: boolean; disabled: boolean }) => unknown);
}

export interface PopoverAnchorAttrs {
  className?: string;
  style?: Record<string, string | number>;
  /** The element the popover positions itself against instead of PopoverTrigger, once this is used at all. */
  children?: unknown;
}

export interface PopoverBackdropAttrs {
  className?: string;
  style?: Record<string, string | number>;
  transition?: boolean;
  onClick?: () => void;
  popoverBackdropProps?: Record<string, unknown>;
}

export interface PopoverPositionerAttrs {
  /** Which side of the reference element the content appears on, optionally with -start/-end alignment. @defaultValue "bottom" */
  placement?: PopoverPlacement;
  /** Pixel gap between the reference element and the floating content. @defaultValue 0 */
  placementOffset?: number;
  className?: string;
  style?: Record<string, string | number>;
  transition?: boolean;
  popoverPositionerProps?: Record<string, unknown>;
  /** Typically a PopoverContent, optionally alongside a PopoverArrow. */
  children?: unknown;
}

export interface PopoverContentAttrs {
  className?: string;
  style?: Record<string, string | number>;
  transition?: boolean;
  popoverContentProps?: Record<string, unknown>;
  children?: unknown;
}

export interface PopoverArrowAttrs {
  /** Triangle size in pixels. @defaultValue 8 */
  size?: number;
  color?: string;
  className?: string;
  style?: Record<string, string | number>;
  transition?: boolean;
}

export declare const PopoverRoot: Component<PopoverRootAttrs>;
export declare const PopoverTrigger: Component<PopoverTriggerAttrs>;
export declare const PopoverAnchor: Component<PopoverAnchorAttrs>;
export declare const PopoverBackdrop: Component<PopoverBackdropAttrs>;
export declare const PopoverPositioner: Component<PopoverPositionerAttrs>;
export declare const PopoverContent: Component<PopoverContentAttrs>;
export declare const PopoverArrow: Component<PopoverArrowAttrs>;
