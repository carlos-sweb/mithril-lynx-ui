// Ambient declaration for the ESM dialog.js (the file itself is not
// type-checked; this describes its runtime export shape for TS consumers).

import type { Component } from "mithril";
import type { PresenceStatus } from "../presence/presence.js";

export interface DialogRootAttrs {
  /** Controlled mode when provided — defaultShow has no effect and you own show/close yourself. */
  show?: boolean;
  /** Uncontrolled starting value. Ignored when `show` is provided. */
  defaultShow?: boolean;
  /** Keep DialogView's children mounted even while closed (internal state stays "closed"). */
  forceMount?: boolean;
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
  className?: string;
  style?: Record<string, string | number>;
  disabled?: boolean;
  /** Include ui-entering/ui-leaving/ui-animating alongside ui-open/ui-closed — off by default. */
  transition?: boolean;
  /** Plain children, or a function receiving {busy, active, disabled}. */
  children?: unknown | ((state: { busy: boolean; active: boolean; disabled: boolean }) => unknown);
}

export type DialogTriggerAttrs = DialogButtonAttrs;
export type DialogCloseAttrs = DialogButtonAttrs;

export interface DialogViewAttrs {
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
  className?: string;
  style?: Record<string, string | number>;
  transition?: boolean;
  /** @defaultValue true */
  clickToClose?: boolean;
  dialogBackdropProps?: Record<string, unknown>;
  onClick?: () => void;
  children?: unknown;
}

export interface DialogContentAttrs {
  className?: string;
  style?: Record<string, string | number>;
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
