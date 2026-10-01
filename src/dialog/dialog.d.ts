// Ambient declaration for the ESM dialog.js (the file itself is not
// type-checked; this describes its runtime export shape for TS consumers).

import type { Component } from "mithril-runtime";
import type { PresenceStatus } from "../presence/presence.js";

export interface DialogRootAttrs {
  /** Controlled mode when provided — defaultShow has no effect and you own show/close yourself. */
  show?: boolean;
  /** Uncontrolled starting value. Ignored when `show` is provided. */
  defaultShow?: boolean;
  /** Keep DialogView's children mounted even while closed (internal state stays "closed"). */
  forceMount?: boolean;
  /** Dismiss the topmost dialog on Android Back. False still consumes Back. Default true. */
  closeOnBack?: boolean;
  /** Skip built-in motion. Supply your application's reduced-motion preference. */
  reducedMotion?: boolean;
  /** Accessible node to focus after opening; defaults to the content view. */
  initialFocusId?: string;
  /** Accessible node to focus after closing; defaults to the last trigger. */
  restoreFocusId?: string;
  /** Fires before the dialog closes (backdrop click or DialogClose). Update your own `show` state here in controlled mode. */
  onShowChange?: (show: boolean) => void;
  /** Fires once the dialog is actually shown and any enter animation has finished. */
  onOpen?: () => void;
  /** Fires once the dialog is actually closed and any leave animation has finished. */
  onClose?: () => void;
  debugLog?: boolean;
  /** Plain children, or a function receiving the dialog's overall {entering, leaving, animating, open, closed} status. */
  children?: unknown | ((status: PresenceStatus) => unknown);
}

interface DialogButtonAttrs {
  /** Native attributes forwarded to the underlying Button view, including id and accessibility-label. */
  buttonProps?: Record<string, unknown>;
  /** Mithril-style class; combined with `className` when both are given. */
  class?: string;
  className?: string;
  style?: Record<string, string | number>;
  disabled?: boolean;
  /** Include animation state classes on the button. Off by default. */
  transition?: boolean;
  /** Plain children, or a function receiving {busy, active, disabled}. */
  children?: unknown | ((state: { busy: boolean; active: boolean; disabled: boolean }) => unknown);
}

export type DialogTriggerAttrs = DialogButtonAttrs;
export type DialogCloseAttrs = DialogButtonAttrs;

export interface DialogViewAttrs {
  /** Safety deadline in milliseconds for missing animation events. Default 500; increase for custom long animations. */
  animationTimeout?: number;
  /** Mithril-style class; combined with `className` when both are given. */
  class?: string;
  className?: string;
  style?: Record<string, string | number>;
  transition?: boolean;
  /**
   * Not implemented — accepted and ignored. The real component swaps in a
   * native `<overlay>` for showing a dialog outside the current LynxView
   * entirely; every app this project targets so far renders in the same
   * surface, where a plain `position:fixed` view (what this always renders)
   * already achieves the same visual effect with no portal needed.
   */
  container?: string;
  overlayLevel?: 1 | 2 | 3 | 4;
  debugLog?: boolean;
  /** Spread onto the underlying view — z-index, native props, etc. */
  dialogViewProps?: Record<string, unknown>;
  /** DialogBackdrop and/or DialogContent — each becomes its own Presence, tracked and combined into one group state. */
  children?: unknown;
}

export interface DialogBackdropAttrs {
  /** Default dim. Blur requires native blur-view support and captureTarget. */
  variant?: "dim" | "blur" | "transparent";
  /** Scrim color, including alpha. Overrides the theme color. */
  color?: string;
  /** Native blur length. Default "12px". */
  blurRadius?: string;
  /** Raw id (without #) of a separate background view with flatten="false". */
  captureTarget?: string;
  /** Extra native blur-view attributes. Required capture and radius attributes remain owned by the component. */
  blurViewProps?: Record<string, unknown>;
  /** Mithril-style class; combined with `className` when both are given. */
  class?: string;
  className?: string;
  style?: Record<string, string | number>;
  /** Enable animation classes. Default true; reducedMotion on DialogRoot overrides it. */
  transition?: boolean;
  /** @defaultValue true */
  clickToClose?: boolean;
  dialogBackdropProps?: Record<string, unknown>;
  onClick?: () => void;
  children?: unknown;
}

export interface DialogContentAttrs {
  accessibilityLabel?: string;
  /** Mithril-style class; combined with `className` when both are given. */
  class?: string;
  className?: string;
  style?: Record<string, string | number>;
  /** Enable animation classes. Default true; reducedMotion on DialogRoot overrides it. */
  transition?: boolean;
  dialogContentProps?: Record<string, unknown>;
  children?: unknown;
}

export declare const DialogRoot: Component<DialogRootAttrs>;
export declare const DialogTrigger: Component<DialogTriggerAttrs>;
export declare const DialogClose: Component<DialogCloseAttrs>;
export declare const DialogView: Component<DialogViewAttrs>;
export declare const DialogBackdrop: Component<DialogBackdropAttrs>;
export declare const DialogContent: Component<DialogContentAttrs>;
export interface DialogBodyAttrs {
  class?: string;
  className?: string;
  height?: string;
  style?: Record<string, string | number>;
  scrollViewProps?: Record<string, unknown>;
  children?: unknown;
}
/** Bounded vertical body scroll, keeping sibling titles/actions visible. */
export declare const DialogBody: Component<DialogBodyAttrs>;
/** Returns true when a dialog consumed Back. Call before route.back(). */
export declare function handleDialogBack(): boolean;
/** Calls listener immediately and when modal Back availability changes. Returns unsubscribe. */
export declare function subscribeDialogVisibility(listener: (visible: boolean) => void): () => void;
